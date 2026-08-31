use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BookmarkDraft {
    pub work_id: String,
    pub chapter_id: Option<String>,
    pub page_index: Option<u32>,
    pub char_offset: Option<u64>,
    pub percent: f64,
    pub excerpt: Option<String>,
    pub note: Option<String>,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct Bookmark {
    pub id: String,
    pub work_id: String,
    pub work_title: String,
    pub chapter_id: Option<String>,
    pub page_index: Option<u32>,
    pub char_offset: Option<u64>,
    pub percent: f64,
    pub excerpt: Option<String>,
    pub note: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

pub struct BookmarkRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> BookmarkRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn create(&self, draft: &BookmarkDraft) -> AppResult<String> {
        validate_text("Цитата", draft.excerpt.as_deref(), 4_000)?;
        validate_text("Заметка", draft.note.as_deref(), 20_000)?;
        if !draft.percent.is_finite() {
            return Err(AppError::Validation {
                message: "Закладка содержит некорректную позицию.".to_string(),
            });
        }
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let char_offset = draft
            .char_offset
            .map(i64::try_from)
            .transpose()
            .map_err(|_| AppError::Validation {
                message: "Позиция закладки слишком велика.".to_string(),
            })?;
        self.connection.execute(
            "INSERT INTO bookmarks (
                id, work_id, chapter_id, page_index, char_offset, percent,
                excerpt, note, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?9)",
            params![
                id,
                draft.work_id,
                draft.chapter_id,
                draft.page_index.map(i64::from),
                char_offset,
                draft.percent.clamp(0.0, 1.0),
                normalized_text(draft.excerpt.as_deref()),
                normalized_text(draft.note.as_deref()),
                now,
            ],
        )?;
        Ok(id)
    }

    pub fn list(&self) -> AppResult<Vec<Bookmark>> {
        let mut statement = self.connection.prepare(
            "SELECT b.id, b.work_id, w.title, b.chapter_id, b.page_index,
                    b.char_offset, b.percent, b.excerpt, b.note, b.created_at, b.updated_at
             FROM bookmarks b
             JOIN works w ON w.id = b.work_id
             ORDER BY b.created_at DESC",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(Bookmark {
                id: row.get(0)?,
                work_id: row.get(1)?,
                work_title: row.get(2)?,
                chapter_id: row.get(3)?,
                page_index: row.get(4)?,
                char_offset: row
                    .get::<_, Option<i64>>(5)?
                    .and_then(|value| u64::try_from(value).ok()),
                percent: row.get(6)?,
                excerpt: row.get(7)?,
                note: row.get(8)?,
                created_at: row.get(9)?,
                updated_at: row.get(10)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        if self
            .connection
            .execute("DELETE FROM bookmarks WHERE id = ?1", [id])?
            == 0
        {
            return Err(AppError::NotFound { entity: "bookmark" });
        }
        Ok(())
    }
}

fn validate_text(label: &str, value: Option<&str>, max_chars: usize) -> AppResult<()> {
    if value.is_some_and(|text| text.chars().count() > max_chars) {
        return Err(AppError::Validation {
            message: format!("{label} слишком длинная."),
        });
    }
    Ok(())
}

fn normalized_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
