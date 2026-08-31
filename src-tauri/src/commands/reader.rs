use std::sync::Arc;

use tauri::State;

use crate::{
    app_state::AppState,
    domain::error::{AppError, AppResult},
    reader::{ReaderDocument, load_pdf_bytes, load_reader_document},
};

#[tauri::command]
pub async fn get_reader_document(
    state: State<'_, AppState>,
    work_id: String,
) -> AppResult<ReaderDocument> {
    let database = Arc::clone(&state.database);
    tauri::async_runtime::spawn_blocking(move || {
        let connection = database.lock().map_err(|_| AppError::Validation {
            message: "Библиотека временно недоступна.".to_string(),
        })?;
        load_reader_document(&connection, &work_id)
    })
    .await
    .map_err(|error| AppError::Validation {
        message: format!("Не удалось открыть книгу: {error}"),
    })?
}

#[tauri::command]
pub async fn get_pdf_bytes(
    state: State<'_, AppState>,
    work_id: String,
) -> AppResult<tauri::ipc::Response> {
    let database = Arc::clone(&state.database);
    let bytes = tauri::async_runtime::spawn_blocking(move || {
        let connection = database.lock().map_err(|_| AppError::Validation {
            message: "Библиотека временно недоступна.".to_string(),
        })?;
        load_pdf_bytes(&connection, &work_id)
    })
    .await
    .map_err(|error| AppError::Validation {
        message: format!("Не удалось открыть PDF: {error}"),
    })??;
    Ok(tauri::ipc::Response::new(bytes))
}
