use serde::Deserialize;
use tauri::{AppHandle, State};
use tauri_plugin_opener::OpenerExt;

use crate::{
    app_state::AppState,
    database::work_repository::WorkRepository,
    domain::{
        error::{AppError, AppResult},
        work::{WorkDetails, WorkFormat, WorkPage, WorkStatus},
    },
    import::detect::{DetectedFormat, detect_format},
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

#[tauri::command]
pub fn set_favorite(state: State<'_, AppState>, id: String, favorite: bool) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    })?;
    WorkRepository::new(&connection).set_favorite(&id, favorite)
}

#[tauri::command]
pub fn set_work_status(
    state: State<'_, AppState>,
    id: String,
    status: WorkStatus,
) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    })?;
    WorkRepository::new(&connection).set_status(&id, status)
}

#[tauri::command]
pub fn reveal_work_source(app: AppHandle, state: State<'_, AppState>, id: String) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    })?;
    let work = WorkRepository::new(&connection).get(&id)?;
    let path = std::path::Path::new(&work.source_path);
    if !path.exists() {
        return Err(AppError::Validation {
            message: "Исходный файл не найден. Укажи его новое расположение в карточке."
                .to_string(),
        });
    }
    app.opener()
        .reveal_item_in_dir(path)
        .map_err(|_| AppError::Validation {
            message: "Не удалось открыть расположение файла.".to_string(),
        })
}

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct WorkMetadataUpdate {
    title: String,
    author: Option<String>,
    original_title: Option<String>,
    description: Option<String>,
}

#[tauri::command]
pub fn update_work_metadata(
    state: State<'_, AppState>,
    id: String,
    metadata: WorkMetadataUpdate,
) -> AppResult<WorkDetails> {
    let connection = state.database.lock().map_err(|_| AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    })?;
    let repository = WorkRepository::new(&connection);
    repository.update_metadata(
        &id,
        &metadata.title,
        metadata.author.as_deref(),
        metadata.original_title.as_deref(),
        metadata.description.as_deref(),
    )?;
    repository.get(&id)
}

#[tauri::command]
pub fn relink_work_source(
    state: State<'_, AppState>,
    id: String,
    new_path: String,
) -> AppResult<WorkDetails> {
    let path = std::fs::canonicalize(&new_path).map_err(|_| AppError::Validation {
        message: "Выбранный файл или папка не найдены.".to_string(),
    })?;
    let connection = state.database.lock().map_err(|_| AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    })?;
    let repository = WorkRepository::new(&connection);
    let work = repository.get(&id)?;
    let detected = detect_format(&path)?;
    if !compatible_format(&work.format, detected) {
        return Err(AppError::Validation {
            message: format!(
                "Выбран другой формат. Для этой записи нужен {}.",
                work.format.as_str().to_uppercase()
            ),
        });
    }
    let file_size = path.metadata()?.len();
    repository.relink(&id, &path, file_size)?;
    repository.get(&id)
}

fn compatible_format(expected: &WorkFormat, detected: DetectedFormat) -> bool {
    matches!(
        (expected, detected),
        (WorkFormat::Epub, DetectedFormat::Epub)
            | (WorkFormat::Pdf, DetectedFormat::Pdf)
            | (WorkFormat::Fb2, DetectedFormat::Fb2)
            | (WorkFormat::Txt, DetectedFormat::Txt)
            | (WorkFormat::Html, DetectedFormat::Html)
            | (WorkFormat::Markdown, DetectedFormat::Markdown)
            | (WorkFormat::Cbz, DetectedFormat::Cbz)
            | (WorkFormat::Cbr, DetectedFormat::Cbr)
            | (WorkFormat::ZipImages, DetectedFormat::ZipImages)
            | (WorkFormat::ImageFolder, DetectedFormat::ImageFolder)
            | (WorkFormat::Image, DetectedFormat::Image)
    )
}
