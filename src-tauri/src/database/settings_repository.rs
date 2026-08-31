use rusqlite::{Connection, OptionalExtension, params};
use serde::{Deserialize, Serialize};

use crate::domain::error::{AppError, AppResult};

const SETTINGS_KEY: &str = "app";
const SETTINGS_VERSION: i64 = 1;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum ThemeName {
    Sakura,
    Milk,
    Night,
}

#[derive(Debug, Clone, PartialEq, Eq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct AppSettings {
    pub theme: ThemeName,
    pub reduce_motion: bool,
    pub show_mascot: bool,
    pub ui_scale: u16,
    pub onboarding_complete: bool,
    #[serde(default = "default_cache_limit_mb")]
    pub cache_limit_mb: Option<u32>,
}

impl Default for AppSettings {
    fn default() -> Self {
        Self {
            theme: ThemeName::Sakura,
            reduce_motion: false,
            show_mascot: true,
            ui_scale: 100,
            onboarding_complete: false,
            cache_limit_mb: default_cache_limit_mb(),
        }
    }
}

pub struct SettingsRepository<'connection> {
    connection: &'connection Connection,
}

impl<'connection> SettingsRepository<'connection> {
    pub fn new(connection: &'connection Connection) -> Self {
        Self { connection }
    }

    pub fn get(&self) -> AppResult<AppSettings> {
        let stored = self
            .connection
            .query_row(
                "SELECT value_json FROM settings WHERE key = ?1",
                [SETTINGS_KEY],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        match stored {
            Some(json) => serde_json::from_str(&json).map_err(|error| AppError::Validation {
                message: format!("Не удалось прочитать сохранённые настройки: {error}"),
            }),
            None => Ok(AppSettings::default()),
        }
    }

    pub fn save(&self, settings: &AppSettings) -> AppResult<()> {
        if !(80..=130).contains(&settings.ui_scale) {
            return Err(AppError::Validation {
                message: "Масштаб интерфейса должен быть от 80% до 130%.".to_string(),
            });
        }
        if settings
            .cache_limit_mb
            .is_some_and(|value| !matches!(value, 500 | 1_024 | 2_048 | 5_120))
        {
            return Err(AppError::Validation {
                message: "Размер кэша должен быть 500 МБ, 1 ГБ, 2 ГБ, 5 ГБ или без ограничения."
                    .to_string(),
            });
        }
        let json = serde_json::to_string(settings).map_err(|error| AppError::Validation {
            message: format!("Не удалось сохранить настройки: {error}"),
        })?;
        self.connection.execute(
            "INSERT INTO settings (key, value_json, schema_version, updated_at)
             VALUES (?1, ?2, ?3, ?4)
             ON CONFLICT(key) DO UPDATE SET
                value_json = excluded.value_json,
                schema_version = excluded.schema_version,
                updated_at = excluded.updated_at",
            params![
                SETTINGS_KEY,
                json,
                SETTINGS_VERSION,
                chrono::Utc::now().to_rfc3339(),
            ],
        )?;
        Ok(())
    }
}

fn default_cache_limit_mb() -> Option<u32> {
    Some(1_024)
}
