use std::path::Path;

use crate::domain::error::AppResult;

use super::{ParsedBook, chapter, epub::first_heading, sanitize_book_html, title_from_path};

pub fn parse(path: &Path) -> AppResult<ParsedBook> {
    let source =
        std::fs::read_to_string(path).map_err(|_| crate::domain::error::AppError::Validation {
            message: "HTML-файл должен быть сохранён в UTF-8.".to_string(),
        })?;
    let title = first_heading(&source).unwrap_or_else(|| title_from_path(path));
    let clean = sanitize_book_html(&source);
    Ok(ParsedBook {
        title: Some(title.clone()),
        chapters: vec![chapter("chapter-0", title, clean)],
    })
}
