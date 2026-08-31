use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use uuid::Uuid;

use crate::domain::error::{AppError, AppResult};

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

pub struct CollectionRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> CollectionRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn create(&self, title: &str, description: Option<&str>) -> AppResult<String> {
        let title = title.trim();
        if title.is_empty() || title.chars().count() > 120 {
            return Err(AppError::Validation {
                message: "Название коллекции должно содержать от 1 до 120 символов.".to_string(),
            });
        }
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
        self.connection.execute(
            "INSERT OR IGNORE INTO collection_items (collection_id, work_id, added_at)
             VALUES (?1, ?2, ?3)",
            params![collection_id, work_id, chrono::Utc::now().to_rfc3339()],
        )?;
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
        let rows = statement.query_map([], |row| {
            Ok(CollectionSummary {
                id: row.get(0)?,
                title: row.get(1)?,
                description: row.get(2)?,
                item_count: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?;
        rows.collect::<Result<Vec<_>, _>>().map_err(Into::into)
    }
}

fn normalized_text(value: Option<&str>) -> Option<String> {
    value
        .map(str::trim)
        .filter(|value| !value.is_empty())
        .map(ToOwned::to_owned)
}
