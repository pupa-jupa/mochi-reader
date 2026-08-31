use tauri::State;

use crate::{
    app_state::AppState,
    database::reading_session_repository::{ReadingSession, ReadingSessionRepository},
    domain::{
        error::{AppError, AppResult},
        reader::ReaderLocator,
    },
};

#[tauri::command]
pub fn start_reading_session(
    state: State<'_, AppState>,
    work_id: String,
    locator: ReaderLocator,
) -> AppResult<String> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    ReadingSessionRepository::new(&connection).start(&work_id, &locator)
}

#[tauri::command]
pub fn end_reading_session(
    state: State<'_, AppState>,
    id: String,
    locator: ReaderLocator,
) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    ReadingSessionRepository::new(&connection).finish(&id, &locator)
}

#[tauri::command]
pub fn list_history(
    state: State<'_, AppState>,
    limit: Option<u32>,
) -> AppResult<Vec<ReadingSession>> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    ReadingSessionRepository::new(&connection).list(limit.unwrap_or(100))
}

#[tauri::command]
pub fn delete_history_entry(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    ReadingSessionRepository::new(&connection).delete(&id)
}

#[tauri::command]
pub fn clear_history(state: State<'_, AppState>) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    ReadingSessionRepository::new(&connection).clear()
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}
