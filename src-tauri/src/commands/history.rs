use tauri::State;

use crate::{
    app_state::AppState,
    database::history_repository::{HistoryEntry, HistoryRepository},
    domain::error::{AppError, AppResult},
};

#[tauri::command]
pub fn start_reading_session(
    state: State<'_, AppState>,
    work_id: String,
    chapter_id: Option<String>,
    page_index: Option<u32>,
) -> AppResult<String> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    HistoryRepository::new(&connection).start(&work_id, chapter_id.as_deref(), page_index)
}

#[tauri::command]
pub fn end_reading_session(
    state: State<'_, AppState>,
    id: String,
    chapter_id: Option<String>,
    page_index: Option<u32>,
) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    HistoryRepository::new(&connection).finish(&id, chapter_id.as_deref(), page_index)
}

#[tauri::command]
pub fn list_history(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> AppResult<Vec<HistoryEntry>> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    HistoryRepository::new(&connection).list(limit.unwrap_or(100))
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    HistoryRepository::new(&connection).clear()
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}
