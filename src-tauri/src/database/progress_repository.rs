use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::domain::error::{AppError, AppResult};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ReaderMode {
    Book,
    Pdf,
    Manga,
}

impl ReaderMode {
    fn as_str(self) -> &'static str {
        match self {
            Self::Book => "book",
            Self::Pdf => "pdf",
            Self::Manga => "manga",
        }
    }
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ProgressUpdate {
    pub work_id: String,
    pub chapter_id: Option<String>,
    pub page_index: Option<u32>,
    pub char_offset: Option<u64>,
    pub percent: f64,
    pub reader_mode: ReaderMode,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingProgress {
    pub work_id: String,
    pub chapter_id: Option<String>,
    pub page_index: Option<u32>,
    pub char_offset: Option<u64>,
    pub percent: f64,
    pub reader_mode: ReaderMode,
    pub updated_at: String,
}

pub struct ProgressRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> ProgressRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn get(&self, work_id: &str) -> AppResult<Option<ReadingProgress>> {
        self.connection
            .query_row(
                "SELECT work_id, chapter_id, page_index, char_offset, percent, reader_mode, updated_at
                 FROM reading_progress WHERE work_id = ?1",
                [work_id],
                |row| {
                    Ok(ReadingProgress {
                        work_id: row.get(0)?,
                        chapter_id: row.get(1)?,
                        page_index: row.get::<_, Option<u32>>(2)?,
                        char_offset: row
                            .get::<_, Option<i64>>(3)?
                            .and_then(|value| u64::try_from(value).ok()),
                        percent: row.get(4)?,
                        reader_mode: parse_reader_mode(&row.get::<_, String>(5)?),
                        updated_at: row.get(6)?,
                    })
                },
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn save(&self, update: &ProgressUpdate) -> AppResult<ReadingProgress> {
        if !update.percent.is_finite() {
            return Err(AppError::Validation {
                message: "Позиция чтения содержит некорректный процент.".to_string(),
            });
        }
        let percent = update.percent.clamp(0.0, 1.0);
        let page_index = update.page_index.map(i64::from);
        let char_offset = update
            .char_offset
            .map(i64::try_from)
            .transpose()
            .map_err(|_| AppError::Validation {
                message: "Позиция в тексте слишком велика.".to_string(),
            })?;
        let now = chrono::Utc::now().to_rfc3339();
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO reading_progress (
                work_id, chapter_id, page_index, char_offset, percent, reader_mode, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
             ON CONFLICT(work_id) DO UPDATE SET
                chapter_id = excluded.chapter_id,
                page_index = excluded.page_index,
                char_offset = excluded.char_offset,
                percent = excluded.percent,
                reader_mode = excluded.reader_mode,
                updated_at = excluded.updated_at",
            params![
                update.work_id,
                update.chapter_id,
                page_index,
                char_offset,
                percent,
                update.reader_mode.as_str(),
                now,
            ],
        )?;
        let affected = transaction.execute(
            "UPDATE works
             SET updated_at = ?2,
                 last_opened_at = COALESCE(last_opened_at, ?2),
                 status = CASE WHEN status = 'planned' THEN 'reading' ELSE status END
             WHERE id = ?1",
            params![update.work_id, now],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound { entity: "work" });
        }
        transaction.commit()?;
        self.get(&update.work_id)?.ok_or(AppError::NotFound {
            entity: "reading_progress",
        })
    }
}

fn parse_reader_mode(value: &str) -> ReaderMode {
    match value {
        "pdf" => ReaderMode::Pdf,
        "manga" => ReaderMode::Manga,
        _ => ReaderMode::Book,
    }
}
