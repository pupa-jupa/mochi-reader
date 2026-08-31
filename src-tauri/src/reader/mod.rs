use rusqlite::Connection;
use serde::{Deserialize, Serialize};

use crate::{
    database::work_repository::WorkRepository,
    domain::{
        error::{AppError, AppResult},
        work::{WorkFormat, WorkKind},
    },
    parsers::{ParsedChapter, parse_book},
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReaderDocument {
    pub work_id: String,
    pub title: String,
    pub author: Option<String>,
    pub format: WorkFormat,
    pub kind: WorkKind,
    pub chapters: Vec<ParsedChapter>,
}

pub fn load_reader_document(connection: &Connection, work_id: &str) -> AppResult<ReaderDocument> {
    let repository = WorkRepository::new(connection);
    let work = repository.get(work_id)?;
    if !std::path::Path::new(&work.source_path).is_file() {
        return Err(AppError::Validation {
            message: "Исходный файл не найден. Выбери новое расположение в карточке книги."
                .to_string(),
        });
    }
    let parsed = parse_book(std::path::Path::new(&work.source_path), work.format.clone())?;
    repository.mark_opened(work_id)?;
    Ok(ReaderDocument {
        work_id: work_id.to_string(),
        title: work.title.clone(),
        author: work.author.clone(),
        format: work.format.clone(),
        kind: work.kind,
        chapters: parsed.chapters,
    })
}

pub fn load_pdf_bytes(connection: &Connection, work_id: &str) -> AppResult<Vec<u8>> {
    const MAX_PDF_BYTES: u64 = 128 * 1024 * 1024;
    let repository = WorkRepository::new(connection);
    let work = repository.get(work_id)?;
    if work.format != WorkFormat::Pdf {
        return Err(AppError::Validation {
            message: "Произведение не является PDF-документом.".to_string(),
        });
    }
    let path = std::path::Path::new(&work.source_path);
    let metadata = path.metadata().map_err(|_| AppError::Validation {
        message: "PDF-файл не найден. Выбери новое расположение в карточке книги.".to_string(),
    })?;
    if metadata.len() > MAX_PDF_BYTES {
        return Err(AppError::Validation {
            message: "PDF больше 128 МБ пока нельзя открыть целиком. Поддержка range-чтения будет добавлена позже.".to_string(),
        });
    }
    let bytes = std::fs::read(path)?;
    if !bytes.starts_with(b"%PDF-") {
        return Err(AppError::Validation {
            message: "Файл не содержит корректной PDF-сигнатуры.".to_string(),
        });
    }
    repository.mark_opened(work_id)?;
    Ok(bytes)
}
