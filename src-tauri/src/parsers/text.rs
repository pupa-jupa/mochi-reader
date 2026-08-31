use std::path::Path;

use crate::domain::error::AppResult;

use super::{ParsedBook, chapter, sanitize::escape_html, title_from_path};

const MAX_TEXT_BYTES: u64 = 32 * 1024 * 1024;

pub fn parse(path: &Path) -> AppResult<ParsedBook> {
    if path.metadata()?.len() > MAX_TEXT_BYTES {
        return Err(crate::domain::error::AppError::Validation {
            message: "Текстовый файл больше 32 МБ — его безопаснее разделить на части.".to_string(),
        });
    }
    let source =
        std::fs::read_to_string(path).map_err(|_| crate::domain::error::AppError::Validation {
            message: "Текстовый файл должен быть сохранён в UTF-8.".to_string(),
        })?;
    let title = title_from_path(path);
    let html = source
        .split("\n\n")
        .map(str::trim)
        .filter(|paragraph| !paragraph.is_empty())
        .map(|paragraph| format!("<p>{}</p>", escape_html(paragraph).replace('\n', "<br>")))
        .collect::<String>();
    Ok(ParsedBook {
        title: Some(title.clone()),
        chapters: vec![chapter("chapter-0", title, html)],
    })
}
