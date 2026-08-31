use std::{error::Error as StdError, io};

use rusqlite::{Connection, OptionalExtension, params, types::Type};

use crate::domain::{
    error::{AppError, AppResult},
    reader::{ProgressUpdate, ReaderLocator, ReaderMode, ReadingProgress},
};

pub struct ProgressRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> ProgressRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn get(&self, work_id: &str) -> AppResult<Option<ReadingProgress>> {
        self.query_one("work_id", work_id)
    }

    pub fn get_by_content_identity(
        &self,
        content_identity: &str,
    ) -> AppResult<Option<ReadingProgress>> {
        self.query_one("content_identity", content_identity)
    }

    pub fn save(&self, update: &ProgressUpdate) -> AppResult<ReadingProgress> {
        if !update.percent.is_finite() {
            return Err(AppError::Validation {
                message: "Позиция чтения содержит некорректный процент.".to_string(),
            });
        }
        let content_identity = self
            .connection
            .query_row(
                "SELECT content_identity FROM works WHERE id = ?1",
                [&update.work_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or(AppError::NotFound { entity: "work" })?;
        let locator_json =
            serde_json::to_string(&update.locator).map_err(|_| AppError::Validation {
                message: "Не удалось сохранить позицию чтения.".to_string(),
            })?;
        let percent = update.percent.clamp(0.0, 1.0);
        let reader_mode = update.locator.mode();
        let now = chrono::Utc::now().to_rfc3339();
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO reading_progress (
                content_identity, work_id, locator_json, percent, reader_mode, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
             ON CONFLICT(content_identity) DO UPDATE SET
                work_id = excluded.work_id,
                locator_json = excluded.locator_json,
                percent = excluded.percent,
                reader_mode = excluded.reader_mode,
                updated_at = excluded.updated_at",
            params![
                content_identity,
                update.work_id,
                locator_json,
                percent,
                reader_mode.as_str(),
                now,
            ],
        )?;
        transaction.execute(
            "UPDATE works
             SET updated_at = ?2,
                 last_opened_at = COALESCE(last_opened_at, ?2),
                 status = CASE WHEN status = 'planned' THEN 'reading' ELSE status END
             WHERE id = ?1",
            params![update.work_id, now],
        )?;
        transaction.commit()?;
        self.get_by_content_identity(&content_identity)?
            .ok_or(AppError::NotFound {
                entity: "reading_progress",
            })
    }

    fn query_one(&self, column: &str, value: &str) -> AppResult<Option<ReadingProgress>> {
        let sql = format!(
            "SELECT content_identity, work_id, locator_json, percent, reader_mode, updated_at
             FROM reading_progress WHERE {column} = ?1"
        );
        self.connection
            .query_row(&sql, [value], map_progress)
            .optional()
            .map_err(Into::into)
    }
}

fn map_progress(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReadingProgress> {
    let locator_json: String = row.get(2)?;
    let locator = serde_json::from_str::<ReaderLocator>(&locator_json)
        .map_err(|error| conversion_error(2, Box::new(error)))?;
    let reader_mode = parse_reader_mode(&row.get::<_, String>(4)?)
        .ok_or_else(|| conversion_message(4, "unknown reader mode"))?;
    if locator.mode() != reader_mode {
        return Err(conversion_message(2, "locator mode mismatch"));
    }
    Ok(ReadingProgress {
        content_identity: row.get(0)?,
        work_id: row.get(1)?,
        locator,
        percent: row.get(3)?,
        reader_mode,
        updated_at: row.get(5)?,
    })
}

fn parse_reader_mode(value: &str) -> Option<ReaderMode> {
    match value {
        "book" => Some(ReaderMode::Book),
        "pdf" => Some(ReaderMode::Pdf),
        "manga" => Some(ReaderMode::Manga),
        _ => None,
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
