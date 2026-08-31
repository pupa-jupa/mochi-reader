use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Row, params};
use uuid::Uuid;

use crate::domain::{
    error::{AppError, AppResult},
    work::{NewWork, WorkDetails, WorkFormat, WorkKind, WorkPage, WorkStatus, WorkSummary},
};

pub struct WorkRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> WorkRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn insert(&self, work: &NewWork) -> AppResult<String> {
        if work.title.trim().is_empty() {
            return Err(AppError::Validation {
                message: "Название произведения не может быть пустым.".to_string(),
            });
        }

        let id = Uuid::new_v4().to_string();
        let now = chrono::Utc::now().to_rfc3339();
        let file_size = i64::try_from(work.file_size).map_err(|_| AppError::Validation {
            message: "Файл слишком большой для импорта.".to_string(),
        })?;
        let source_path = work.source_path.to_string_lossy();
        let cover_path = work
            .cover_path
            .as_ref()
            .map(|path| path.to_string_lossy().into_owned());
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO works (
                id, title, author, kind, format, source_path, file_size, fingerprint,
                cover_path, page_count, chapter_count, added_at, updated_at
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12)",
            params![
                id,
                work.title.trim(),
                work.author.as_deref(),
                work.kind.as_str(),
                work.format.as_str(),
                source_path,
                file_size,
                work.fingerprint,
                cover_path,
                work.page_count,
                work.chapter_count,
                now,
            ],
        )?;
        transaction.execute(
            "INSERT INTO work_fts(work_id, title, author) VALUES (?1, ?2, ?3)",
            params![id, work.title.trim(), work.author.as_deref()],
        )?;
        transaction.commit()?;
        Ok(id)
    }

    pub fn get(&self, id: &str) -> AppResult<WorkDetails> {
        let mut work = self
            .connection
            .query_row(
                "SELECT
                    id, title, author, kind, format, cover_path, status, favorite,
                    missing_file, added_at, last_opened_at, original_title, description,
                    source_path, file_size, page_count, chapter_count,
                    COALESCE(reading_progress.percent * 100.0, 0.0)
                 FROM works
                 LEFT JOIN reading_progress ON reading_progress.work_id = works.id
                 WHERE id = ?1",
                [id],
                map_work_details,
            )
            .optional()?
            .ok_or(AppError::NotFound { entity: "work" })?;
        work.summary.missing_file = !Path::new(&work.source_path).exists();
        Ok(work)
    }

    pub fn list(&self, query: &str, offset: u32, limit: u32) -> AppResult<WorkPage> {
        let limit = limit.clamp(1, 200);
        let query = query.trim();
        let mut items = Vec::new();

        if query.is_empty() {
            let mut statement = self.connection.prepare(
                "SELECT
                    w.id, w.title, w.author, w.kind, w.format, w.cover_path, w.status,
                    w.favorite, w.missing_file, w.added_at, w.last_opened_at,
                    COALESCE(p.percent * 100.0, 0.0)
                 FROM works w
                 LEFT JOIN reading_progress p ON p.work_id = w.id
                 ORDER BY w.added_at DESC LIMIT ?1 OFFSET ?2",
            )?;
            let rows = statement.query_map(params![limit, offset], map_work_summary)?;
            for row in rows {
                items.push(row?);
            }
        } else {
            let fts_query = to_fts_prefix_query(query);
            let mut statement = self.connection.prepare(
                "SELECT
                    w.id, w.title, w.author, w.kind, w.format, w.cover_path, w.status,
                    w.favorite, w.missing_file, w.added_at, w.last_opened_at,
                    COALESCE(p.percent * 100.0, 0.0)
                 FROM works w
                 JOIN work_fts f ON f.work_id = w.id
                 LEFT JOIN reading_progress p ON p.work_id = w.id
                 WHERE work_fts MATCH ?1
                 ORDER BY rank, w.added_at DESC LIMIT ?2 OFFSET ?3",
            )?;
            let rows = statement.query_map(params![fts_query, limit, offset], map_work_summary)?;
            for row in rows {
                items.push(row?);
            }
        }

        let total: i64 = if query.is_empty() {
            self.connection
                .query_row("SELECT COUNT(*) FROM works", [], |row| row.get(0))?
        } else {
            let fts_query = to_fts_prefix_query(query);
            self.connection.query_row(
                "SELECT COUNT(*) FROM work_fts WHERE work_fts MATCH ?1",
                [fts_query],
                |row| row.get(0),
            )?
        };

        Ok(WorkPage {
            items,
            total: total as u64,
        })
    }

    pub fn remove(&self, id: &str) -> AppResult<()> {
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute("DELETE FROM work_fts WHERE work_id = ?1", [id])?;
        let affected = transaction.execute("DELETE FROM works WHERE id = ?1", [id])?;
        if affected == 0 {
            return Err(AppError::NotFound { entity: "work" });
        }
        transaction.commit()?;
        Ok(())
    }

    pub fn mark_opened(&self, id: &str) -> AppResult<()> {
        let now = chrono::Utc::now().to_rfc3339();
        let affected = self.connection.execute(
            "UPDATE works
             SET last_opened_at = ?2,
                 updated_at = ?2,
                 status = CASE WHEN status = 'planned' THEN 'reading' ELSE status END
             WHERE id = ?1",
            params![id, now],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound { entity: "work" });
        }
        Ok(())
    }

    pub fn set_favorite(&self, id: &str, favorite: bool) -> AppResult<()> {
        let affected = self.connection.execute(
            "UPDATE works SET favorite = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, i64::from(favorite), chrono::Utc::now().to_rfc3339()],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound { entity: "work" });
        }
        Ok(())
    }

    pub fn set_status(&self, id: &str, status: WorkStatus) -> AppResult<()> {
        let affected = self.connection.execute(
            "UPDATE works SET status = ?2, updated_at = ?3 WHERE id = ?1",
            params![id, status.as_str(), chrono::Utc::now().to_rfc3339()],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound { entity: "work" });
        }
        Ok(())
    }

    pub fn update_metadata(
        &self,
        id: &str,
        title: &str,
        author: Option<&str>,
        original_title: Option<&str>,
        description: Option<&str>,
    ) -> AppResult<()> {
        let title = title.trim();
        if title.is_empty() || title.chars().count() > 300 {
            return Err(AppError::Validation {
                message: "Название должно содержать от 1 до 300 символов.".to_string(),
            });
        }
        let author = normalize_optional(author, 300, "Имя автора")?;
        let original_title = normalize_optional(original_title, 300, "Оригинальное название")?;
        let description = normalize_optional(description, 20_000, "Описание")?;
        let transaction = self.connection.unchecked_transaction()?;
        let affected = transaction.execute(
            "UPDATE works SET title = ?2, author = ?3, original_title = ?4,
                    description = ?5, updated_at = ?6
             WHERE id = ?1",
            params![
                id,
                title,
                author,
                original_title,
                description,
                chrono::Utc::now().to_rfc3339(),
            ],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound { entity: "work" });
        }
        transaction.execute("DELETE FROM work_fts WHERE work_id = ?1", [id])?;
        transaction.execute(
            "INSERT INTO work_fts(work_id, title, author) VALUES (?1, ?2, ?3)",
            params![id, title, author],
        )?;
        transaction.commit()?;
        Ok(())
    }

    pub fn relink(&self, id: &str, source_path: &Path, file_size: u64) -> AppResult<()> {
        if !source_path.exists() {
            return Err(AppError::Validation {
                message: "Новый исходный файл не найден.".to_string(),
            });
        }
        let file_size = i64::try_from(file_size).map_err(|_| AppError::Validation {
            message: "Файл слишком большой.".to_string(),
        })?;
        let affected = self.connection.execute(
            "UPDATE works SET source_path = ?2, file_size = ?3, missing_file = 0,
                    updated_at = ?4
             WHERE id = ?1",
            params![
                id,
                source_path.to_string_lossy(),
                file_size,
                chrono::Utc::now().to_rfc3339(),
            ],
        )?;
        if affected == 0 {
            return Err(AppError::NotFound { entity: "work" });
        }
        Ok(())
    }
}

fn normalize_optional<'value>(
    value: Option<&'value str>,
    maximum: usize,
    field: &str,
) -> AppResult<Option<&'value str>> {
    let value = value.map(str::trim).filter(|value| !value.is_empty());
    if value.is_some_and(|value| value.chars().count() > maximum) {
        return Err(AppError::Validation {
            message: format!("{field} слишком длинное."),
        });
    }
    Ok(value)
}

fn to_fts_prefix_query(query: &str) -> String {
    query
        .split_whitespace()
        .filter(|term| !term.is_empty())
        .map(|term| format!("\"{}\"*", term.replace('"', "\"\"")))
        .collect::<Vec<_>>()
        .join(" AND ")
}

fn map_work_summary(row: &Row<'_>) -> rusqlite::Result<WorkSummary> {
    Ok(WorkSummary {
        id: row.get(0)?,
        title: row.get(1)?,
        author: row.get(2)?,
        kind: parse_kind(row.get::<_, String>(3)?.as_str()),
        format: parse_format(row.get::<_, String>(4)?.as_str()),
        cover_path: row.get(5)?,
        status: parse_status(row.get::<_, String>(6)?.as_str()),
        favorite: row.get::<_, i64>(7)? != 0,
        progress_percent: row.get(11)?,
        missing_file: row.get::<_, i64>(8)? != 0,
        added_at: row.get(9)?,
        last_opened_at: row.get(10)?,
    })
}

fn map_work_details(row: &Row<'_>) -> rusqlite::Result<WorkDetails> {
    Ok(WorkDetails {
        summary: WorkSummary {
            id: row.get(0)?,
            title: row.get(1)?,
            author: row.get(2)?,
            kind: parse_kind(row.get::<_, String>(3)?.as_str()),
            format: parse_format(row.get::<_, String>(4)?.as_str()),
            cover_path: row.get(5)?,
            status: parse_status(row.get::<_, String>(6)?.as_str()),
            favorite: row.get::<_, i64>(7)? != 0,
            progress_percent: row.get(17)?,
            missing_file: row.get::<_, i64>(8)? != 0,
            added_at: row.get(9)?,
            last_opened_at: row.get(10)?,
        },
        original_title: row.get(11)?,
        description: row.get(12)?,
        source_path: row.get(13)?,
        file_size: row.get::<_, i64>(14)? as u64,
        page_count: row.get(15)?,
        chapter_count: row.get(16)?,
    })
}

fn parse_kind(value: &str) -> WorkKind {
    match value {
        "manga" => WorkKind::Manga,
        _ => WorkKind::Book,
    }
}

fn parse_status(value: &str) -> WorkStatus {
    match value {
        "reading" => WorkStatus::Reading,
        "completed" => WorkStatus::Completed,
        "on_hold" => WorkStatus::OnHold,
        _ => WorkStatus::Planned,
    }
}

fn parse_format(value: &str) -> WorkFormat {
    match value {
        "pdf" => WorkFormat::Pdf,
        "fb2" => WorkFormat::Fb2,
        "txt" => WorkFormat::Txt,
        "html" => WorkFormat::Html,
        "markdown" => WorkFormat::Markdown,
        "cbz" => WorkFormat::Cbz,
        "cbr" => WorkFormat::Cbr,
        "zip_images" => WorkFormat::ZipImages,
        "image_folder" => WorkFormat::ImageFolder,
        "image" => WorkFormat::Image,
        _ => WorkFormat::Epub,
    }
}
