use rusqlite::{Connection, OptionalExtension, params};
use serde_json::Value;
use uuid::Uuid;

use crate::{
    domain::error::{AppError, AppResult},
    sources::model::{AdapterKind, SourceCapabilities, SourceConfig, ValidatedSource},
};

#[derive(Debug, Clone)]
pub struct StoredSource {
    pub source: SourceConfig,
    pub config: Value,
}

pub struct SourceRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> SourceRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn upsert(&self, source: &ValidatedSource) -> AppResult<String> {
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let config_json =
            serde_json::to_string(&source.config).map_err(|error| AppError::Validation {
                message: format!("Не удалось сохранить конфигурацию источника: {error}"),
            })?;
        self.connection.execute(
            "INSERT INTO sources (
                id, name, base_url, adapter_kind, config_json,
                supports_search, supports_download, created_at, updated_at
             ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?8)
             ON CONFLICT(base_url, adapter_kind) DO UPDATE SET
                name = excluded.name,
                config_json = excluded.config_json,
                supports_search = excluded.supports_search,
                supports_download = excluded.supports_download,
                updated_at = excluded.updated_at",
            params![
                id,
                source.name,
                source.base_url,
                source.adapter_kind.as_str(),
                config_json,
                i64::from(source.capabilities.search),
                i64::from(source.capabilities.download),
                now,
            ],
        )?;
        self.connection
            .query_row(
                "SELECT id FROM sources WHERE base_url = ?1 AND adapter_kind = ?2",
                params![source.base_url, source.adapter_kind.as_str()],
                |row| row.get(0),
            )
            .map_err(Into::into)
    }

    pub fn list(&self) -> AppResult<Vec<SourceConfig>> {
        let mut statement = self.connection.prepare(
            "SELECT id, name, base_url, adapter_kind, enabled,
                    supports_search, supports_download, created_at, updated_at
             FROM sources ORDER BY name COLLATE NOCASE",
        )?;
        let rows = statement.query_map([], |row| {
            Ok(SourceConfig {
                id: row.get(0)?,
                name: row.get(1)?,
                base_url: row.get(2)?,
                adapter_kind: parse_adapter_kind(&row.get::<_, String>(3)?),
                enabled: row.get::<_, i64>(4)? != 0,
                capabilities: SourceCapabilities {
                    search: row.get::<_, i64>(5)? != 0,
                    download: row.get::<_, i64>(6)? != 0,
                },
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }

    pub fn get(&self, id: &str) -> AppResult<SourceConfig> {
        self.connection
            .query_row(
                "SELECT id, name, base_url, adapter_kind, enabled,
                        supports_search, supports_download, created_at, updated_at
                 FROM sources WHERE id = ?1",
                [id],
                map_source,
            )
            .optional()?
            .ok_or(AppError::NotFound { entity: "source" })
    }

    pub fn get_stored(&self, id: &str) -> AppResult<StoredSource> {
        let (source, config_json) = self
            .connection
            .query_row(
                "SELECT id, name, base_url, adapter_kind, enabled,
                        supports_search, supports_download, created_at, updated_at, config_json
                 FROM sources WHERE id = ?1",
                [id],
                |row| Ok((map_source(row)?, row.get::<_, String>(9)?)),
            )
            .optional()?
            .ok_or(AppError::NotFound { entity: "source" })?;
        let config = serde_json::from_str(&config_json).map_err(|_| AppError::Validation {
            message: "Сохранённая конфигурация источника повреждена.".to_string(),
        })?;
        Ok(StoredSource { source, config })
    }

    pub fn set_enabled(&self, id: &str, enabled: bool) -> AppResult<()> {
        let affected = self.connection.execute(
            "UPDATE sources SET enabled = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, i64::from(enabled), chrono::Utc::now().to_rfc3339()],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound { entity: "source" });
        }
        Ok(())
    }

    pub fn remove(&self, id: &str) -> AppResult<()> {
        if self
            .connection
            .execute("DELETE FROM sources WHERE id = ?1", [id])?
            == 0
        {
            return Err(AppError::NotFound { entity: "source" });
        }
        Ok(())
    }
}

fn map_source(row: &rusqlite::Row<'_>) -> rusqlite::Result<SourceConfig> {
    Ok(SourceConfig {
        id: row.get(0)?,
        name: row.get(1)?,
        base_url: row.get(2)?,
        adapter_kind: parse_adapter_kind(&row.get::<_, String>(3)?),
        enabled: row.get::<_, i64>(4)? != 0,
        capabilities: SourceCapabilities {
            search: row.get::<_, i64>(5)? != 0,
            download: row.get::<_, i64>(6)? != 0,
        },
        created_at: row.get(7)?,
        updated_at: row.get(8)?,
    })
}

fn parse_adapter_kind(value: &str) -> AdapterKind {
    match value {
        "generic_html" => AdapterKind::GenericHtml,
        "mangadex" => AdapterKind::Mangadex,
        _ => AdapterKind::Manifest,
    }
}
