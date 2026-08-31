use rusqlite::{Connection, OptionalExtension, params};

use crate::domain::error::AppResult;

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct CacheRecord {
    pub cache_key: String,
    pub source_id: String,
    pub page_url: String,
    pub file_name: String,
    pub media_type: String,
    pub size_bytes: u64,
    pub pinned: bool,
    pub created_at: String,
    pub last_accessed_at: String,
}

pub struct CacheRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> CacheRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn get(&self, source_id: &str, page_url: &str) -> AppResult<Option<CacheRecord>> {
        self.connection
            .query_row(
                "SELECT cache_key, source_id, page_url, file_name, media_type,
                        size_bytes, pinned, created_at, last_accessed_at
                 FROM source_cache_entries
                 WHERE source_id = ?1 AND page_url = ?2",
                params![source_id, page_url],
                map_record,
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn upsert(&self, record: &CacheRecord) -> AppResult<Option<String>> {
        let previous = self
            .connection
            .query_row(
                "SELECT file_name FROM source_cache_entries
                 WHERE source_id = ?1 AND page_url = ?2",
                params![record.source_id, record.page_url],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        self.connection.execute(
            "INSERT INTO source_cache_entries (
                cache_key, source_id, page_url, file_name, media_type,
                size_bytes, pinned, created_at, last_accessed_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
             ON CONFLICT(source_id, page_url) DO UPDATE SET
                cache_key = excluded.cache_key,
                file_name = excluded.file_name,
                media_type = excluded.media_type,
                size_bytes = excluded.size_bytes,
                pinned = MAX(source_cache_entries.pinned, excluded.pinned),
                last_accessed_at = excluded.last_accessed_at",
            params![
                record.cache_key,
                record.source_id,
                record.page_url,
                record.file_name,
                record.media_type,
                i64::try_from(record.size_bytes).unwrap_or(i64::MAX),
                i64::from(record.pinned),
                record.created_at,
                record.last_accessed_at,
            ],
        )?;
        Ok(previous)
    }

    pub fn touch(&self, cache_key: &str) -> AppResult<()> {
        self.connection.execute(
            "UPDATE source_cache_entries SET last_accessed_at = ?2 WHERE cache_key = ?1",
            params![cache_key, chrono::Utc::now().to_rfc3339()],
        )?;
        Ok(())
    }

    pub fn set_pinned(&self, cache_key: &str) -> AppResult<bool> {
        let affected = self.connection.execute(
            "UPDATE source_cache_entries
             SET pinned = 1, last_accessed_at = ?2
             WHERE cache_key = ?1",
            params![cache_key, chrono::Utc::now().to_rfc3339()],
        )?;
        Ok(affected > 0)
    }

    pub fn remove(&self, cache_key: &str) -> AppResult<()> {
        self.connection.execute(
            "DELETE FROM source_cache_entries WHERE cache_key = ?1",
            [cache_key],
        )?;
        Ok(())
    }

    pub fn records(&self, transient_only: bool) -> AppResult<Vec<CacheRecord>> {
        let query = if transient_only {
            "SELECT cache_key, source_id, page_url, file_name, media_type,
                    size_bytes, pinned, created_at, last_accessed_at
             FROM source_cache_entries WHERE pinned = 0 ORDER BY last_accessed_at ASC"
        } else {
            "SELECT cache_key, source_id, page_url, file_name, media_type,
                    size_bytes, pinned, created_at, last_accessed_at
             FROM source_cache_entries ORDER BY last_accessed_at ASC"
        };
        let mut statement = self.connection.prepare(query)?;
        let rows = statement.query_map([], map_record)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn records_for_source(&self, source_id: &str) -> AppResult<Vec<CacheRecord>> {
        let mut statement = self.connection.prepare(
            "SELECT cache_key, source_id, page_url, file_name, media_type,
                    size_bytes, pinned, created_at, last_accessed_at
             FROM source_cache_entries
             WHERE source_id = ?1
             ORDER BY last_accessed_at ASC",
        )?;
        let rows = statement.query_map([source_id], map_record)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn totals(&self) -> AppResult<(u64, u64, usize)> {
        self.connection
            .query_row(
                "SELECT COALESCE(SUM(size_bytes), 0),
                        COALESCE(SUM(CASE WHEN pinned = 1 THEN size_bytes ELSE 0 END), 0),
                        COUNT(*)
                 FROM source_cache_entries",
                [],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)? as u64,
                        row.get::<_, i64>(1)? as u64,
                        row.get::<_, i64>(2)? as usize,
                    ))
                },
            )
            .map_err(Into::into)
    }
}

fn map_record(row: &rusqlite::Row<'_>) -> rusqlite::Result<CacheRecord> {
    Ok(CacheRecord {
        cache_key: row.get(0)?,
        source_id: row.get(1)?,
        page_url: row.get(2)?,
        file_name: row.get(3)?,
        media_type: row.get(4)?,
        size_bytes: row.get::<_, i64>(5)? as u64,
        pinned: row.get::<_, i64>(6)? != 0,
        created_at: row.get(7)?,
        last_accessed_at: row.get(8)?,
    })
}
