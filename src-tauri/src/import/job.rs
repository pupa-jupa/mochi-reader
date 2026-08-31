use std::{
    fs::File,
    io::{Read, Seek, SeekFrom},
    path::{Path, PathBuf},
};

use rusqlite::Connection;
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use walkdir::WalkDir;

use crate::{
    database::work_repository::WorkRepository,
    domain::{
        error::{AppError, AppErrorPayload, AppResult},
        work::{NewWork, WorkFormat, WorkKind},
    },
    import::{
        detect::{DetectedFormat, detect_format},
        scanner::{empty_folder_error, expand_import_path},
    },
};

const FINGERPRINT_SAMPLE_SIZE: u64 = 64 * 1024;

#[derive(Debug, Clone, Default, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportOptions {
    pub copy_into_library: bool,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportItemResult {
    pub path: String,
    pub work_id: Option<String>,
    pub title: Option<String>,
    pub error: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImportBatchResult {
    pub items: Vec<ImportItemResult>,
    pub imported: u32,
    pub failed: u32,
}

pub fn import_paths(
    connection: &Connection,
    paths: &[PathBuf],
    options: &ImportOptions,
) -> ImportBatchResult {
    let mut result = ImportBatchResult {
        items: Vec::with_capacity(paths.len()),
        imported: 0,
        failed: 0,
    };

    for selected_path in paths {
        match expand_import_path(selected_path) {
            Ok(expanded) if expanded.is_empty() => {
                push_error(
                    &mut result,
                    selected_path,
                    &empty_folder_error(selected_path),
                );
            }
            Ok(expanded) => {
                for path in expanded {
                    match import_path(connection, &path, options) {
                        Ok((work_id, title)) => {
                            result.imported = result.imported.saturating_add(1);
                            result.items.push(ImportItemResult {
                                path: path.to_string_lossy().into_owned(),
                                work_id: Some(work_id),
                                title: Some(title),
                                error: None,
                            });
                        }
                        Err(error) => push_error(&mut result, &path, &error),
                    }
                }
            }
            Err(error) => push_error(&mut result, selected_path, &error),
        }
    }

    result
}

fn push_error(result: &mut ImportBatchResult, path: &Path, error: &AppError) {
    result.failed = result.failed.saturating_add(1);
    result.items.push(ImportItemResult {
        path: path.to_string_lossy().into_owned(),
        work_id: None,
        title: None,
        error: Some(user_facing_error(error)),
    });
}

fn import_path(
    connection: &Connection,
    path: &Path,
    options: &ImportOptions,
) -> AppResult<(String, String)> {
    if !path.exists() {
        return Err(AppError::Validation {
            message: format!("Файл не найден: {}", path.display()),
        });
    }
    if options.copy_into_library {
        return Err(AppError::Validation {
            message: "Копирование в управляемую библиотеку пока недоступно.".to_string(),
        });
    }

    let detected = detect_format(path)?;
    let title = title_from_path(path)?;
    let (file_size, page_count) = path_stats(path, detected)?;
    let work = NewWork {
        title: title.clone(),
        author: None,
        kind: work_kind(detected),
        format: work_format(detected),
        source_path: path.to_path_buf(),
        file_size,
        fingerprint: fingerprint(path)?,
        cover_path: None,
        page_count,
        chapter_count: 1,
    };
    let work_id = WorkRepository::new(connection).insert(&work)?;
    Ok((work_id, title))
}

fn title_from_path(path: &Path) -> AppResult<String> {
    let title = if path.is_dir() {
        path.file_name()
    } else {
        path.file_stem()
    }
    .and_then(|value| value.to_str())
    .map(str::trim)
    .filter(|value| !value.is_empty())
    .ok_or_else(|| AppError::Validation {
        message: format!("Не удалось определить название: {}", path.display()),
    })?;
    Ok(title.to_string())
}

fn path_stats(path: &Path, format: DetectedFormat) -> AppResult<(u64, Option<u32>)> {
    if path.is_file() {
        return Ok((path.metadata()?.len(), single_image_page_count(format)));
    }

    let mut size = 0_u64;
    let mut pages = 0_u32;
    for entry in WalkDir::new(path).follow_links(false) {
        let entry = entry.map_err(|error| AppError::Validation {
            message: format!("Не удалось прочитать папку: {error}"),
        })?;
        if entry.file_type().is_file() {
            let metadata = entry.metadata().map_err(|error| AppError::Validation {
                message: format!("Не удалось прочитать файл в папке: {error}"),
            })?;
            size = size.saturating_add(metadata.len());
            if is_image_path(entry.path()) {
                pages = pages.saturating_add(1);
            }
        }
    }
    Ok((size, Some(pages)))
}

fn single_image_page_count(format: DetectedFormat) -> Option<u32> {
    (format == DetectedFormat::Image).then_some(1)
}

fn fingerprint(path: &Path) -> AppResult<String> {
    let mut hasher = Sha256::new();
    if path.is_dir() {
        hash_directory(&mut hasher, path)?;
    } else {
        hash_file(&mut hasher, path)?;
    }
    let digest = hasher.finalize();
    let hexadecimal = digest
        .iter()
        .map(|byte| format!("{byte:02x}"))
        .collect::<String>();
    Ok(format!("sha256:{hexadecimal}"))
}

fn hash_file(hasher: &mut Sha256, path: &Path) -> AppResult<()> {
    let mut file = File::open(path)?;
    let length = file.metadata()?.len();
    hasher.update(length.to_le_bytes());
    read_sample(hasher, &mut file, FINGERPRINT_SAMPLE_SIZE.min(length))?;

    if length > FINGERPRINT_SAMPLE_SIZE {
        file.seek(SeekFrom::Start(
            length.saturating_sub(FINGERPRINT_SAMPLE_SIZE),
        ))?;
        read_sample(hasher, &mut file, FINGERPRINT_SAMPLE_SIZE)?;
    }
    Ok(())
}

fn hash_directory(hasher: &mut Sha256, root: &Path) -> AppResult<()> {
    let mut files = WalkDir::new(root)
        .follow_links(false)
        .into_iter()
        .filter_map(Result::ok)
        .filter(|entry| entry.file_type().is_file())
        .map(|entry| entry.into_path())
        .collect::<Vec<_>>();
    files.sort();

    for file in files {
        let relative = file.strip_prefix(root).unwrap_or(&file);
        hasher.update(relative.to_string_lossy().as_bytes());
        hasher.update(file.metadata()?.len().to_le_bytes());
    }
    Ok(())
}

fn read_sample(hasher: &mut Sha256, file: &mut File, length: u64) -> AppResult<()> {
    let mut limited = file.take(length);
    let mut buffer = [0_u8; 8 * 1024];
    loop {
        let read = limited.read(&mut buffer)?;
        if read == 0 {
            break;
        }
        hasher.update(&buffer[..read]);
    }
    Ok(())
}

fn work_kind(format: DetectedFormat) -> WorkKind {
    match format {
        DetectedFormat::Cbz
        | DetectedFormat::Cbr
        | DetectedFormat::ZipImages
        | DetectedFormat::ImageFolder
        | DetectedFormat::Image => WorkKind::Manga,
        _ => WorkKind::Book,
    }
}

fn work_format(format: DetectedFormat) -> WorkFormat {
    match format {
        DetectedFormat::Epub => WorkFormat::Epub,
        DetectedFormat::Pdf => WorkFormat::Pdf,
        DetectedFormat::Fb2 => WorkFormat::Fb2,
        DetectedFormat::Txt => WorkFormat::Txt,
        DetectedFormat::Html => WorkFormat::Html,
        DetectedFormat::Markdown => WorkFormat::Markdown,
        DetectedFormat::Cbz => WorkFormat::Cbz,
        DetectedFormat::Cbr => WorkFormat::Cbr,
        DetectedFormat::ZipImages => WorkFormat::ZipImages,
        DetectedFormat::ImageFolder => WorkFormat::ImageFolder,
        DetectedFormat::Image => WorkFormat::Image,
    }
}

fn is_image_path(path: &Path) -> bool {
    matches!(
        path.extension()
            .and_then(|value| value.to_str())
            .map(str::to_ascii_lowercase)
            .as_deref(),
        Some("jpg" | "jpeg" | "png" | "webp" | "avif")
    )
}

fn user_facing_error(error: &AppError) -> String {
    match error {
        AppError::Validation { message } => message.clone(),
        _ => AppErrorPayload::from(error).user_message,
    }
}
