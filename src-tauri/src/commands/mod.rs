pub mod import;
pub mod library;

use crate::HealthStatus;

#[tauri::command]
pub fn health_status() -> HealthStatus {
    crate::health_status()
}
