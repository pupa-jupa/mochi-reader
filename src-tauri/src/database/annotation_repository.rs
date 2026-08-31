use std::{error::Error as StdError, io};

use rusqlite::{Connection, OptionalExtension, Row, params, types::Type};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::{
    annotation::{
        AnnotationKind, AnnotationLocator, HighlightColor, ReaderAnnotation, ReaderAnnotationDraft,
        ReaderAnnotationUpdate, TextQuoteSelector,
    },
    error::{AppError, AppResult},
    reader::ReaderMode,
    work::WorkKind,
};

const MAX_QUOTE_CHARS: usize = 10_000;
const MAX_NOTE_CHARS: usize = 20_000;
const MAX_CONTEXT_CHARS: usize = 512;
const MAX_DOM_PATH_DEPTH: usize = 128;
const MAX_QUERY_ROWS: u32 = 5_000;

#[derive(Debug, Clone, Default, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AnnotationQuery {
    pub work_id: Option<String>,
    pub kind: Option<AnnotationKind>,
    pub search: Option<String>,
    pub limit: Option<u32>,
}

pub struct AnnotationRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> AnnotationRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn create(&self, draft: &ReaderAnnotationDraft) -> AppResult<ReaderAnnotation> {
        let quote = draft.quote.trim().to_string();
        let note = normalized_text(draft.note.as_deref());
        validate_annotation(draft.kind, &quote, note.as_deref(), &draft.locator)?;

        let (content_identity, work_kind, format) = self
            .connection
            .query_row(
                "SELECT content_identity, kind, format FROM works WHERE id = ?1",
                [&draft.work_id],
                |row| {
                    Ok((
                        row.get::<_, String>(0)?,
                        row.get::<_, String>(1)?,
                        row.get::<_, String>(2)?,
                    ))
                },
            )
            .optional()?
            .ok_or(AppError::NotFound { entity: "work" })?;
        validate_reader_match(&work_kind, &format, &draft.locator)?;

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let locator_json = serialize_locator(&draft.locator)?;
        let color = normalized_color(draft.kind, draft.color);
        self.connection.execute(
            "INSERT INTO reader_annotations (
                id, content_identity, work_id, annotation_type, quote, note,
                locator_json, color, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            params![
                id,
                content_identity,
                draft.work_id,
                draft.kind.as_str(),
                quote,
                note,
                locator_json,
                color.map(HighlightColor::as_str),
                now,
            ],
        )?;
        self.get(&id)
    }

    pub fn get(&self, id: &str) -> AppResult<ReaderAnnotation> {
        self.connection
            .query_row(
                "SELECT a.id, a.content_identity, a.work_id, w.title, w.kind, w.cover_path,
                        a.annotation_type, a.quote, a.note, a.locator_json, a.color,
                        a.created_at, a.updated_at
                 FROM reader_annotations a
                 JOIN works w ON w.id = a.work_id
                 WHERE a.id = ?1",
                [id],
                map_annotation,
            )
            .optional()?
            .ok_or(AppError::NotFound {
                entity: "reader_annotation",
            })
    }

    pub fn list(&self, query: &AnnotationQuery) -> AppResult<Vec<ReaderAnnotation>> {
        let work_id = normalized_text(query.work_id.as_deref());
        let kind = query.kind.map(AnnotationKind::as_str);
        let mut statement = self.connection.prepare(
            "SELECT a.id, a.content_identity, a.work_id, w.title, w.kind, w.cover_path,
                    a.annotation_type, a.quote, a.note, a.locator_json, a.color,
                    a.created_at, a.updated_at
             FROM reader_annotations a
             JOIN works w ON w.id = a.work_id
             WHERE (?1 IS NULL OR a.work_id = ?1)
               AND (?2 IS NULL OR a.annotation_type = ?2)
             ORDER BY a.created_at DESC
             LIMIT ?3",
        )?;
        let rows = statement.query_map(params![work_id, kind, MAX_QUERY_ROWS], map_annotation)?;
        let mut annotations = rows.collect::<Result<Vec<_>, _>>()?;

        if let Some(search) = normalized_text(query.search.as_deref()) {
            let search = search.to_lowercase();
            annotations.retain(|annotation| {
                annotation.work_title.to_lowercase().contains(&search)
                    || annotation.quote.to_lowercase().contains(&search)
                    || annotation
                        .note
                        .as_deref()
                        .is_some_and(|note| note.to_lowercase().contains(&search))
            });
        }
        annotations.truncate(query.limit.unwrap_or(500).clamp(1, 1_000) as usize);
        Ok(annotations)
    }

    pub fn update(&self, id: &str, update: &ReaderAnnotationUpdate) -> AppResult<ReaderAnnotation> {
        let current = self.get(id)?;
        let note = normalized_text(update.note.as_deref());
        if current.kind == AnnotationKind::Note && note.is_none() {
            return Err(AppError::Validation {
                message: "Текст заметки не может быть пустым.".to_string(),
            });
        }
        validate_text("Заметка", note.as_deref(), MAX_NOTE_CHARS)?;
        let color = match current.kind {
            AnnotationKind::Quote => None,
            AnnotationKind::Highlight | AnnotationKind::Note => update
                .color
                .or(current.color)
                .or_else(|| normalized_color(current.kind, None)),
        };
        let now = chrono::Utc::now().to_rfc3339();
        self.connection.execute(
            "UPDATE reader_annotations
             SET note = ?2, color = ?3, updated_at = ?4
             WHERE id = ?1",
            params![id, note, color.map(HighlightColor::as_str), now],
        )?;
        self.get(id)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        if self
            .connection
            .execute("DELETE FROM reader_annotations WHERE id = ?1", [id])?
            == 0
        {
            return Err(AppError::NotFound {
                entity: "reader_annotation",
            });
        }
        Ok(())
    }
}

fn validate_annotation(
    kind: AnnotationKind,
    quote: &str,
    note: Option<&str>,
    locator: &AnnotationLocator,
) -> AppResult<()> {
    validate_text("Цитата", Some(quote), MAX_QUOTE_CHARS)?;
    validate_text("Заметка", note, MAX_NOTE_CHARS)?;
    if matches!(kind, AnnotationKind::Highlight | AnnotationKind::Quote) && quote.is_empty() {
        return Err(AppError::Validation {
            message: "Для цитаты или подсветки нужно выделить текст.".to_string(),
        });
    }
    if kind == AnnotationKind::Note && note.is_none() {
        return Err(AppError::Validation {
            message: "Текст заметки не может быть пустым.".to_string(),
        });
    }

    match locator {
        AnnotationLocator::Book {
            chapter_id,
            start_offset,
            end_offset,
            quote: selector,
            dom_range,
        } => {
            validate_identifier("Глава", chapter_id)?;
            if end_offset < start_offset
                || (matches!(kind, AnnotationKind::Highlight | AnnotationKind::Quote)
                    && end_offset == start_offset)
            {
                return Err(AppError::Validation {
                    message: "Выделение содержит некорректный диапазон текста.".to_string(),
                });
            }
            i64::try_from(*start_offset).map_err(|_| AppError::Validation {
                message: "Позиция выделения слишком велика.".to_string(),
            })?;
            i64::try_from(*end_offset).map_err(|_| AppError::Validation {
                message: "Позиция выделения слишком велика.".to_string(),
            })?;
            validate_text_selector(selector)?;
            if !quote.is_empty() && selector.exact.trim() != quote {
                return Err(AppError::Validation {
                    message: "Цитата не совпадает с выбранным диапазоном текста.".to_string(),
                });
            }
            if dom_range.as_ref().is_some_and(|range| {
                range.start_path.len() > MAX_DOM_PATH_DEPTH
                    || range.end_path.len() > MAX_DOM_PATH_DEPTH
            }) {
                return Err(AppError::Validation {
                    message: "Путь к выделенному тексту слишком глубокий.".to_string(),
                });
            }
        }
        AnnotationLocator::Pdf { quote, rects, .. } => {
            if let Some(selector) = quote {
                validate_text_selector(selector)?;
            }
            if rects.len() > 1_000
                || rects.iter().any(|rect| {
                    !rect.x.is_finite()
                        || !rect.y.is_finite()
                        || !rect.width.is_finite()
                        || !rect.height.is_finite()
                        || rect.x < 0.0
                        || rect.y < 0.0
                        || rect.width <= 0.0
                        || rect.height <= 0.0
                })
            {
                return Err(AppError::Validation {
                    message: "PDF-аннотация содержит некорректные координаты.".to_string(),
                });
            }
        }
        AnnotationLocator::Manga { chapter_id, .. } => {
            if let Some(chapter_id) = chapter_id {
                validate_identifier("Глава", chapter_id)?;
            }
        }
    }
    Ok(())
}

fn validate_text_selector(selector: &TextQuoteSelector) -> AppResult<()> {
    validate_text("Цитата", Some(&selector.exact), MAX_QUOTE_CHARS)?;
    validate_text(
        "Контекст до цитаты",
        Some(&selector.prefix),
        MAX_CONTEXT_CHARS,
    )?;
    validate_text(
        "Контекст после цитаты",
        Some(&selector.suffix),
        MAX_CONTEXT_CHARS,
    )
}

fn validate_text(label: &str, value: Option<&str>, max_chars: usize) -> AppResult<()> {
    if value.is_some_and(|text| text.chars().count() > max_chars) {
        return Err(AppError::Validation {
            message: format!("{label} слишком длинная."),
        });
    }
    Ok(())
}

fn validate_identifier(label: &str, value: &str) -> AppResult<()> {
    let length = value.chars().count();
    if value.trim().is_empty() || length > 512 {
        return Err(AppError::Validation {
            message: format!("{label} содержит некорректный идентификатор."),
        });
    }
    Ok(())
}

fn validate_reader_match(kind: &str, format: &str, locator: &AnnotationLocator) -> AppResult<()> {
    let expected = if kind == "manga" {
        ReaderMode::Manga
    } else if format == "pdf" {
        ReaderMode::Pdf
    } else {
        ReaderMode::Book
    };
    if locator.mode() != expected {
        return Err(AppError::Validation {
            message: "Выбрана позиция аннотации из другого режима чтения.".to_string(),
        });
    }
    Ok(())
}

fn normalized_color(kind: AnnotationKind, color: Option<HighlightColor>) -> Option<HighlightColor> {
    match kind {
        AnnotationKind::Highlight => Some(color.unwrap_or(HighlightColor::Sakura)),
        AnnotationKind::Note => Some(color.unwrap_or(HighlightColor::Lavender)),
        AnnotationKind::Quote => None,
    }
}

fn normalized_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}

fn serialize_locator(locator: &AnnotationLocator) -> AppResult<String> {
    serde_json::to_string(locator).map_err(|_| AppError::Validation {
        message: "Не удалось сохранить позицию аннотации.".to_string(),
    })
}

fn map_annotation(row: &Row<'_>) -> rusqlite::Result<ReaderAnnotation> {
    let kind = parse_annotation_kind(6, &row.get::<_, String>(6)?)?;
    let locator_json: String = row.get(9)?;
    let locator = serde_json::from_str(&locator_json)
        .map_err(|error| conversion_error(9, Box::new(error)))?;
    let color = row
        .get::<_, Option<String>>(10)?
        .as_deref()
        .map(|value| parse_highlight_color(10, value))
        .transpose()?;
    let work_kind = match row.get::<_, String>(4)?.as_str() {
        "book" => WorkKind::Book,
        "manga" => WorkKind::Manga,
        _ => return Err(conversion_message(4, "unknown work kind")),
    };
    Ok(ReaderAnnotation {
        id: row.get(0)?,
        content_identity: row.get(1)?,
        work_id: row.get(2)?,
        work_title: row.get(3)?,
        work_kind,
        cover_path: row.get(5)?,
        kind,
        quote: row.get(7)?,
        note: row.get(8)?,
        locator,
        color,
        created_at: row.get(11)?,
        updated_at: row.get(12)?,
    })
}

fn parse_annotation_kind(index: usize, value: &str) -> rusqlite::Result<AnnotationKind> {
    match value {
        "highlight" => Ok(AnnotationKind::Highlight),
        "note" => Ok(AnnotationKind::Note),
        "quote" => Ok(AnnotationKind::Quote),
        _ => Err(conversion_message(index, "unknown annotation kind")),
    }
}

fn parse_highlight_color(index: usize, value: &str) -> rusqlite::Result<HighlightColor> {
    match value {
        "sakura" => Ok(HighlightColor::Sakura),
        "peach" => Ok(HighlightColor::Peach),
        "lavender" => Ok(HighlightColor::Lavender),
        "butter" => Ok(HighlightColor::Butter),
        "mint" => Ok(HighlightColor::Mint),
        _ => Err(conversion_message(index, "unknown highlight color")),
    }
}

fn conversion_message(index: usize, message: &'static str) -> rusqlite::Error {
    conversion_error(
        index,
        Box::new(io::Error::new(io::ErrorKind::InvalidData, message)),
    )
}

fn conversion_error(index: usize, error: Box<dyn StdError + Send + Sync>) -> rusqlite::Error {
    rusqlite::Error::FromSqlConversionFailure(index, Type::Text, error)
}
