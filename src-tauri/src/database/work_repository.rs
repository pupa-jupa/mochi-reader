use std::path::Path;

use rusqlite::{Connection, OptionalExtension, Row, params, params_from_iter, types::Value};
use url::Url;
use uuid::Uuid;

use crate::domain::{
    error::{AppError, AppResult},
    work::{
        NewWork, RemoteWorkDraft, WorkDetails, WorkFormat, WorkKind, WorkListQuery, WorkOrigin,
        WorkPage, WorkSort, WorkStatus, WorkSummary,
    },
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
        let content_identity = format!("local:{id}");
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
                cover_path, page_count, chapter_count, added_at, updated_at, content_identity
            ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?12, ?13)",
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
                content_identity,
            ],
        )?;
        transaction.execute(
            "INSERT INTO work_fts(work_id, title, author) VALUES (?1, ?2, ?3)",
            params![id, work.title.trim(), work.author.as_deref()],
        )?;
        transaction.commit()?;
        Ok(id)
    }

    pub fn upsert_remote(&self, draft: &RemoteWorkDraft) -> AppResult<String> {
        let source_id = validated_identifier(&draft.source_id, "Источник")?;
        let remote_id = validated_identifier(&draft.remote_id, "Идентификатор произведения")?;
        let title = draft.title.trim();
        if title.is_empty() || title.chars().count() > 300 {
            return Err(AppError::Validation {
                message: "Название должно содержать от 1 до 300 символов.".to_string(),
            });
        }
        let description = normalize_optional(draft.description.as_deref(), 20_000, "Описание")?;
        let remote_url = validated_https_url(&draft.remote_url, "Ссылка на произведение")?;
        let cover_url = draft
            .cover_url
            .as_deref()
            .map(|value| validated_https_url(value, "Ссылка на обложку"))
            .transpose()?;
        let source_exists = self.connection.query_row(
            "SELECT EXISTS(SELECT 1 FROM sources WHERE id = ?1)",
            [source_id],
            |row| row.get::<_, i64>(0),
        )? != 0;
        if !source_exists {
            return Err(AppError::NotFound { entity: "source" });
        }
        let content_identity = format!("remote:{source_id}:{remote_id}");
        let existing_id = self
            .connection
            .query_row(
                "SELECT id FROM works WHERE content_identity = ?1",
                [&content_identity],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        let id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());
        let now = chrono::Utc::now().to_rfc3339();
        let transaction = self.connection.unchecked_transaction()?;
        transaction.execute(
            "INSERT INTO works (
                id, title, description, kind, format, source_path, file_size, fingerprint,
                chapter_count, added_at, updated_at, content_identity, origin_kind,
                source_id, remote_id, remote_url, remote_cover_url
             ) VALUES (
                ?1, ?2, ?3, 'manga', 'remote_manga', ?4, 0, ?5,
                ?6, ?7, ?7, ?5, 'remote', ?8, ?9, ?4, ?10
             )
             ON CONFLICT(content_identity) DO UPDATE SET
                title = excluded.title,
                description = COALESCE(excluded.description, works.description),
                format = excluded.format,
                source_path = excluded.source_path,
                chapter_count = MAX(works.chapter_count, excluded.chapter_count),
                updated_at = excluded.updated_at,
                origin_kind = excluded.origin_kind,
                source_id = excluded.source_id,
                remote_id = excluded.remote_id,
                remote_url = excluded.remote_url,
                remote_cover_url = COALESCE(excluded.remote_cover_url, works.remote_cover_url),
                missing_file = 0",
            params![
                id,
                title,
                description,
                remote_url,
                content_identity,
                i64::from(draft.chapter_count),
                now,
                source_id,
                remote_id,
                cover_url,
            ],
        )?;
        transaction.execute("DELETE FROM work_fts WHERE work_id = ?1", [&id])?;
        transaction.execute(
            "INSERT INTO work_fts(work_id, title, author) VALUES (?1, ?2, NULL)",
            params![id, title],
        )?;
        transaction.commit()?;
        Ok(id)
    }

    pub fn find_remote_id(&self, source_id: &str, remote_id: &str) -> AppResult<Option<String>> {
        self.connection
            .query_row(
                "SELECT id FROM works
                 WHERE origin_kind = 'remote' AND source_id = ?1 AND remote_id = ?2",
                params![source_id, remote_id],
                |row| row.get(0),
            )
            .optional()
            .map_err(Into::into)
    }

    pub fn get(&self, id: &str) -> AppResult<WorkDetails> {
        let mut work = self
            .connection
            .query_row(
                "SELECT
                    id, title, author, kind, format, cover_path, status, favorite,
                    missing_file, added_at, last_opened_at, original_title, description,
                    source_path, file_size, page_count, chapter_count,
                    COALESCE(reading_progress.percent * 100.0, 0.0),
                    origin_kind, source_id, remote_id, remote_url, remote_cover_url
                 FROM works
                 LEFT JOIN reading_progress ON reading_progress.work_id = works.id
                 WHERE id = ?1",
                [id],
                map_work_details,
            )
            .optional()?
            .ok_or(AppError::NotFound { entity: "work" })?;
        work.summary.missing_file =
            work.origin_kind == WorkOrigin::Local && !Path::new(&work.source_path).exists();
        Ok(work)
    }

    pub fn list(&self, query: &str, offset: u32, limit: u32) -> AppResult<WorkPage> {
        self.list_filtered(&WorkListQuery {
            search: query.to_string(),
            offset,
            limit,
            ..WorkListQuery::default()
        })
    }

    pub fn list_filtered(&self, query: &WorkListQuery) -> AppResult<WorkPage> {
        let limit = query.limit.clamp(1, 200);
        let (joins, where_clause, filter_params) = list_filter(query);
        let order = match query.sort {
            WorkSort::AddedDesc => "w.added_at DESC, w.id ASC",
            WorkSort::TitleAsc => "w.title COLLATE NOCASE ASC, w.id ASC",
            WorkSort::LastOpenedDesc => {
                "(w.last_opened_at IS NULL) ASC, w.last_opened_at DESC, w.id ASC"
            }
            WorkSort::ProgressDesc => {
                "COALESCE(p.percent, 0.0) DESC, w.title COLLATE NOCASE ASC, w.id ASC"
            }
        };
        let sql = format!(
            "SELECT
                w.id, w.title, w.author, w.kind, w.format, w.cover_path, w.status,
                w.favorite, w.missing_file, w.added_at, w.last_opened_at,
                COALESCE(p.percent * 100.0, 0.0)
             FROM works w
             {joins}
             LEFT JOIN reading_progress p ON p.work_id = w.id
             {where_clause}
             ORDER BY {order} LIMIT ? OFFSET ?"
        );
        let mut page_params = filter_params.clone();
        page_params.push(Value::Integer(i64::from(limit)));
        page_params.push(Value::Integer(i64::from(query.offset)));
        let mut items = Vec::new();
        let mut statement = self.connection.prepare(&sql)?;
        let rows = statement.query_map(params_from_iter(page_params.iter()), map_work_summary)?;
        for row in rows {
            items.push(row?);
        }

        let count_sql = format!("SELECT COUNT(*) FROM works w {joins} {where_clause}");
        let total: i64 = self.connection.query_row(
            &count_sql,
            params_from_iter(filter_params.iter()),
            |row| row.get(0),
        )?;

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

fn list_filter(query: &WorkListQuery) -> (String, String, Vec<Value>) {
    let mut joins = String::new();
    let mut clauses = Vec::new();
    let mut values = Vec::new();
    let search = query.search.trim();

    if !search.is_empty() {
        joins.push_str("JOIN work_fts ON work_fts.work_id = w.id");
        clauses.push("work_fts MATCH ?".to_string());
        values.push(Value::Text(to_fts_prefix_query(search)));
    }
    if !query.kinds.is_empty() {
        clauses.push(format!("w.kind IN ({})", placeholders(query.kinds.len())));
        values.extend(
            query
                .kinds
                .iter()
                .map(|kind| Value::Text(kind.as_str().to_string())),
        );
    }
    if !query.statuses.is_empty() {
        clauses.push(format!(
            "w.status IN ({})",
            placeholders(query.statuses.len())
        ));
        values.extend(
            query
                .statuses
                .iter()
                .map(|status| Value::Text(status.as_str().to_string())),
        );
    }
    if let Some(favorite) = query.favorite {
        clauses.push("w.favorite = ?".to_string());
        values.push(Value::Integer(i64::from(favorite)));
    }

    let where_clause = if clauses.is_empty() {
        String::new()
    } else {
        format!("WHERE {}", clauses.join(" AND "))
    };
    (joins, where_clause, values)
}

fn placeholders(count: usize) -> String {
    std::iter::repeat_n("?", count)
        .collect::<Vec<_>>()
        .join(", ")
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

pub(crate) fn map_work_summary(row: &Row<'_>) -> rusqlite::Result<WorkSummary> {
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
        origin_kind: parse_origin(row.get::<_, String>(18)?.as_str()),
        source_id: row.get(19)?,
        remote_id: row.get(20)?,
        remote_url: row.get(21)?,
        remote_cover_url: row.get(22)?,
    })
}

fn parse_origin(value: &str) -> WorkOrigin {
    match value {
        "remote" => WorkOrigin::Remote,
        _ => WorkOrigin::Local,
    }
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
        "remote_manga" => WorkFormat::RemoteManga,
        _ => WorkFormat::Epub,
    }
}

fn validated_identifier<'value>(value: &'value str, field: &str) -> AppResult<&'value str> {
    let value = value.trim();
    if value.is_empty() || value.chars().count() > 1_024 {
        return Err(AppError::Validation {
            message: format!("{field} имеет неверный формат."),
        });
    }
    Ok(value)
}

fn validated_https_url<'value>(value: &'value str, field: &str) -> AppResult<&'value str> {
    let value = value.trim();
    let url = Url::parse(value).map_err(|_| AppError::Validation {
        message: format!("{field} имеет неверный формат."),
    })?;
    if value.chars().count() > 4_096
        || url.scheme() != "https"
        || !url.username().is_empty()
        || url.password().is_some()
        || url.host_str().is_none()
    {
        return Err(AppError::Validation {
            message: format!("{field} имеет неверный формат."),
        });
    }
    Ok(value)
}
