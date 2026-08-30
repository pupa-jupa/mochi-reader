#![allow(linker_messages)]

use serde::Serialize;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize)]
pub struct HealthStatus {
    status: &'static str,
    database: &'static str,
}

pub fn health_status() -> HealthStatus {
    HealthStatus {
        status: "ok",
        database: "ready",
    }
}

mod commands {
    use super::HealthStatus;

    #[tauri::command]
    pub fn health_status() -> HealthStatus {
        super::health_status()
    }
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .invoke_handler(tauri::generate_handler![commands::health_status])
        .run(tauri::generate_context!())
        .expect("failed to run Mochi Reader");
}
