use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::error::{AppError, AppResult};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct HistoryEntry {
    pub id: String,
    pub work_id: String,
    pub work_title: String,
    pub chapter_id: Option<String>,
    pub page_index: Option<u32>,
    pub opened_at: String,
    pub closed_at: Option<String>,
}

pub struct HistoryRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> HistoryRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn start(
        &self,
        work_id: &str,
        chapter_id: Option<&str>,
        page_index: Option<u32>,
    ) -> AppResult<String> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO history (id, work_id, chapter_id, page_index, opened_at)
             VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, work_id, chapter_id, page_index.map(i64::from), now],
        )?;
        let affected = transaction.execute(
            "UPDATE works
             SET last_opened_at = ?2, updated_at = ?2,
                 status = CASE WHEN status = 'planned' THEN 'reading' ELSE status END
             WHERE id = ?1",
            params![work_id, now],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound { entity: "work" });
        }
        transaction.commit()?;
        Ok(id)
    }

    pub fn finish(
        &self,
        id: &str,
        chapter_id: Option<&str>,
        page_index: Option<u32>,
    ) -> AppResult<()> {
        let affected = self.connection.execute(
            "UPDATE history
             SET chapter_id = COALESCE(?2, chapter_id),
                 page_index = COALESCE(?3, page_index),
                 closed_at = ?4
             WHERE id = ?1",
            params![
                id,
                chapter_id,
                page_index.map(i64::from),
                chrono::Utc::now().to_rfc3339(),
            ],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound {
                entity: "reading_session",
            });
        }
        Ok(())
    }

    pub fn list(&self, limit: u32) -> AppResult<Vec<HistoryEntry>> {
        let mut statement = self.connection.prepare(
            "SELECT h.id, h.work_id, w.title, h.chapter_id, h.page_index,
                    h.opened_at, h.closed_at
             FROM history h
             JOIN works w ON w.id = h.work_id
             ORDER BY h.opened_at DESC
             LIMIT ?1",
        )?;
        let rows = statement.query_map([limit.clamp(1, 500)], |row| {
            Ok(HistoryEntry {
                id: row.get(0)?,
                work_id: row.get(1)?,
                work_title: row.get(2)?,
                chapter_id: row.get(3)?,
                page_index: row.get(4)?,
                opened_at: row.get(5)?,
                closed_at: row.get(6)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn clear(&self) -> AppResult<()> {
        self.connection.execute("DELETE FROM history", [])?;
        Ok(())
    }
}
