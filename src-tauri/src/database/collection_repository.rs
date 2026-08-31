use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::{
    database::work_repository::map_work_summary,
    domain::{
        error::{AppError, AppResult},
        work::WorkSummary,
    },
};

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionSummary {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub item_count: u32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct CollectionDetails {
    pub id: String,
    pub title: String,
    pub description: Option<String>,
    pub item_count: u32,
    pub created_at: String,
    pub updated_at: String,
    pub items: Vec<WorkSummary>,
}

pub struct CollectionRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> CollectionRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn create(&self, title: &str, description: Option<&str>) -> AppResult<String> {
        let title = validated_title(title)?;
        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        self.connection.execute(
            "INSERT INTO collections (id, title, description, created_at, updated_at)
             VALUES (?1, ?2, ?3, ?4, ?4)",
            params![id, title, normalized_text(description), now],
        )?;
        Ok(id)
    }

    pub fn add_work(&self, collection_id: &str, work_id: &str) -> AppResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute(
            "INSERT OR IGNORE INTO collection_items (collection_id, work_id, added_at)
             VALUES (?1, ?2, ?3)",
            params![collection_id, work_id, now],
        )?;
        if transaction.execute(
            "UPDATE collections SET updated_at = ?2 WHERE id = ?1",
            params![collection_id, now],
        )? == 0
        {
            return Err(AppError::NotFound {
                entity: "collection",
            });
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn get(&self, id: &str) -> AppResult<CollectionDetails> {
        let summary = self
            .connection
            .query_row(
                "SELECT c.id, c.title, c.description, COUNT(ci.work_id),
                        c.created_at, c.updated_at
                 FROM collections c
                 LEFT JOIN collection_items ci ON ci.collection_id = c.id
                 WHERE c.id = ?1
                 GROUP BY c.id",
                [id],
                map_collection_summary,
            )
            .optional()?
            .ok_or(AppError::NotFound {
                entity: "collection",
            })?;
        let mut statement = self.connection.prepare(
            "SELECT
                w.id, w.title, w.author, w.kind, w.format, w.cover_path, w.status,
                w.favorite, w.missing_file, w.added_at, w.last_opened_at,
                COALESCE(p.percent * 100.0, 0.0)
             FROM collection_items ci
             JOIN works w ON w.id = ci.work_id
             LEFT JOIN reading_progress p ON p.work_id = w.id
             WHERE ci.collection_id = ?1
             ORDER BY ci.added_at DESC, w.title COLLATE NOCASE ASC",
        )?;
        let items = statement
            .query_map([id], map_work_summary)?
            .collect::<Result<Vec<_>, _>>()?;
        Ok(CollectionDetails {
            id: summary.id,
            title: summary.title,
            description: summary.description,
            item_count: summary.item_count,
            created_at: summary.created_at,
            updated_at: summary.updated_at,
            items,
        })
    }

    pub fn update(&self, id: &str, title: &str, description: Option<&str>) -> AppResult<()> {
        let title = validated_title(title)?;
        let affected = self.connection.execute(
            "UPDATE collections
             SET title = ?2, description = ?3, updated_at = ?4
             WHERE id = ?1",
            params![
                id,
                title,
                normalized_text(description),
                chrono::Utc::now().to_rfc3339()
            ],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound {
                entity: "collection",
            });
        }
        Ok(())
    }

    pub fn remove_work(&self, collection_id: &str, work_id: &str) -> AppResult<()> {
        let transaction = self.connection.unchecked_transaction()?;
        let affected = transaction.execute(
            "DELETE FROM collection_items WHERE collection_id = ?1 AND work_id = ?2",
            params![collection_id, work_id],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound {
                entity: "collection_item",
            });
        }
        transaction.execute(
            "UPDATE collections SET updated_at = ?2 WHERE id = ?1",
            params![collection_id, chrono::Utc::now().to_rfc3339()],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn delete(&self, id: &str) -> AppResult<()> {
        if self
            .connection
            .execute("DELETE FROM collections WHERE id = ?1", [id])?
            == 0
        {
            return Err(AppError::NotFound {
                entity: "collection",
            });
        }
        Ok(())
    }

    pub fn list(&self) -> AppResult<Vec<CollectionSummary>> {
        let mut statement = self.connection.prepare(
            "SELECT c.id, c.title, c.description, COUNT(ci.work_id), c.created_at, c.updated_at
             FROM collections c
             LEFT JOIN collection_items ci ON ci.collection_id = c.id
             GROUP BY c.id
             ORDER BY c.updated_at DESC",
        )?;
        let rows = statement.query_map([], map_collection_summary)?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

fn map_collection_summary(row: &rusqlite::Row<'_>) -> rusqlite::Result<CollectionSummary> {
    Ok(CollectionSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        description: row.get(2)?,
        item_count: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

fn validated_title(value: &str) -> AppResult<&str> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 120 {
        return Err(AppError::Validation {
            message: "Название коллекции должно содержать от 1 до 120 символов.".to_string(),
        });
    }
    Ok(value)
}

fn normalized_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
