use tauri::State;

use crate::{
    app_state::AppState,
    database::collection_repository::{CollectionDetails, CollectionRepository, CollectionSummary},
    domain::error::{AppError, AppResult},
};

#[tauri::command]
pub fn list_collections(state: State<'_, AppState>) -> AppResult<Vec<CollectionSummary>> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    CollectionRepository::new(&connection).list()
}

#[tauri::command]
pub fn get_collection(state: State<'_, AppState>, id: String) -> AppResult<CollectionDetails> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    CollectionRepository::new(&connection).get(&id)
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

#[tauri::command]
pub fn update_collection(
    state: State<'_, AppState>,
    id: String,
    title: String,
    description: Option<String>,
) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    CollectionRepository::new(&connection).update(&id, &title, description.as_deref())
}

#[tauri::command]
pub fn remove_from_collection(
    state: State<'_, AppState>,
    collection_id: String,
    work_id: String,
) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    CollectionRepository::new(&connection).remove_work(&collection_id, &work_id)
}

#[tauri::command]
pub fn delete_collection(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    CollectionRepository::new(&connection).delete(&id)
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}
