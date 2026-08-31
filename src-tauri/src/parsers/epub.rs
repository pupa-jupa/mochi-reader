use std::{
    collections::HashMap,
    io::Read,
    path::{Component, Path, PathBuf},
};

use quick_xml::{
    Reader,
    encoding::Decoder,
    events::{BytesStart, Event},
};
use zip::ZipArchive;

use crate::domain::error::{AppError, AppResult};

use super::{ParsedBook, chapter, sanitize_book_html, title_from_path};

const MAX_EPUB_ENTRIES: usize = 5_000;
const MAX_CHAPTER_BYTES: u64 = 16 * 1024 * 1024;

pub fn parse(path: &Path) -> AppResult<ParsedBook> {
    let file = std::fs::File::open(path)?;
    let mut archive = ZipArchive::new(file).map_err(zip_error)?;
    if archive.len() > MAX_EPUB_ENTRIES {
        return Err(AppError::Validation {
            message: "EPUB содержит слишком много файлов.".to_string(),
        });
    }

    let container = read_entry(&mut archive, "META-INF/container.xml")?;
    let opf_path = find_rootfile(&container)?;
    let opf = read_entry(&mut archive, &opf_path)?;
    let package = parse_package(&opf)?;
    let base = Path::new(&opf_path)
        .parent()
        .unwrap_or_else(|| Path::new(""));
    let mut chapters = Vec::with_capacity(package.spine.len());

    for (index, idref) in package.spine.iter().enumerate() {
        let Some(href) = package.manifest.get(idref) else {
            continue;
        };
        let entry_path = resolve_entry(base, href)?;
        let source = read_entry(&mut archive, &entry_path)?;
        let clean = sanitize_book_html(&source);
        let title = first_heading(&source).unwrap_or_else(|| format!("Глава {}", index + 1));
        chapters.push(chapter(format!("chapter-{index}"), title, clean));
    }

    if chapters.is_empty() {
        return Err(AppError::Validation {
            message: "В EPUB не найдено читаемых глав.".to_string(),
        });
    }

    Ok(ParsedBook {
        title: package.title.or_else(|| Some(title_from_path(path))),
        chapters,
    })
}

struct Package {
    title: Option<String>,
    manifest: HashMap<String, String>,
    spine: Vec<String>,
}

fn find_rootfile(xml: &str) -> AppResult<String> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    loop {
        match reader.read_event() {
            Ok(Event::Start(event) | Event::Empty(event))
                if local_name(event.name().as_ref()) == b"rootfile" =>
            {
                if let Some(value) = attribute(&event, b"full-path", reader.decoder())? {
                    return validate_entry_name(&value);
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(xml_error("container.xml", error)),
            _ => {}
        }
    }
    Err(AppError::Validation {
        message: "В EPUB отсутствует путь к package document.".to_string(),
    })
}

fn parse_package(xml: &str) -> AppResult<Package> {
    let mut reader = Reader::from_str(xml);
    reader.config_mut().trim_text(true);
    let mut package = Package {
        title: None,
        manifest: HashMap::new(),
        spine: Vec::new(),
    };
    let mut in_title = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                let qualified_name = event.name();
                let name = local_name(qualified_name.as_ref());
                if name == b"title" {
                    in_title = true;
                }
                collect_package_element(&mut package, &event, name, reader.decoder())?;
            }
            Ok(Event::Empty(event)) => {
                let qualified_name = event.name();
                let name = local_name(qualified_name.as_ref());
                collect_package_element(&mut package, &event, name, reader.decoder())?;
            }
            Ok(Event::End(event)) if local_name(event.name().as_ref()) == b"title" => {
                in_title = false;
            }
            Ok(Event::Text(event)) if in_title && package.title.is_none() => {
                let value = event.decode().map_err(|error| AppError::Validation {
                    message: format!("Не удалось прочитать метаданные EPUB: {error}"),
                })?;
                if !value.trim().is_empty() {
                    package.title = Some(value.trim().to_string());
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => return Err(xml_error("package document", error)),
            _ => {}
        }
    }
    Ok(package)
}

fn collect_package_element(
    package: &mut Package,
    event: &BytesStart<'_>,
    name: &[u8],
    decoder: Decoder,
) -> AppResult<()> {
    if name == b"item" {
        if let (Some(id), Some(href)) = (
            attribute(event, b"id", decoder)?,
            attribute(event, b"href", decoder)?,
        ) {
            package.manifest.insert(id, href);
        }
    } else if name == b"itemref"
        && let Some(idref) = attribute(event, b"idref", decoder)?
    {
        package.spine.push(idref);
    }
    Ok(())
}

fn attribute(event: &BytesStart<'_>, key: &[u8], decoder: Decoder) -> AppResult<Option<String>> {
    for value in event.attributes() {
        let value = value.map_err(|error| AppError::Validation {
            message: format!("Повреждённый XML-атрибут EPUB: {error}"),
        })?;
        if local_name(value.key.as_ref()) == key {
            return value
                .decode_and_unescape_value(decoder)
                .map(|value| Some(value.into_owned()))
                .map_err(|error| AppError::Validation {
                    message: format!("Не удалось декодировать EPUB-атрибут: {error}"),
                });
        }
    }
    Ok(None)
}

fn read_entry(archive: &mut ZipArchive<std::fs::File>, name: &str) -> AppResult<String> {
    let mut entry = archive.by_name(name).map_err(zip_error)?;
    if entry.size() > MAX_CHAPTER_BYTES {
        return Err(AppError::Validation {
            message: format!("Раздел EPUB «{name}» слишком большой."),
        });
    }
    let mut content = String::with_capacity(entry.size() as usize);
    entry
        .read_to_string(&mut content)
        .map_err(|_| AppError::Validation {
            message: format!("Раздел EPUB «{name}» должен содержать UTF-8 текст."),
        })?;
    Ok(content)
}

fn resolve_entry(base: &Path, href: &str) -> AppResult<String> {
    let href = href.split('#').next().unwrap_or(href);
    let combined = base.join(href.replace('/', std::path::MAIN_SEPARATOR_STR));
    validate_entry_path(&combined)
}

fn validate_entry_name(value: &str) -> AppResult<String> {
    validate_entry_path(Path::new(
        &value.replace('/', std::path::MAIN_SEPARATOR_STR),
    ))
}

fn validate_entry_path(path: &Path) -> AppResult<String> {
    let mut safe = PathBuf::new();
    for component in path.components() {
        match component {
            Component::Normal(value) => safe.push(value),
            Component::CurDir => {}
            Component::ParentDir | Component::RootDir | Component::Prefix(_) => {
                return Err(AppError::Validation {
                    message: "EPUB пытается обратиться за пределы контейнера.".to_string(),
                });
            }
        }
    }
    Ok(safe.to_string_lossy().replace('\\', "/"))
}

pub fn first_heading(source: &str) -> Option<String> {
    let mut reader = Reader::from_str(source);
    reader.config_mut().trim_text(true);
    let mut heading: Option<Vec<u8>> = None;
    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => {
                let qualified_name = event.name();
                let name = local_name(qualified_name.as_ref());
                if matches!(name, b"h1" | b"h2" | b"h3" | b"title") {
                    heading = Some(name.to_vec());
                }
            }
            Ok(Event::Text(event)) if heading.is_some() => {
                if let Ok(value) = event.decode() {
                    let value = value.trim();
                    if !value.is_empty() {
                        return Some(value.chars().take(120).collect());
                    }
                }
            }
            Ok(Event::End(event)) => {
                if heading
                    .as_deref()
                    .is_some_and(|name| name == local_name(event.name().as_ref()))
                {
                    heading = None;
                }
            }
            Ok(Event::Eof) | Err(_) => break,
            _ => {}
        }
    }
    None
}

fn local_name(name: &[u8]) -> &[u8] {
    name.rsplit(|byte| *byte == b':').next().unwrap_or(name)
}

fn zip_error(error: zip::result::ZipError) -> AppError {
    AppError::Validation {
        message: format!("Не удалось прочитать EPUB-контейнер: {error}"),
    }
}

fn xml_error(context: &str, error: quick_xml::Error) -> AppError {
    AppError::Validation {
        message: format!("Повреждённый EPUB {context}: {error}"),
    }
}
