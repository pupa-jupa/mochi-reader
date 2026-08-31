use tauri::State;

use crate::{
    app_state::AppState,
    domain::{
        error::{AppError, AppResult},
        reader::{ProgressUpdate, ReadingProgress},
    },
    services::reading_progress::ReadingProgressService,
};

#[tauri::command]
pub fn get_progress(
    state: State<'_, AppState>,
    work_id: String,
) -> AppResult<Option<ReadingProgress>> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    ReadingProgressService::new(&connection).get_for_work(&work_id)
}

#[tauri::command]
pub fn save_progress(
    state: State<'_, AppState>,
    update: ProgressUpdate,
) -> AppResult<ReadingProgress> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    ReadingProgressService::new(&connection).save(&update)
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}
