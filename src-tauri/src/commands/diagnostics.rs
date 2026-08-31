use rusqlite::Connection;
use tauri::{AppHandle, Manager};
use tauri_plugin_clipboard_manager::ClipboardExt;
use tauri_plugin_opener::OpenerExt;

use crate::{
    app_state::AppState,
    domain::error::{AppError, AppResult},
};

#[tauri::command]
pub fn open_log_directory(app: AppHandle) -> AppResult<()> {
    let directory = app.path().app_log_dir().map_err(validation)?;
    std::fs::create_dir_all(&directory)?;
    app.opener()
        .open_path(directory.to_string_lossy(), None::<&str>)
        .map_err(validation)
}

#[tauri::command]
pub fn copy_diagnostic_information(
    app: AppHandle,
    state: tauri::State<'_, AppState>,
) -> AppResult<()> {
    let information = {
        let connection = state.database.lock().map_err(|_| AppError::Validation {
            message: "Библиотека временно недоступна.".to_string(),
        })?;
        build_diagnostic_information(&connection)?
    };
    app.clipboard().write_text(information).map_err(validation)
}

fn build_diagnostic_information(connection: &Connection) -> AppResult<String> {
    let schema_version: i64 = connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get(0),
    )?;
    let work_count: i64 =
        connection.query_row("SELECT COUNT(*) FROM works", [], |row| row.get(0))?;
    let source_count: i64 =
        connection.query_row("SELECT COUNT(*) FROM sources", [], |row| row.get(0))?;
    let (cache_entries, cache_bytes): (i64, i64) = connection.query_row(
        "SELECT COUNT(*), COALESCE(SUM(size_bytes), 0) FROM source_cache_entries",
        [],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;

    Ok(format!(
        "Mochi Reader diagnostics\n\
         Version: {}\n\
         Platform: {} ({})\n\
         Database schema: {}\n\
         Library works: {}\n\
         Manga sources: {}\n\
         Cache entries: {}\n\
         Cache bytes: {}\n\
         Generated at: {}",
        env!("CARGO_PKG_VERSION"),
        std::env::consts::OS,
        std::env::consts::ARCH,
        schema_version,
        work_count,
        source_count,
        cache_entries,
        cache_bytes,
        chrono::Utc::now().to_rfc3339(),
    ))
}

fn validation(error: impl std::fmt::Display) -> AppError {
    AppError::Validation {
        message: format!("Не удалось выполнить диагностическое действие: {error}"),
    }
}

#[cfg(test)]
mod tests {
    use rusqlite::Connection;

    use crate::database::migrations::migrate;

    use super::build_diagnostic_information;

    #[test]
    fn diagnostics_are_bounded_and_do_not_include_library_paths() {
        let connection = Connection::open_in_memory().unwrap();
        migrate(&connection).unwrap();
        let diagnostics = build_diagnostic_information(&connection).unwrap();

        assert!(diagnostics.contains("Mochi Reader diagnostics"));
        assert!(diagnostics.contains("Database schema: 8"));
        assert!(diagnostics.contains("Library works: 0"));
        assert!(!diagnostics.contains("source_path"));
    }
}
