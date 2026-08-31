use tauri::State;

use crate::{
    app_state::AppState,
    database::progress_repository::{ProgressRepository, ProgressUpdate, ReadingProgress},
    domain::error::{AppError, AppResult},
};

#[tauri::command]
pub fn get_progress(
    state: State<'_, AppState>,
    work_id: String,
) -> AppResult<Option<ReadingProgress>> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    ProgressRepository::new(&connection).get(&work_id)
}

#[tauri::command]
pub fn save_progress(
    state: State<'_, AppState>,
    update: ProgressUpdate,
) -> AppResult<ReadingProgress> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    ProgressRepository::new(&connection).save(&update)
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}
