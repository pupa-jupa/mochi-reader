use std::{error::Error as StdError, io};

use rusqlite::{Connection, OptionalExtension, params, types::Type};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::{
    error::{AppError, AppResult},
    reader::ReaderLocator,
    work::WorkKind,
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ReadingSession {
    pub id: String,
    pub content_identity: String,
    pub work_id: String,
    pub work_title: String,
    pub work_kind: WorkKind,
    pub cover_path: Option<String>,
    pub start_locator: ReaderLocator,
    pub end_locator: Option<ReaderLocator>,
    pub started_at: String,
    pub ended_at: Option<String>,
    pub duration_seconds: Option<u64>,
}

pub struct ReadingSessionRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> ReadingSessionRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn start(&self, work_id: &str, locator: &ReaderLocator) -> AppResult<String> {
        let content_identity = self
            .connection
            .query_row(
                "SELECT content_identity FROM works WHERE id = ?1",
                [work_id],
                |row| row.get::<_, String>(0),
            )
            .optional()?
            .ok_or(AppError::NotFound { entity: "work" })?;
        let locator_json = serialize_locator(locator)?;
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO reading_sessions (
                id, content_identity, work_id, start_locator_json, started_at
             ) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, content_identity, work_id, locator_json, now],
        )?;
        transaction.execute(
            "UPDATE works
             SET last_opened_at = ?2, updated_at = ?2,
                 status = CASE WHEN status = 'planned' THEN 'reading' ELSE status END
             WHERE id = ?1",
            params![work_id, now],
        )?;
        transaction.commit()?;
        Ok(id)
    }

    pub fn finish(&self, id: &str, locator: &ReaderLocator) -> AppResult<()> {
        let locator_json = serialize_locator(locator)?;
        let now = chrono::Utc::now().to_rfc3339();
        let affected = self.connection.execute(
            "UPDATE reading_sessions
             SET end_locator_json = ?2,
                 ended_at = ?3,
                 duration_seconds = MAX(
                    0,
                    CAST(ROUND((julianday(?3) - julianday(started_at)) * 86400) AS INTEGER)
                 )
             WHERE id = ?1",
            params![id, locator_json, now],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound {
                entity: "reading_session",
            });
        }
        Ok(())
    }

    pub fn list(&self, limit: u32) -> AppResult<Vec<ReadingSession>> {
        let mut statement = self.connection.prepare(
            "SELECT s.id, s.content_identity, s.work_id, w.title, w.kind, w.cover_path,
                    s.start_locator_json, s.end_locator_json, s.started_at, s.ended_at,
                    s.duration_seconds
             FROM reading_sessions s
             JOIN works w ON w.id = s.work_id
             ORDER BY s.started_at DESC
             LIMIT ?1",
        )?;
        let rows = statement.query_map([limit.clamp(1, 500)], map_session)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        if self
            .connection
            .execute("DELETE FROM reading_sessions WHERE id = ?1", [id])?
            == 0
        {
            return Err(AppError::NotFound {
                entity: "reading_session",
            });
        }
        Ok(())
    }

    pub fn clear(&self) -> AppResult<()> {
        self.connection
            .execute("DELETE FROM reading_sessions", [])?;
        Ok(())
    }
}

fn map_session(row: &rusqlite::Row<'_>) -> rusqlite::Result<ReadingSession> {
    let start_json: String = row.get(6)?;
    let end_json: Option<String> = row.get(7)?;
    let start_locator = parse_locator(6, &start_json)?;
    let end_locator = end_json
        .as_deref()
        .map(|value| parse_locator(7, value))
        .transpose()?;
    let work_kind = match row.get::<_, String>(4)?.as_str() {
        "book" => WorkKind::Book,
        "manga" => WorkKind::Manga,
        _ => return Err(conversion_message(4, "unknown work kind")),
    };
    Ok(ReadingSession {
        id: row.get(0)?,
        content_identity: row.get(1)?,
        work_id: row.get(2)?,
        work_title: row.get(3)?,
        work_kind,
        cover_path: row.get(5)?,
        start_locator,
        end_locator,
        started_at: row.get(8)?,
        ended_at: row.get(9)?,
        duration_seconds: row
            .get::<_, Option<i64>>(10)?
            .and_then(|value| u64::try_from(value).ok()),
    })
}

fn serialize_locator(locator: &ReaderLocator) -> AppResult<String> {
    serde_json::to_string(locator).map_err(|_| AppError::Validation {
        message: "Не удалось сохранить позицию сессии чтения.".to_string(),
    })
}

fn parse_locator(index: usize, value: &str) -> rusqlite::Result<ReaderLocator> {
    serde_json::from_str(value).map_err(|error| conversion_error(index, Box::new(error)))
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
