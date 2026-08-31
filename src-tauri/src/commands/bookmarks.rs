use tauri::State;

use crate::{
    app_state::AppState,
    database::bookmark_repository::{Bookmark, BookmarkDraft, BookmarkRepository},
    domain::error::{AppError, AppResult},
};

#[tauri::command]
pub fn list_bookmarks(state: State<'_, AppState>) -> AppResult<Vec<Bookmark>> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    BookmarkRepository::new(&connection).list()
}

#[tauri::command]
pub fn create_bookmark(state: State<'_, AppState>, draft: BookmarkDraft) -> AppResult<String> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    BookmarkRepository::new(&connection).create(&draft)
}

#[tauri::command]
pub fn delete_bookmark(state: State<'_, AppState>, id: String) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    BookmarkRepository::new(&connection).delete(&id)
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}
