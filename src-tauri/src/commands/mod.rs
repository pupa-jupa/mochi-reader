pub mod annotations;
pub mod bookmarks;
pub mod cache;
pub mod collections;
pub mod diagnostics;
pub mod history;
pub mod import;
pub mod library;
pub mod manga;
pub mod progress;
pub mod reader;
pub mod settings;
pub mod sources;

use crate::HealthStatus;

#[tauri::command]
pub fn health_status() -> HealthStatus {
    crate::health_status()
}
