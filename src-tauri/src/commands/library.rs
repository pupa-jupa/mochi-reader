use serde::Deserialize;
use tauri::State;

use crate::{
    app_state::AppState,
    database::work_repository::WorkRepository,
    domain::{
        error::{AppError, AppResult},
        work::{WorkDetails, WorkPage},
    },
};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ListWorksRequest {
    #[serde(default)]
    pub query: String,
    #[serde(default)]
    pub offset: u32,
    #[serde(default = "default_page_size")]
    pub limit: u32,
}

fn default_page_size() -> u32 {
    40
}

#[tauri::command]
pub fn list_works(state: State<'_, AppState>, request: ListWorksRequest) -> AppResult<WorkPage> {
    let connection = state.database.lock().map_err(|_| AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    })?;
    WorkRepository::new(&connection).list(&request.query, request.offset, request.limit)
}

#[tauri::command]
pub fn get_work(state: State<'_, AppState>, id: String) -> AppResult<WorkDetails> {
    let connection = state.database.lock().map_err(|_| AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    })?;
    WorkRepository::new(&connection).get(&id)
}

#[tauri::command]
pub fn remove_from_library(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    })?;
    WorkRepository::new(&connection).remove(&id)
}
