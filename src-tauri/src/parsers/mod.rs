use std::path::Path;

use serde::{Deserialize, Serialize};

use crate::domain::{error::AppResult, work::WorkFormat};

mod epub;
mod fb2;
mod html;
mod markdown;
mod sanitize;
mod text;

pub use sanitize::sanitize_book_html;

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedChapter {
    pub id: String,
    pub title: String,
    pub html: String,
    pub plain_text_length: usize,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ParsedBook {
    pub title: Option<String>,
    pub chapters: Vec<ParsedChapter>,
}

pub fn parse_book(path: &Path, format: WorkFormat) -> AppResult<ParsedBook> {
    match format {
        WorkFormat::Epub => epub::parse(path),
        WorkFormat::Fb2 => fb2::parse(path),
        WorkFormat::Txt => text::parse(path),
        WorkFormat::Html => html::parse(path),
        WorkFormat::Markdown => markdown::parse(path),
        _ => Err(crate::domain::error::AppError::Validation {
            message: "Для этого формата нужен другой режим чтения.".to_string(),
        }),
    }
}

fn chapter(id: impl Into<String>, title: impl Into<String>, html: String) -> ParsedChapter {
    ParsedChapter {
        id: id.into(),
        title: title.into(),
        plain_text_length: plain_text(&html).chars().count(),
        html,
    }
}

fn title_from_path(path: &Path) -> String {
    path.file_stem()
        .and_then(|value| value.to_str())
        .filter(|value| !value.trim().is_empty())
        .unwrap_or("Без названия")
        .trim()
        .to_string()
}

fn plain_text(html: &str) -> String {
    let mut text = String::with_capacity(html.len());
    let mut inside_tag = false;
    let mut pending_space = false;
    for character in html.chars() {
        match character {
            '<' => {
                inside_tag = true;
                pending_space = true;
            }
            '>' => inside_tag = false,
            _ if !inside_tag => {
                if pending_space && !text.is_empty() && !text.ends_with(char::is_whitespace) {
                    text.push(' ');
                }
                pending_space = false;
                text.push(character);
            }
            _ => {}
        }
    }
    text.split_whitespace().collect::<Vec<_>>().join(" ")
}
