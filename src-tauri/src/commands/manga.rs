use std::{path::Path, sync::Arc};

use tauri::State;

use crate::{
    app_state::AppState,
    database::work_repository::WorkRepository,
    domain::{
        error::{AppError, AppResult},
        work::WorkFormat,
    },
    manga::manifest::{MangaManifest, MangaPageData, load_manga_manifest, load_manga_page},
};

#[tauri::command]
pub async fn get_manga_manifest(
    state: State<'_, AppState>,
    work_id: String,
) -> AppResult<MangaManifest> {
    let database = Arc::clone(&state.database);
    tauri::async_runtime::spawn_blocking(move || {
        let connection = database.lock().map_err(|_| unavailable())?;
        let repository = WorkRepository::new(&connection);
        let work = repository.get(&work_id)?;
        if work.format == WorkFormat::Cbr {
            return Err(AppError::Validation {
                message: "Для CBR требуется установленный UnRAR. CBZ, ZIP и папки изображений открываются встроенно.".to_string(),
            });
        }
        let manifest = load_manga_manifest(&work_id, &work.title, Path::new(&work.source_path))?;
        repository.mark_opened(&work_id)?;
        Ok(manifest)
    })
    .await
    .map_err(join_error)?
}

#[tauri::command]
pub async fn get_manga_page(
    state: State<'_, AppState>,
    work_id: String,
    index: usize,
) -> AppResult<MangaPageData> {
    let database = Arc::clone(&state.database);
    tauri::async_runtime::spawn_blocking(move || {
        let connection = database.lock().map_err(|_| unavailable())?;
        let work = WorkRepository::new(&connection).get(&work_id)?;
        let source_path = Path::new(&work.source_path);
        let manifest = load_manga_manifest(&work_id, &work.title, source_path)?;
        let page = manifest.pages.get(index).ok_or(AppError::Validation {
            message: "Страница вне диапазона главы.".to_string(),
        })?;
        load_manga_page(source_path, page)
    })
    .await
    .map_err(join_error)?
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}

fn join_error(error: impl std::fmt::Display) -> AppError {
    AppError::Validation {
        message: format!("Не удалось открыть мангу: {error}"),
    }
}
