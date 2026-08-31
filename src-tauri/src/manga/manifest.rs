use std::{
    fs::File,
    io::Read,
    path::{Path, PathBuf},
};

use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use zip::ZipArchive;

use crate::{
    domain::error::{AppError, AppResult},
    manga::natural_sort::natural_cmp,
};

const MAX_ARCHIVE_ENTRIES: usize = 5_000;
const MAX_EXPANDED_BYTES: u64 = 2 * 1024 * 1024 * 1024;
const MAX_PAGE_BYTES: u64 = 32 * 1024 * 1024;
const MAX_COMPRESSION_RATIO: u64 = 200;

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaManifest {
    pub work_id: String,
    pub title: String,
    pub pages: Vec<MangaPageDescriptor>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaPageDescriptor {
    pub index: usize,
    pub label: String,
    pub media_type: String,
    #[serde(skip)]
    locator: PageLocator,
}

#[derive(Debug, Clone, PartialEq, Eq)]
enum PageLocator {
    File(PathBuf),
    ZipEntry(String),
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MangaPageData {
    pub index: usize,
    pub data_url: String,
}

pub fn load_manga_manifest(work_id: &str, title: &str, path: &Path) -> AppResult<MangaManifest> {
    let mut pages = if path.is_dir() {
        folder_pages(path)?
    } else if is_image_name(path) {
        vec![page_from_file(path, path.file_name().unwrap_or_default())]
    } else {
        zip_pages(path)?
    };

    pages.sort_by(|left, right| natural_cmp(&left.label, &right.label));
    for (index, page) in pages.iter_mut().enumerate() {
        page.index = index;
    }
    if pages.is_empty() {
        return Err(AppError::Validation {
            message: "В манге не найдено изображений.".to_string(),
        });
    }
    Ok(MangaManifest {
        work_id: work_id.to_string(),
        title: title.to_string(),
        pages,
    })
}

pub fn load_manga_page(path: &Path, page: &MangaPageDescriptor) -> AppResult<MangaPageData> {
    let bytes = match &page.locator {
        PageLocator::File(file_path) => read_bounded_file(file_path)?,
        PageLocator::ZipEntry(entry_name) => read_zip_page(path, entry_name)?,
    };
    let media_type = infer::get(&bytes)
        .map(|kind| kind.mime_type())
        .filter(|mime| mime.starts_with("image/"))
        .ok_or_else(|| AppError::Validation {
            message: format!("Страница «{}» не является изображением.", page.label),
        })?;
    Ok(MangaPageData {
        index: page.index,
        data_url: format!("data:{media_type};base64,{}", STANDARD.encode(bytes)),
    })
}

fn folder_pages(path: &Path) -> AppResult<Vec<MangaPageDescriptor>> {
    let mut pages = Vec::new();
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        if entry.file_type()?.is_file() && is_image_name(&entry.path()) {
            pages.push(page_from_file(&entry.path(), &entry.file_name()));
        }
    }
    Ok(pages)
}

fn page_from_file(path: &Path, label: &std::ffi::OsStr) -> MangaPageDescriptor {
    MangaPageDescriptor {
        index: 0,
        label: label.to_string_lossy().into_owned(),
        media_type: media_type_from_name(path).to_string(),
        locator: PageLocator::File(path.to_path_buf()),
    }
}

fn zip_pages(path: &Path) -> AppResult<Vec<MangaPageDescriptor>> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file).map_err(archive_error)?;
    if archive.len() > MAX_ARCHIVE_ENTRIES {
        return Err(AppError::Validation {
            message: "Архив содержит слишком много файлов.".to_string(),
        });
    }
    let mut total_expanded = 0_u64;
    let mut pages = Vec::new();
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(archive_error)?;
        total_expanded = total_expanded.saturating_add(entry.size());
        if total_expanded > MAX_EXPANDED_BYTES {
            return Err(AppError::Validation {
                message: "Распакованный архив превышает безопасный лимит 2 ГБ.".to_string(),
            });
        }
        if entry.size() > MAX_PAGE_BYTES {
            return Err(AppError::Validation {
                message: format!("Страница «{}» больше 32 МБ.", entry.name()),
            });
        }
        let compressed = entry.compressed_size();
        if compressed > 0 && entry.size() / compressed > MAX_COMPRESSION_RATIO {
            return Err(AppError::Validation {
                message: "Архив выглядит как zip-bomb и не будет открыт.".to_string(),
            });
        }
        let Some(enclosed) = entry.enclosed_name() else {
            continue;
        };
        if !entry.is_file() || !is_image_name(&enclosed) {
            continue;
        }
        let label = enclosed.to_string_lossy().replace('\\', "/");
        pages.push(MangaPageDescriptor {
            index: 0,
            media_type: media_type_from_name(&enclosed).to_string(),
            locator: PageLocator::ZipEntry(label.clone()),
            label,
        });
    }
    Ok(pages)
}

fn read_bounded_file(path: &Path) -> AppResult<Vec<u8>> {
    let metadata = path.metadata()?;
    if metadata.len() > MAX_PAGE_BYTES {
        return Err(AppError::Validation {
            message: "Изображение больше 32 МБ.".to_string(),
        });
    }
    Ok(std::fs::read(path)?)
}

fn read_zip_page(path: &Path, name: &str) -> AppResult<Vec<u8>> {
    let file = File::open(path)?;
    let mut archive = ZipArchive::new(file).map_err(archive_error)?;
    let mut entry = archive.by_name(name).map_err(archive_error)?;
    if entry.size() > MAX_PAGE_BYTES {
        return Err(AppError::Validation {
            message: "Страница больше 32 МБ.".to_string(),
        });
    }
    let mut bytes = Vec::with_capacity(entry.size() as usize);
    entry
        .by_ref()
        .take(MAX_PAGE_BYTES + 1)
        .read_to_end(&mut bytes)?;
    if bytes.len() as u64 > MAX_PAGE_BYTES {
        return Err(AppError::Validation {
            message: "Страница больше 32 МБ.".to_string(),
        });
    }
    Ok(bytes)
}

fn is_image_name(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp" | "avif" | "gif")
    )
}

fn media_type_from_name(path: &Path) -> &'static str {
    match path
        .extension()
        .and_then(|value| value.to_str())
        .map(str::to_ascii_lowercase)
        .as_deref()
    {
        Some("jpg" | "jpeg") => "image/jpeg",
        Some("webp") => "image/webp",
        Some("avif") => "image/avif",
        Some("gif") => "image/gif",
        _ => "image/png",
    }
}

fn archive_error(error: zip::result::ZipError) -> AppError {
    AppError::Validation {
        message: format!("Не удалось прочитать архив манги: {error}"),
    }
}
