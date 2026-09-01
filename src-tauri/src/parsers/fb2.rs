use std::{
    borrow::Cow,
    collections::{HashMap, HashSet},
    fmt::Write as _,
    io::{Cursor, Read},
    path::Path,
};

use base64::{
    Engine as _,
    engine::general_purpose::{STANDARD, STANDARD_NO_PAD},
};
use chardetng::{EncodingDetector, Iso2022JpDetection, Utf8Detection};
use encoding_rs::{Encoding, UTF_8, UTF_16BE, UTF_16LE};
use fb2::{
    Annotation, AnnotationElement, Binary, Cite, CiteElement, Epigraph, EpigraphElement,
    FictionBook, Image, InlineImage, Link, Paragraph, Poem, PoemStanza, Section, SectionPart,
    StyleElement, StyleLinkElement, Table, TableCellElement, Title, TitleElement,
};
use quick_xml::{
    Reader, Writer,
    events::{BytesText, Event},
};
use zip::ZipArchive;

use crate::domain::error::{AppError, AppResult};

use super::{ParsedBook, chapter, sanitize::escape_html, title_from_path};

const MAX_CONTAINER_BYTES: u64 = 128 * 1024 * 1024;
const MAX_FB2_BYTES: u64 = 128 * 1024 * 1024;
const MAX_ZIP_ENTRIES: usize = 128;
const MAX_COMPRESSION_RATIO: u64 = 250;
const MAX_EMBEDDED_IMAGE_BYTES: usize = 24 * 1024 * 1024;

pub fn parse(path: &Path) -> AppResult<ParsedBook> {
    let bytes = read_fb2_bytes(path)?;
    let xml = normalize_legacy_entities(decode_fb2(&bytes)?);
    validate_xml(&xml)?;
    let compatible_xml = normalize_legacy_structure(&xml)?;
    let book: FictionBook =
        quick_xml::de::from_str(&compatible_xml).map_err(|_| AppError::Validation {
            message:
                "Не получилось открыть FB2. Структура FictionBook повреждена или не поддерживается."
                    .to_string(),
        })?;

    parsed_book(path, &book)
}

fn normalize_legacy_structure(xml: &str) -> AppResult<String> {
    let mut reader = Reader::from_str(xml);
    let mut writer = Writer::new(Vec::with_capacity(xml.len()));
    let mut ignored_depth = 0usize;

    loop {
        match reader.read_event() {
            Ok(Event::Start(_)) if ignored_depth > 0 => ignored_depth += 1,
            Ok(Event::Start(event)) if event.local_name().as_ref() == b"genre" => {
                ignored_depth = 1;
            }
            Ok(Event::End(_)) if ignored_depth > 0 => ignored_depth -= 1,
            Ok(Event::Empty(event))
                if ignored_depth > 0 || event.local_name().as_ref() == b"genre" => {}
            Ok(Event::Start(event)) if is_legacy_inline_wrapper(event.local_name().as_ref()) => {}
            Ok(Event::End(event)) if is_legacy_inline_wrapper(event.local_name().as_ref()) => {}
            Ok(Event::Empty(event)) if is_legacy_inline_wrapper(event.local_name().as_ref()) => {}
            Ok(Event::Start(event)) if event.local_name().as_ref() == b"br" => {
                writer
                    .write_event(Event::Text(BytesText::new(" ")))
                    .map_err(|_| AppError::Validation {
                        message: "Не удалось подготовить структуру FB2 к чтению.".to_string(),
                    })?;
            }
            Ok(Event::End(event)) if event.local_name().as_ref() == b"br" => {}
            Ok(Event::Empty(event)) if event.local_name().as_ref() == b"br" => {
                writer
                    .write_event(Event::Text(BytesText::new(" ")))
                    .map_err(|_| AppError::Validation {
                        message: "Не удалось подготовить структуру FB2 к чтению.".to_string(),
                    })?;
            }
            Ok(Event::Eof) => break,
            Ok(event) if ignored_depth == 0 => {
                writer
                    .write_event(event)
                    .map_err(|_| AppError::Validation {
                        message: "Не удалось подготовить метаданные FB2 к чтению.".to_string(),
                    })?;
            }
            Ok(_) => {}
            Err(_) => {
                return Err(AppError::Validation {
                    message: "Не удалось подготовить метаданные FB2 к чтению.".to_string(),
                });
            }
        }
    }

    String::from_utf8(writer.into_inner()).map_err(|_| AppError::Validation {
        message: "Не удалось подготовить метаданные FB2 к чтению.".to_string(),
    })
}

fn is_legacy_inline_wrapper(name: &[u8]) -> bool {
    matches!(name, b"span" | b"font" | b"div")
}

fn normalize_legacy_entities(mut xml: String) -> String {
    const ENTITIES: [(&str, &str); 10] = [
        ("&nbsp;", "\u{a0}"),
        ("&ndash;", "–"),
        ("&mdash;", "—"),
        ("&hellip;", "…"),
        ("&laquo;", "«"),
        ("&raquo;", "»"),
        ("&copy;", "©"),
        ("&reg;", "®"),
        ("&trade;", "™"),
        ("&shy;", "\u{ad}"),
    ];

    for (entity, replacement) in ENTITIES {
        if xml.contains(entity) {
            xml = xml.replace(entity, replacement);
        }
    }
    xml
}

fn read_fb2_bytes(path: &Path) -> AppResult<Vec<u8>> {
    let metadata = std::fs::metadata(path)?;
    if metadata.len() > MAX_CONTAINER_BYTES {
        return Err(AppError::Validation {
            message: "Не получилось открыть FB2. Файл слишком большой.".to_string(),
        });
    }

    let bytes = std::fs::read(path)?;
    if is_zip(&bytes) {
        extract_fb2_from_zip(bytes)
    } else if bytes.len() as u64 > MAX_FB2_BYTES {
        Err(AppError::Validation {
            message: "Не получилось открыть FB2. Файл слишком большой.".to_string(),
        })
    } else {
        Ok(bytes)
    }
}

fn is_zip(bytes: &[u8]) -> bool {
    bytes.starts_with(b"PK\x03\x04")
        || bytes.starts_with(b"PK\x05\x06")
        || bytes.starts_with(b"PK\x07\x08")
}

fn extract_fb2_from_zip(bytes: Vec<u8>) -> AppResult<Vec<u8>> {
    let mut archive = ZipArchive::new(Cursor::new(bytes)).map_err(|_| AppError::Validation {
        message: "Не получилось открыть FB2. Архив повреждён.".to_string(),
    })?;
    if archive.len() > MAX_ZIP_ENTRIES {
        return Err(AppError::Validation {
            message: "Не получилось открыть FB2. В архиве слишком много файлов.".to_string(),
        });
    }

    let mut fb2_index = None;
    for index in 0..archive.len() {
        let entry = archive.by_index(index).map_err(|_| AppError::Validation {
            message: "Не получилось открыть FB2. Архив повреждён.".to_string(),
        })?;
        if entry.is_dir()
            || Path::new(entry.name())
                .extension()
                .and_then(|value| value.to_str())
                .is_none_or(|value| !value.eq_ignore_ascii_case("fb2"))
        {
            continue;
        }
        if entry.enclosed_name().is_none() {
            return Err(AppError::Validation {
                message: "Не получилось открыть FB2. Архив содержит небезопасное имя файла."
                    .to_string(),
            });
        }
        if fb2_index.replace(index).is_some() {
            return Err(AppError::Validation {
                message: "Архив FB2 должен содержать ровно один .fb2-файл.".to_string(),
            });
        }
    }

    let index = fb2_index.ok_or_else(|| AppError::Validation {
        message: "Не получилось открыть FB2. В архиве нет .fb2-файла.".to_string(),
    })?;
    let mut entry = archive.by_index(index).map_err(|_| AppError::Validation {
        message: "Не получилось открыть FB2. Архив повреждён.".to_string(),
    })?;
    if entry.size() > MAX_FB2_BYTES
        || (entry.compressed_size() > 0
            && entry.size()
                > entry
                    .compressed_size()
                    .saturating_mul(MAX_COMPRESSION_RATIO))
    {
        return Err(AppError::Validation {
            message: "Не получилось открыть FB2. Содержимое архива слишком большое.".to_string(),
        });
    }

    let mut extracted = Vec::with_capacity(entry.size().min(MAX_FB2_BYTES) as usize);
    (&mut entry)
        .take(MAX_FB2_BYTES + 1)
        .read_to_end(&mut extracted)
        .map_err(|_| AppError::Validation {
            message: "Не получилось открыть FB2. Не удалось распаковать книгу.".to_string(),
        })?;
    if extracted.len() as u64 > MAX_FB2_BYTES {
        return Err(AppError::Validation {
            message: "Не получилось открыть FB2. Содержимое архива слишком большое.".to_string(),
        });
    }
    Ok(extracted)
}

fn decode_fb2(bytes: &[u8]) -> AppResult<String> {
    if bytes.is_empty() {
        return Err(AppError::Validation {
            message: "Не получилось открыть FB2. Файл пуст.".to_string(),
        });
    }

    if let Some(rest) = bytes.strip_prefix(&[0xef, 0xbb, 0xbf]) {
        return decode_with_encoding(rest, UTF_8, "UTF-8");
    }
    if let Some(rest) = bytes.strip_prefix(&[0xff, 0xfe, 0x00, 0x00]) {
        return decode_utf32(rest, true);
    }
    if let Some(rest) = bytes.strip_prefix(&[0x00, 0x00, 0xfe, 0xff]) {
        return decode_utf32(rest, false);
    }
    if let Some(rest) = bytes.strip_prefix(&[0xff, 0xfe]) {
        return decode_with_encoding(rest, UTF_16LE, "UTF-16LE");
    }
    if let Some(rest) = bytes.strip_prefix(&[0xfe, 0xff]) {
        return decode_with_encoding(rest, UTF_16BE, "UTF-16BE");
    }

    if bytes.starts_with(&[0x3c, 0x00, 0x00, 0x00]) {
        return decode_utf32(bytes, true);
    }
    if bytes.starts_with(&[0x00, 0x00, 0x00, 0x3c]) {
        return decode_utf32(bytes, false);
    }
    if bytes.starts_with(&[0x3c, 0x00, 0x3f, 0x00]) {
        return decode_with_encoding(bytes, UTF_16LE, "UTF-16LE");
    }
    if bytes.starts_with(&[0x00, 0x3c, 0x00, 0x3f]) {
        return decode_with_encoding(bytes, UTF_16BE, "UTF-16BE");
    }

    if let Some(label) = declared_xml_encoding(bytes) {
        let encoding =
            Encoding::for_label(label.as_bytes()).ok_or_else(|| AppError::Validation {
                message: format!(
                    "Не получилось открыть FB2. Кодировка «{}» не поддерживается.",
                    escape_html(&label)
                ),
            })?;
        return decode_with_encoding(bytes, encoding, &label);
    }

    if let Ok(text) = std::str::from_utf8(bytes) {
        return Ok(text.to_string());
    }

    let mut detector = EncodingDetector::new(Iso2022JpDetection::Deny);
    detector.feed(bytes, true);
    let encoding = detector.guess(None, Utf8Detection::Deny);
    decode_with_encoding(bytes, encoding, encoding.name())
}

fn decode_with_encoding(
    bytes: &[u8],
    encoding: &'static Encoding,
    label: &str,
) -> AppResult<String> {
    encoding
        .decode_without_bom_handling_and_without_replacement(bytes)
        .map(Cow::into_owned)
        .ok_or_else(|| AppError::Validation {
            message: format!(
                "Не получилось открыть FB2. Текст не соответствует кодировке «{}».",
                escape_html(label)
            ),
        })
}

fn decode_utf32(bytes: &[u8], little_endian: bool) -> AppResult<String> {
    let (chunks, remainder) = bytes.as_chunks::<4>();
    if !remainder.is_empty() {
        return Err(AppError::Validation {
            message: "Не получилось открыть FB2. Повреждённый текст UTF-32.".to_string(),
        });
    }

    let mut text = String::with_capacity(bytes.len() / 2);
    for chunk in chunks {
        let unit = if little_endian {
            u32::from_le_bytes(*chunk)
        } else {
            u32::from_be_bytes(*chunk)
        };
        let character = char::from_u32(unit).ok_or_else(|| AppError::Validation {
            message: "Не получилось открыть FB2. Повреждённый текст UTF-32.".to_string(),
        })?;
        text.push(character);
    }
    Ok(text)
}

fn declared_xml_encoding(bytes: &[u8]) -> Option<String> {
    let sample = &bytes[..bytes.len().min(1024)];
    let declaration_end = sample
        .windows(2)
        .position(|window| window == b"?>")
        .map_or(sample.len(), |position| position + 2);
    let declaration = sample[..declaration_end]
        .iter()
        .map(|byte| if byte.is_ascii() { *byte as char } else { ' ' })
        .collect::<String>();
    let lowercase = declaration.to_ascii_lowercase();
    let xml_start = lowercase.find("<?xml")?;
    let marker = lowercase[xml_start..].find("encoding")? + xml_start + "encoding".len();
    let source = declaration.as_bytes();
    let mut index = marker;
    while source.get(index).is_some_and(u8::is_ascii_whitespace) {
        index += 1;
    }
    if source.get(index) != Some(&b'=') {
        return None;
    }
    index += 1;
    while source.get(index).is_some_and(u8::is_ascii_whitespace) {
        index += 1;
    }
    let quote = *source.get(index)?;
    if quote != b'\'' && quote != b'"' {
        return None;
    }
    index += 1;
    let end = source[index..].iter().position(|byte| *byte == quote)? + index;
    let label = declaration[index..end].trim();
    (!label.is_empty()).then(|| label.to_string())
}

fn validate_xml(xml: &str) -> AppResult<()> {
    let mut reader = Reader::from_str(xml);
    let mut root_seen = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(event) | Event::Empty(event)) if !root_seen => {
                root_seen = true;
                if event.local_name().as_ref() != b"FictionBook" {
                    return Err(AppError::Validation {
                        message:
                            "Не получилось открыть FB2. В файле нет корневого элемента FictionBook."
                                .to_string(),
                    });
                }
            }
            Ok(Event::Eof) => break,
            Err(_) => {
                let position = reader.error_position().min(xml.len() as u64) as usize;
                let line = 1 + xml.as_bytes()[..position]
                    .iter()
                    .filter(|byte| **byte == b'\n')
                    .count();
                return Err(AppError::Validation {
                    message: format!(
                        "Не получилось открыть FB2. Файл содержит повреждённый XML около строки {line}."
                    ),
                });
            }
            _ => {}
        }
    }

    if root_seen {
        Ok(())
    } else {
        Err(AppError::Validation {
            message: "Не получилось открыть FB2. Файл не содержит XML-книгу.".to_string(),
        })
    }
}

fn parsed_book(path: &Path, book: &FictionBook) -> AppResult<ParsedBook> {
    let book_title = non_empty(&book.description.title_info.book_title.value)
        .map(str::to_string)
        .unwrap_or_else(|| title_from_path(path));
    let images = embedded_images(&book.binaries);
    let mut notes = HashMap::new();
    for body in book.bodies.iter().skip(1) {
        for section in &body.sections {
            collect_note_sections(section, &mut notes);
        }
    }
    let mut renderer = Renderer::new(images, notes);
    let mut chapters = Vec::new();

    for (body_index, body) in book.bodies.iter().enumerate() {
        let mut intro = body_intro(book, body_index, &mut renderer);
        for (section_index, section) in body.sections.iter().enumerate() {
            renderer.begin_chapter(body_index == 0);
            let mut html = String::new();
            if section_index == 0 {
                html.push_str(&intro);
                intro.clear();
            }
            html.push_str(&renderer.render_section(section, 1));
            if body_index == 0 {
                html.push_str(&renderer.render_referenced_notes());
            }

            let fallback = body_chapter_fallback(
                body.name.as_deref(),
                body_index,
                section_index,
                body.sections.len(),
                &book_title,
            );
            let title = section_title(section).unwrap_or(fallback);
            chapters.push(chapter(format!("chapter-{}", chapters.len()), title, html));
        }

        if body.sections.is_empty() && !intro.is_empty() {
            let title = body_chapter_fallback(body.name.as_deref(), body_index, 0, 0, &book_title);
            chapters.push(chapter(format!("chapter-{}", chapters.len()), title, intro));
        }
    }

    if chapters.is_empty() {
        return Err(AppError::Validation {
            message: "Не получилось открыть FB2. В книге нет доступных для чтения разделов."
                .to_string(),
        });
    }

    Ok(ParsedBook {
        title: Some(book_title),
        chapters,
    })
}

fn body_intro(book: &FictionBook, body_index: usize, renderer: &mut Renderer<'_>) -> String {
    let body = &book.bodies[body_index];
    let mut html = String::new();
    if body_index == 0 {
        if let Some(covers) = &book.description.title_info.cover_page {
            for image in &covers.images {
                html.push_str(&renderer.render_inline_image(image, true));
            }
        }
        if let Some(annotation) = &book.description.title_info.annotation {
            html.push_str(&renderer.render_annotation(annotation));
        }
    }
    if let Some(image) = &body.image {
        html.push_str(&renderer.render_image(image, true));
    }
    if let Some(title) = &body.title {
        html.push_str(&renderer.render_title(title, 1));
    }
    for epigraph in &body.epigraphs {
        html.push_str(&renderer.render_epigraph(epigraph));
    }
    html
}

fn body_chapter_fallback(
    body_name: Option<&str>,
    body_index: usize,
    section_index: usize,
    section_count: usize,
    book_title: &str,
) -> String {
    if body_index == 0 {
        if section_count <= 1 {
            book_title.to_string()
        } else {
            format!("Глава {}", section_index + 1)
        }
    } else {
        match body_name.map(str::trim).filter(|name| !name.is_empty()) {
            Some(name) if name.eq_ignore_ascii_case("notes") => {
                format!("Примечание {}", section_index + 1)
            }
            Some(name) if section_count <= 1 => name.to_string(),
            Some(name) => format!("{name} {}", section_index + 1),
            None => format!("Дополнительный раздел {}", section_index + 1),
        }
    }
}

fn non_empty(value: &str) -> Option<&str> {
    let value = value.trim();
    (!value.is_empty()).then_some(value)
}

fn embedded_images(binaries: &[Binary]) -> HashMap<String, String> {
    let mut images = HashMap::new();
    for binary in binaries {
        let content_type = binary.content_type.trim().to_ascii_lowercase();
        if !matches!(
            content_type.as_str(),
            "image/jpeg" | "image/png" | "image/gif" | "image/webp" | "image/avif" | "image/bmp"
        ) {
            continue;
        }
        let compact = binary
            .content
            .bytes()
            .filter(|byte| !byte.is_ascii_whitespace())
            .collect::<Vec<_>>();
        let decoded = STANDARD
            .decode(&compact)
            .or_else(|_| STANDARD_NO_PAD.decode(&compact));
        let Ok(decoded) = decoded else {
            continue;
        };
        if decoded.len() > MAX_EMBEDDED_IMAGE_BYTES {
            continue;
        }
        images.insert(
            binary.id.trim_start_matches('#').to_string(),
            format!("data:{content_type};base64,{}", STANDARD.encode(decoded)),
        );
    }
    images
}

fn collect_note_sections<'a>(section: &'a Section, notes: &mut HashMap<String, &'a Section>) {
    if let Some(id) = section.id.as_deref().and_then(non_empty) {
        notes.insert(id.to_string(), section);
    }
    if let Some(content) = &section.content {
        for child in &content.sections {
            collect_note_sections(child, notes);
        }
    }
}

fn section_title(section: &Section) -> Option<String> {
    section
        .content
        .as_ref()
        .and_then(|content| content.title.as_ref())
        .map(title_text)
        .and_then(|title| non_empty(&title).map(str::to_string))
}

fn title_text(title: &Title) -> String {
    normalize_text(
        &title
            .elements
            .iter()
            .filter_map(|element| match element {
                TitleElement::Paragraph(paragraph) => Some(paragraph_text(paragraph)),
                TitleElement::EmptyLine => None,
            })
            .collect::<Vec<_>>()
            .join(" "),
    )
}

fn paragraph_text(paragraph: &Paragraph) -> String {
    normalize_text(&style_elements_text(&paragraph.elements))
}

fn style_elements_text(elements: &[StyleElement]) -> String {
    let mut text = String::new();
    for element in elements {
        match element {
            StyleElement::Strong(style)
            | StyleElement::Emphasis(style)
            | StyleElement::Strikethrough(style)
            | StyleElement::Subscript(style)
            | StyleElement::Superscript(style)
            | StyleElement::Code(style) => text.push_str(&style_elements_text(&style.elements)),
            StyleElement::Style(style) => text.push_str(&style_elements_text(&style.elements)),
            StyleElement::Link(link) => text.push_str(&style_link_elements_text(&link.elements)),
            StyleElement::Image(image) => {
                if let Some(alt) = image.alt.as_deref() {
                    text.push_str(alt);
                }
            }
            StyleElement::Text(value) => text.push_str(value),
        }
    }
    text
}

fn style_link_elements_text(elements: &[StyleLinkElement]) -> String {
    let mut text = String::new();
    for element in elements {
        match element {
            StyleLinkElement::Strong { elements }
            | StyleLinkElement::Emphasis { elements }
            | StyleLinkElement::Style { elements }
            | StyleLinkElement::Strikethrough { elements }
            | StyleLinkElement::Subscript { elements }
            | StyleLinkElement::Superscript { elements }
            | StyleLinkElement::Code { elements } => {
                text.push_str(&style_link_elements_text(elements));
            }
            StyleLinkElement::Image(image) => {
                if let Some(alt) = image.alt.as_deref() {
                    text.push_str(alt);
                }
            }
            StyleLinkElement::Text(value) => text.push_str(value),
        }
    }
    text
}

fn normalize_text(text: &str) -> String {
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}

struct Renderer<'a> {
    images: HashMap<String, String>,
    notes: HashMap<String, &'a Section>,
    referenced_notes: Vec<String>,
    seen_notes: HashSet<String>,
    collect_note_links: bool,
}

impl<'a> Renderer<'a> {
    fn new(images: HashMap<String, String>, notes: HashMap<String, &'a Section>) -> Self {
        Self {
            images,
            notes,
            referenced_notes: Vec::new(),
            seen_notes: HashSet::new(),
            collect_note_links: false,
        }
    }

    fn begin_chapter(&mut self, collect_note_links: bool) {
        self.referenced_notes.clear();
        self.seen_notes.clear();
        self.collect_note_links = collect_note_links;
    }

    fn render_section(&mut self, section: &Section, level: usize) -> String {
        let mut html = String::new();
        html.push_str("<section");
        if let Some(id) = section.id.as_deref().and_then(non_empty) {
            let _ = write!(html, " id=\"{}\"", anchor_id(id));
        }
        html.push('>');
        if let Some(content) = &section.content {
            if let Some(title) = &content.title {
                html.push_str(&self.render_title(title, level));
            }
            for epigraph in &content.epigraphs {
                html.push_str(&self.render_epigraph(epigraph));
            }
            if let Some(image) = &content.image {
                html.push_str(&self.render_image(image, true));
            }
            if let Some(annotation) = &content.annotation {
                html.push_str(&self.render_annotation(annotation));
            }
            for part in &content.content {
                html.push_str(&self.render_section_part(part, level));
            }
            for child in &content.sections {
                html.push_str(&self.render_section(child, level.saturating_add(1)));
            }
        }
        html.push_str("</section>");
        html
    }

    fn render_section_part(&mut self, part: &SectionPart, level: usize) -> String {
        match part {
            SectionPart::Paragraph(paragraph) => self.render_paragraph(paragraph, None),
            SectionPart::Poem(poem) => self.render_poem(poem, level.saturating_add(1)),
            SectionPart::Subtitle(paragraph) => {
                let heading = level.saturating_add(1).clamp(2, 6);
                format!(
                    "<h{heading}>{}</h{heading}>",
                    self.render_style_elements(&paragraph.elements)
                )
            }
            SectionPart::Cite(cite) => self.render_cite(cite, level),
            SectionPart::Table(table) => self.render_table(table),
            SectionPart::Image(image) => self.render_image(image, true),
            SectionPart::EmptyLine => {
                "<div class=\"fb2-empty-line\" aria-hidden=\"true\"></div>".to_string()
            }
        }
    }

    fn render_title(&mut self, title: &Title, level: usize) -> String {
        let heading = level.clamp(1, 6);
        let mut html = String::new();
        for element in &title.elements {
            match element {
                TitleElement::Paragraph(paragraph) => {
                    let _ = write!(
                        html,
                        "<h{heading}>{}</h{heading}>",
                        self.render_style_elements(&paragraph.elements)
                    );
                }
                TitleElement::EmptyLine => html.push_str("<br>"),
            }
        }
        html
    }

    fn render_paragraph(&mut self, paragraph: &Paragraph, class: Option<&str>) -> String {
        let mut html = String::from("<p");
        if let Some(id) = paragraph.id.as_deref().and_then(non_empty) {
            let _ = write!(html, " id=\"{}\"", anchor_id(id));
        }
        if let Some(class) = class {
            let _ = write!(html, " class=\"{}\"", escape_html(class));
        }
        html.push('>');
        html.push_str(&self.render_style_elements(&paragraph.elements));
        html.push_str("</p>");
        html
    }

    fn render_style_elements(&mut self, elements: &[StyleElement]) -> String {
        let mut html = String::new();
        for element in elements {
            match element {
                StyleElement::Strong(style) => {
                    html.push_str("<strong>");
                    html.push_str(&self.render_style_elements(&style.elements));
                    html.push_str("</strong>");
                }
                StyleElement::Emphasis(style) => {
                    html.push_str("<em>");
                    html.push_str(&self.render_style_elements(&style.elements));
                    html.push_str("</em>");
                }
                StyleElement::Style(style) => {
                    html.push_str("<span>");
                    html.push_str(&self.render_style_elements(&style.elements));
                    html.push_str("</span>");
                }
                StyleElement::Link(link) => html.push_str(&self.render_link(link)),
                StyleElement::Strikethrough(style) => {
                    html.push_str("<s>");
                    html.push_str(&self.render_style_elements(&style.elements));
                    html.push_str("</s>");
                }
                StyleElement::Subscript(style) => {
                    html.push_str("<sub>");
                    html.push_str(&self.render_style_elements(&style.elements));
                    html.push_str("</sub>");
                }
                StyleElement::Superscript(style) => {
                    html.push_str("<sup>");
                    html.push_str(&self.render_style_elements(&style.elements));
                    html.push_str("</sup>");
                }
                StyleElement::Code(style) => {
                    html.push_str("<code>");
                    html.push_str(&self.render_style_elements(&style.elements));
                    html.push_str("</code>");
                }
                StyleElement::Image(image) => {
                    html.push_str(&self.render_inline_image(image, false));
                }
                StyleElement::Text(value) => html.push_str(&escape_html(value)),
            }
        }
        html
    }

    fn render_link(&mut self, link: &Link) -> String {
        let content = self.render_style_link_elements(&link.elements);
        let Some(target) = link
            .href
            .as_deref()
            .and_then(|href| href.strip_prefix('#'))
            .and_then(non_empty)
        else {
            return content;
        };
        if self.collect_note_links
            && self.notes.contains_key(target)
            && self.seen_notes.insert(target.to_string())
        {
            self.referenced_notes.push(target.to_string());
        }
        let class = if link.kind.as_deref() == Some("note") || self.notes.contains_key(target) {
            " class=\"fb2-note-link\" role=\"doc-noteref\""
        } else {
            ""
        };
        format!("<a href=\"#{}\"{class}>{content}</a>", anchor_id(target))
    }

    fn render_style_link_elements(&mut self, elements: &[StyleLinkElement]) -> String {
        let mut html = String::new();
        for element in elements {
            match element {
                StyleLinkElement::Strong { elements } => {
                    html.push_str("<strong>");
                    html.push_str(&self.render_style_link_elements(elements));
                    html.push_str("</strong>");
                }
                StyleLinkElement::Emphasis { elements } | StyleLinkElement::Style { elements } => {
                    html.push_str("<em>");
                    html.push_str(&self.render_style_link_elements(elements));
                    html.push_str("</em>");
                }
                StyleLinkElement::Strikethrough { elements } => {
                    html.push_str("<s>");
                    html.push_str(&self.render_style_link_elements(elements));
                    html.push_str("</s>");
                }
                StyleLinkElement::Subscript { elements } => {
                    html.push_str("<sub>");
                    html.push_str(&self.render_style_link_elements(elements));
                    html.push_str("</sub>");
                }
                StyleLinkElement::Superscript { elements } => {
                    html.push_str("<sup>");
                    html.push_str(&self.render_style_link_elements(elements));
                    html.push_str("</sup>");
                }
                StyleLinkElement::Code { elements } => {
                    html.push_str("<code>");
                    html.push_str(&self.render_style_link_elements(elements));
                    html.push_str("</code>");
                }
                StyleLinkElement::Image(image) => {
                    html.push_str(&self.render_inline_image(image, false));
                }
                StyleLinkElement::Text(value) => html.push_str(&escape_html(value)),
            }
        }
        html
    }

    fn render_image(&self, image: &Image, block: bool) -> String {
        self.render_image_reference(image.href.as_deref(), image.alt.as_deref(), block)
    }

    fn render_inline_image(&self, image: &InlineImage, block: bool) -> String {
        self.render_image_reference(image.href.as_deref(), image.alt.as_deref(), block)
    }

    fn render_image_reference(&self, href: Option<&str>, alt: Option<&str>, block: bool) -> String {
        let Some(id) = href
            .and_then(|value| value.strip_prefix('#'))
            .and_then(non_empty)
        else {
            return String::new();
        };
        let Some(source) = self.images.get(id) else {
            return String::new();
        };
        let image = format!(
            "<img src=\"{}\" alt=\"{}\" loading=\"lazy\">",
            escape_html(source),
            escape_html(alt.unwrap_or(""))
        );
        if block {
            format!("<figure class=\"fb2-image\">{image}</figure>")
        } else {
            image
        }
    }

    fn render_annotation(&mut self, annotation: &Annotation) -> String {
        let mut html = String::from("<aside class=\"fb2-annotation\"");
        if let Some(id) = annotation.id.as_deref().and_then(non_empty) {
            let _ = write!(html, " id=\"{}\"", anchor_id(id));
        }
        html.push('>');
        for element in &annotation.elements {
            html.push_str(&match element {
                AnnotationElement::Paragraph(paragraph) => self.render_paragraph(paragraph, None),
                AnnotationElement::Poem(poem) => self.render_poem(poem, 3),
                AnnotationElement::Cite(cite) => self.render_cite(cite, 3),
                AnnotationElement::Subtitle(paragraph) => format!(
                    "<h3>{}</h3>",
                    self.render_style_elements(&paragraph.elements)
                ),
                AnnotationElement::Table(table) => self.render_table(table),
                AnnotationElement::EmptyLine => "<br>".to_string(),
            });
        }
        html.push_str("</aside>");
        html
    }

    fn render_epigraph(&mut self, epigraph: &Epigraph) -> String {
        let mut html = String::from("<blockquote class=\"fb2-epigraph\"");
        if let Some(id) = epigraph.id.as_deref().and_then(non_empty) {
            let _ = write!(html, " id=\"{}\"", anchor_id(id));
        }
        html.push('>');
        for element in &epigraph.elements {
            html.push_str(&match element {
                EpigraphElement::Paragraph(paragraph) => self.render_paragraph(paragraph, None),
                EpigraphElement::Poem(poem) => self.render_poem(poem, 3),
                EpigraphElement::Cite(cite) => self.render_cite(cite, 3),
                EpigraphElement::EmptyLine => "<br>".to_string(),
            });
        }
        for author in &epigraph.text_authors {
            html.push_str(&self.render_paragraph(author, Some("fb2-text-author")));
        }
        html.push_str("</blockquote>");
        html
    }

    fn render_cite(&mut self, cite: &Cite, level: usize) -> String {
        let mut html = String::from("<blockquote class=\"fb2-cite\"");
        if let Some(id) = cite.id.as_deref().and_then(non_empty) {
            let _ = write!(html, " id=\"{}\"", anchor_id(id));
        }
        html.push('>');
        for element in &cite.elements {
            html.push_str(&match element {
                CiteElement::Paragraph(paragraph) => self.render_paragraph(paragraph, None),
                CiteElement::Poem(poem) => self.render_poem(poem, level.saturating_add(1)),
                CiteElement::Subtitle(paragraph) => {
                    let heading = level.saturating_add(1).clamp(2, 6);
                    format!(
                        "<h{heading}>{}</h{heading}>",
                        self.render_style_elements(&paragraph.elements)
                    )
                }
                CiteElement::Table(table) => self.render_table(table),
                CiteElement::EmptyLine => "<br>".to_string(),
            });
        }
        for author in &cite.text_authors {
            html.push_str(&self.render_paragraph(author, Some("fb2-text-author")));
        }
        html.push_str("</blockquote>");
        html
    }

    fn render_poem(&mut self, poem: &Poem, level: usize) -> String {
        let mut html = String::from("<div class=\"fb2-poem\"");
        if let Some(id) = poem.id.as_deref().and_then(non_empty) {
            let _ = write!(html, " id=\"{}\"", anchor_id(id));
        }
        html.push('>');
        if let Some(title) = &poem.title {
            html.push_str(&self.render_title(title, level));
        }
        for epigraph in &poem.epigraphs {
            html.push_str(&self.render_epigraph(epigraph));
        }
        for stanza in &poem.stanzas {
            match stanza {
                PoemStanza::Subtitle(paragraph) => {
                    let heading = level.saturating_add(1).clamp(2, 6);
                    let _ = write!(
                        html,
                        "<h{heading}>{}</h{heading}>",
                        self.render_style_elements(&paragraph.elements)
                    );
                }
                PoemStanza::Stanza(stanza) => {
                    html.push_str("<div class=\"fb2-stanza\">");
                    if let Some(title) = &stanza.title {
                        html.push_str(&self.render_title(title, level.saturating_add(1)));
                    }
                    if let Some(subtitle) = &stanza.subtitle {
                        html.push_str(&self.render_paragraph(subtitle, Some("fb2-subtitle")));
                    }
                    for line in &stanza.lines {
                        html.push_str(&self.render_paragraph(line, Some("fb2-verse")));
                    }
                    html.push_str("</div>");
                }
            }
        }
        for author in &poem.text_authors {
            html.push_str(&self.render_paragraph(author, Some("fb2-text-author")));
        }
        html.push_str("</div>");
        html
    }

    fn render_table(&mut self, table: &Table) -> String {
        let mut html = String::from("<table");
        if let Some(id) = table.id.as_deref().and_then(non_empty) {
            let _ = write!(html, " id=\"{}\"", anchor_id(id));
        }
        html.push_str("><tbody>");
        for row in &table.rows {
            html.push_str("<tr>");
            for cell in &row.cells {
                let (tag, cell) = match cell {
                    TableCellElement::Head(cell) => ("th", cell),
                    TableCellElement::Data(cell) => ("td", cell),
                };
                let _ = write!(html, "<{tag}");
                if let Some(span) = cell.column_span.filter(|span| (2..=100).contains(span)) {
                    let _ = write!(html, " colspan=\"{span}\"");
                }
                if let Some(span) = cell.row_span.filter(|span| (2..=100).contains(span)) {
                    let _ = write!(html, " rowspan=\"{span}\"");
                }
                html.push('>');
                html.push_str(&self.render_style_elements(&cell.elements));
                let _ = write!(html, "</{tag}>");
            }
            html.push_str("</tr>");
        }
        html.push_str("</tbody></table>");
        html
    }

    fn render_referenced_notes(&mut self) -> String {
        if self.referenced_notes.is_empty() {
            return String::new();
        }
        let sections = self
            .referenced_notes
            .iter()
            .filter_map(|id| self.notes.get(id).copied().cloned())
            .collect::<Vec<_>>();
        if sections.is_empty() {
            return String::new();
        }

        let previous = self.collect_note_links;
        self.collect_note_links = false;
        let mut html = String::from("<aside class=\"fb2-footnotes\" role=\"doc-endnotes\">");
        html.push_str("<h2>Примечания</h2>");
        for section in &sections {
            html.push_str(&self.render_section(section, 3));
        }
        html.push_str("</aside>");
        self.collect_note_links = previous;
        html
    }
}

fn anchor_id(value: &str) -> String {
    let mut id = String::from("fb2-");
    for character in value.chars() {
        if character.is_ascii_alphanumeric() || matches!(character, '-' | '_' | '.' | ':') {
            id.push(character);
        } else {
            let _ = write!(id, "-{:x}-", character as u32);
        }
    }
    id
}
