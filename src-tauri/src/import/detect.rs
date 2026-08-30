use std::{
    fs::File,
    io::{Read, Seek},
    path::Path,
};

use serde::{Deserialize, Serialize};
use zip::ZipArchive;

use crate::domain::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum DetectedFormat {
    Epub,
    Pdf,
    Fb2,
    Txt,
    Html,
    Markdown,
    Cbz,
    Cbr,
    ZipImages,
    ImageFolder,
    Image,
}

pub fn detect_format(path: &Path) -> AppResult<DetectedFormat> {
    if path.is_dir() {
        return if directory_contains_images(path)? {
            Ok(DetectedFormat::ImageFolder)
        } else {
            Err(unsupported(path))
        };
    }

    let mut file = File::open(path)?;
    let mut header = [0_u8; 16];
    let read = file.read(&mut header)?;
    let header = &header[..read];

    if header.starts_with(b"%PDF-") {
        return Ok(DetectedFormat::Pdf);
    }
    if header.starts_with(b"Rar!\x1a\x07") {
        return Ok(DetectedFormat::Cbr);
    }
    if header.starts_with(b"PK\x03\x04")
        || header.starts_with(b"PK\x05\x06")
        || header.starts_with(b"PK\x07\x08")
    {
        file.rewind()?;
        return detect_zip(file, path);
    }
    if infer::get(header).is_some_and(|kind| kind.mime_type().starts_with("image/")) {
        return Ok(DetectedFormat::Image);
    }

    match extension(path).as_deref() {
        Some("fb2") => Ok(DetectedFormat::Fb2),
        Some("txt") => Ok(DetectedFormat::Txt),
        Some("html" | "htm") => Ok(DetectedFormat::Html),
        Some("md" | "markdown") => Ok(DetectedFormat::Markdown),
        _ => Err(unsupported(path)),
    }
}

fn detect_zip(file: File, path: &Path) -> AppResult<DetectedFormat> {
    let mut archive = ZipArchive::new(file).map_err(|error| AppError::Validation {
        message: format!("Не удалось прочитать архив: {error}"),
    })?;
    let mut has_epub_mimetype = false;
    let mut has_epub_container = false;
    let mut image_count = 0_u32;

    for index in 0..archive.len() {
        let mut entry = archive
            .by_index(index)
            .map_err(|error| AppError::Validation {
                message: format!("Не удалось прочитать архив: {error}"),
            })?;
        let name = entry.name().replace('\\', "/");
        if name == "mimetype" && entry.size() <= 64 {
            let mut value = String::new();
            entry.read_to_string(&mut value)?;
            has_epub_mimetype = value.trim() == "application/epub+zip";
        } else if name.eq_ignore_ascii_case("META-INF/container.xml") {
            has_epub_container = true;
        } else if is_image_name(&name) {
            image_count = image_count.saturating_add(1);
        }
    }

    if has_epub_mimetype && has_epub_container {
        return Ok(DetectedFormat::Epub);
    }
    if image_count > 0 {
        return if extension(path).as_deref() == Some("cbz") {
            Ok(DetectedFormat::Cbz)
        } else {
            Ok(DetectedFormat::ZipImages)
        };
    }
    Err(unsupported(path))
}

fn directory_contains_images(path: &Path) -> AppResult<bool> {
    for entry in std::fs::read_dir(path)? {
        let entry = entry?;
        if entry.file_type()?.is_file() && is_image_name(&entry.file_name().to_string_lossy()) {
            return Ok(true);
        }
    }
    Ok(false)
}

fn extension(path: &Path) -> Option<String> {
    path.extension()
        .and_then(|value| value.to_str())
        .map(str::to_lowercase)
}

fn is_image_name(name: &str) -> bool {
    matches!(
        Path::new(name)
            .extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp" | "avif")
    )
}

fn unsupported(path: &Path) -> AppError {
    AppError::Validation {
        message: format!("Формат «{}» пока не поддерживается.", path.display()),
    }
}
