use std::sync::Arc;

use base64::{Engine, engine::general_purpose::STANDARD};
use serde::Serialize;
use tauri::State;

use crate::{
    app_state::AppState,
    cache::{CacheManager, CachedImage},
    database::{settings_repository::SettingsRepository, source_repository::SourceRepository},
    domain::error::{AppError, AppResult},
    manga::manifest::MangaPageData,
    sources::{
        html_profile::validate_html_profile,
        mangadex::builtin_source_for,
        model::{RemoteChapter, RemotePage, RemoteSearchPage, SourceConfig},
        probe::probe_manifest,
        service::{
            ensure_download_allowed, load_chapters, load_page_image, load_pages,
            search_source as run_search,
        },
    },
};

#[tauri::command]
pub fn list_sources(state: State<'_, AppState>) -> AppResult<Vec<SourceConfig>> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    SourceRepository::new(&connection).list()
}

#[tauri::command]
pub fn add_builtin_source(state: State<'_, AppState>, kind: String) -> AppResult<SourceConfig> {
    let source = builtin_source_for(&kind)?;
    let connection = state.database.lock().map_err(|_| unavailable())?;
    let repository = SourceRepository::new(&connection);
    let id = repository.upsert(&source)?;
    repository.get(&id)
}

#[tauri::command]
pub async fn add_source_from_url(
    state: State<'_, AppState>,
    url: String,
) -> AppResult<SourceConfig> {
    let database = Arc::clone(&state.database);
    let source = probe_manifest(&url).await?;
    tauri::async_runtime::spawn_blocking(move || {
        let connection = database.lock().map_err(|_| unavailable())?;
        let repository = SourceRepository::new(&connection);
        let id = repository.upsert(&source)?;
        repository.get(&id)
    })
    .await
    .map_err(|error| AppError::Validation {
        message: format!("Не удалось сохранить источник: {error}"),
    })?
}

#[tauri::command]
pub fn import_source_profile(
    state: State<'_, AppState>,
    profile_json: String,
) -> AppResult<SourceConfig> {
    let source = validate_html_profile(&profile_json)?;
    let connection = state.database.lock().map_err(|_| unavailable())?;
    let repository = SourceRepository::new(&connection);
    let id = repository.upsert(&source)?;
    repository.get(&id)
}

#[tauri::command]
pub fn set_source_enabled(state: State<'_, AppState>, id: String, enabled: bool) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    SourceRepository::new(&connection).set_enabled(&id, enabled)
}

#[tauri::command]
pub fn remove_source(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    CacheManager::new(&connection, &state.cache_directory)?.clear_source(&id)?;
    SourceRepository::new(&connection).remove(&id)
}

#[tauri::command]
pub async fn search_source(
    state: State<'_, AppState>,
    source_id: String,
    query: String,
    page: u32,
) -> AppResult<RemoteSearchPage> {
    let stored = {
        let connection = state.database.lock().map_err(|_| unavailable())?;
        SourceRepository::new(&connection).get_stored(&source_id)?
    };
    run_search(stored, &query, page).await
}

#[tauri::command]
pub async fn get_source_chapters(
    state: State<'_, AppState>,
    source_id: String,
    remote_id: String,
    manga_url: String,
) -> AppResult<Vec<RemoteChapter>> {
    let stored = {
        let connection = state.database.lock().map_err(|_| unavailable())?;
        SourceRepository::new(&connection).get_stored(&source_id)?
    };
    load_chapters(stored, &remote_id, &manga_url).await
}

#[tauri::command]
pub async fn get_source_pages(
    state: State<'_, AppState>,
    source_id: String,
    chapter_id: String,
    chapter_url: String,
) -> AppResult<Vec<RemotePage>> {
    let stored = {
        let connection = state.database.lock().map_err(|_| unavailable())?;
        SourceRepository::new(&connection).get_stored(&source_id)?
    };
    load_pages(stored, &chapter_id, &chapter_url).await
}

#[tauri::command]
pub async fn get_source_page(
    state: State<'_, AppState>,
    source_id: String,
    page_url: String,
    index: usize,
) -> AppResult<MangaPageData> {
    let database = Arc::clone(&state.database);
    let cache_directory = state.cache_directory.clone();
    let cached_source_id = source_id.clone();
    let cached_page_url = page_url.clone();
    if let Ok(Ok(Some(cached))) = tauri::async_runtime::spawn_blocking(move || {
        let connection = database.lock().map_err(|_| unavailable())?;
        CacheManager::new(&connection, &cache_directory)?.get(&cached_source_id, &cached_page_url)
    })
    .await
    {
        return Ok(page_data(index, cached));
    }

    let stored = {
        let connection = state.database.lock().map_err(|_| unavailable())?;
        SourceRepository::new(&connection).get_stored(&source_id)?
    };
    let image = load_page_image(stored, &page_url, index).await?;
    let database = Arc::clone(&state.database);
    let cache_directory = state.cache_directory.clone();
    let image_for_cache = image.clone();
    let source_for_cache = source_id.clone();
    let url_for_cache = page_url.clone();
    let _ = tauri::async_runtime::spawn_blocking(move || -> AppResult<()> {
        let connection = database.lock().map_err(|_| unavailable())?;
        let settings = SettingsRepository::new(&connection).get()?;
        let limit = settings
            .cache_limit_mb
            .map(|megabytes| u64::from(megabytes) * 1024 * 1024);
        CacheManager::new(&connection, &cache_directory)?.store(
            &source_for_cache,
            &url_for_cache,
            &image_for_cache.bytes,
            &image_for_cache.media_type,
            false,
            limit,
        )
    })
    .await;
    Ok(page_data(index, image))
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DownloadResult {
    total_pages: usize,
    cached_pages: usize,
}

#[tauri::command]
pub async fn download_source_chapter(
    state: State<'_, AppState>,
    source_id: String,
    chapter_id: String,
    chapter_url: String,
) -> AppResult<DownloadResult> {
    let stored = {
        let connection = state.database.lock().map_err(|_| unavailable())?;
        SourceRepository::new(&connection).get_stored(&source_id)?
    };
    ensure_download_allowed(&stored)?;
    let pages = load_pages(stored.clone(), &chapter_id, &chapter_url).await?;
    if pages.is_empty() {
        return Err(AppError::Validation {
            message: "Источник не вернул страниц для этой главы.".to_string(),
        });
    }

    let limit = {
        let connection = state.database.lock().map_err(|_| unavailable())?;
        SettingsRepository::new(&connection)
            .get()?
            .cache_limit_mb
            .map(|megabytes| u64::from(megabytes) * 1024 * 1024)
    };
    let mut cached_pages = 0;
    for (index, page) in pages.iter().enumerate() {
        let database = Arc::clone(&state.database);
        let cache_directory = state.cache_directory.clone();
        let source_for_cache = source_id.clone();
        let url_for_cache = page.url.clone();
        let already_cached = tauri::async_runtime::spawn_blocking(move || {
            let connection = database.lock().map_err(|_| unavailable())?;
            CacheManager::new(&connection, &cache_directory)?.pin(&source_for_cache, &url_for_cache)
        })
        .await
        .map_err(join_error)??;
        if already_cached {
            cached_pages += 1;
            continue;
        }

        let image = load_page_image(stored.clone(), &page.url, index).await?;
        let database = Arc::clone(&state.database);
        let cache_directory = state.cache_directory.clone();
        let source_for_cache = source_id.clone();
        let url_for_cache = page.url.clone();
        tauri::async_runtime::spawn_blocking(move || {
            let connection = database.lock().map_err(|_| unavailable())?;
            CacheManager::new(&connection, &cache_directory)?.store(
                &source_for_cache,
                &url_for_cache,
                &image.bytes,
                &image.media_type,
                true,
                limit,
            )
        })
        .await
        .map_err(join_error)??;
        cached_pages += 1;
    }
    Ok(DownloadResult {
        total_pages: pages.len(),
        cached_pages,
    })
}

fn page_data(index: usize, image: CachedImage) -> MangaPageData {
    MangaPageData {
        index,
        data_url: format!(
            "data:{};base64,{}",
            image.media_type,
            STANDARD.encode(image.bytes)
        ),
    }
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}

fn join_error(error: impl std::fmt::Display) -> AppError {
    AppError::Validation {
        message: format!("Не удалось сохранить страницу: {error}"),
    }
}
