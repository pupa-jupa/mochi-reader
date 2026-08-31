use std::sync::Arc;

use tauri::State;

use crate::{
    app_state::AppState,
    cache::{CacheManager, CacheStats},
    domain::error::{AppError, AppResult},
};

#[tauri::command]
pub async fn get_cache_stats(state: State<'_, AppState>) -> AppResult<CacheStats> {
    let database = Arc::clone(&state.database);
    let cache_directory = state.cache_directory.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let connection = database.lock().map_err(|_| unavailable())?;
        CacheManager::new(&connection, &cache_directory)?.stats()
    })
    .await
    .map_err(join_error)?
}

#[tauri::command]
pub async fn clear_cache(
    state: State<'_, AppState>,
    include_downloads: bool,
) -> AppResult<CacheStats> {
    let database = Arc::clone(&state.database);
    let cache_directory = state.cache_directory.clone();
    tauri::async_runtime::spawn_blocking(move || {
        let connection = database.lock().map_err(|_| unavailable())?;
        let manager = CacheManager::new(&connection, &cache_directory)?;
        if include_downloads {
            manager.clear_all()?;
        } else {
            manager.clear_transient()?;
        }
        manager.stats()
    })
    .await
    .map_err(join_error)?
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Кэш временно недоступен.".to_string(),
    }
}

fn join_error(error: impl std::fmt::Display) -> AppError {
    AppError::Validation {
        message: format!("Не удалось выполнить операцию с кэшем: {error}"),
    }
}
