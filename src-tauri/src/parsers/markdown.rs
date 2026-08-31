use std::path::Path;

use pulldown_cmark::{Options, Parser, html};

use crate::domain::error::AppResult;

use super::{ParsedBook, chapter, sanitize_book_html, title_from_path};

pub fn parse(path: &Path) -> AppResult<ParsedBook> {
    let source =
        std::fs::read_to_string(path).map_err(|_| crate::domain::error::AppError::Validation {
            message: "Markdown-файл должен быть сохранён в UTF-8.".to_string(),
        })?;
    let parser = Parser::new_ext(
        &source,
        Options::ENABLE_TABLES | Options::ENABLE_STRIKETHROUGH,
    );
    let mut rendered = String::new();
    html::push_html(&mut rendered, parser);
    let rendered = sanitize_book_html(&rendered);
    let title = title_from_path(path);
    Ok(ParsedBook {
        title: Some(title.clone()),
        chapters: vec![chapter("chapter-0", title, rendered)],
    })
}
