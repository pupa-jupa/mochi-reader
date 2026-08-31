use tauri::State;

use crate::{
    app_state::AppState,
    database::settings_repository::{AppSettings, SettingsRepository},
    domain::error::{AppError, AppResult},
};

#[tauri::command]
pub fn get_settings(state: State<'_, AppState>) -> AppResult<AppSettings> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    SettingsRepository::new(&connection).get()
}

#[tauri::command]
pub fn update_settings(state: State<'_, AppState>, settings: AppSettings) -> AppResult<()> {
    let connection = state.database.lock().map_err(|_| unavailable())?;
    SettingsRepository::new(&connection).save(&settings)
}

fn unavailable() -> AppError {
    AppError::Validation {
        message: "Библиотека временно недоступна.".to_string(),
    }
}
