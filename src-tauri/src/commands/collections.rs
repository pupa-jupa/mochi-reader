use tauri::State;

use crate::{
    app_state::AppState,
    database::collection_repository::{CollectionRepository, CollectionSummary},
    domain::error::{AppError, AppResult},
};

#[tauri::command]
pub fn list_collections(state: State<'_, AppState>) -> AppResult<Vec<CollectionSummary>> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    CollectionRepository::new(&connection).list()
}

#[tauri::command]
pub fn create_collection(
    state: State<'_, AppState>,
    title: String,
    description: Option<String>,
) -> AppResult<String> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    CollectionRepository::new(&connection).create(&title, description.as_deref())
}

#[tauri::command]
pub fn add_to_collection(
    state: State<'_, AppState>,
    collection_id: String,
    work_id: String,
) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    CollectionRepository::new(&connection).add_work(&collection_id, &work_id)
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}
