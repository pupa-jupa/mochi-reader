#![allow(linker_messages)]

use serde::Serialize;
use tauri::Manager;

mod app_state;
mod commands;
pub mod database;
pub mod domain;
pub mod import;
pub mod manga;

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

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_clipboard_manager::init())
        .plugin(tauri_plugin_log::Builder::new().build())
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_directory)?;
            let database =
                database::connection::open_database(&data_directory.join("mochi-reader.sqlite3"))
                    .map_err(|error| error.to_string())?;
            database::migrations::migrate(&database).map_err(|error| error.to_string())?;
            app.manage(app_state::AppState {
                database: std::sync::Arc::new(std::sync::Mutex::new(database)),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health_status,
            commands::import::import_paths,
            commands::library::list_works,
            commands::library::get_work,
            commands::library::remove_from_library
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Mochi Reader");
}
