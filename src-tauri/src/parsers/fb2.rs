use std::path::Path;

use quick_xml::{Reader, events::Event};

use crate::domain::error::{AppError, AppResult};

use super::{ParsedBook, chapter, sanitize::escape_html, title_from_path};

pub fn parse(path: &Path) -> AppResult<ParsedBook> {
    let source = std::fs::read_to_string(path).map_err(|_| AppError::Validation {
        message: "FB2-файл должен содержать корректный UTF-8 XML.".to_string(),
    })?;
    let mut reader = Reader::from_str(&source);
    reader.config_mut().trim_text(true);
    let mut html = String::new();
    let mut title = None;
    let mut in_book_title = false;
    let mut in_title = false;
    let mut in_paragraph = false;

    loop {
        match reader.read_event() {
            Ok(Event::Start(event)) => match event.name().as_ref() {
                b"book-title" => in_book_title = true,
                b"title" => in_title = true,
                b"p" => {
                    in_paragraph = true;
                    html.push_str("<p>");
                }
                b"subtitle" => html.push_str("<h2>"),
                b"emphasis" => html.push_str("<em>"),
                b"strong" => html.push_str("<strong>"),
                _ => {}
            },
            Ok(Event::End(event)) => match event.name().as_ref() {
                b"book-title" => in_book_title = false,
                b"title" => in_title = false,
                b"p" => {
                    in_paragraph = false;
                    html.push_str("</p>");
                }
                b"subtitle" => html.push_str("</h2>"),
                b"emphasis" => html.push_str("</em>"),
                b"strong" => html.push_str("</strong>"),
                _ => {}
            },
            Ok(Event::Text(event)) => {
                let value = event.decode().map_err(|error| AppError::Validation {
                    message: format!("Не удалось прочитать FB2: {error}"),
                })?;
                if in_book_title && title.is_none() {
                    title = Some(value.trim().to_string());
                }
                if in_title || in_paragraph {
                    html.push_str(&escape_html(&value));
                }
            }
            Ok(Event::Eof) => break,
            Err(error) => {
                return Err(AppError::Validation {
                    message: format!("Повреждённый FB2 XML: {error}"),
                });
            }
            _ => {}
        }
    }

    let title = title.unwrap_or_else(|| title_from_path(path));
    Ok(ParsedBook {
        title: Some(title.clone()),
        chapters: vec![chapter("chapter-0", title, html)],
    })
}
