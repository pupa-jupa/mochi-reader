#![allow(linker_messages)]

use serde::Serialize;
use tauri::Manager;

mod app_state;
pub mod cache;
mod commands;
pub mod database;
pub mod domain;
pub mod import;
pub mod manga;
pub mod parsers;
pub mod reader;
pub mod services;
pub mod sources;

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
        .plugin(tauri_plugin_window_state::Builder::default().build())
        .plugin(
            tauri_plugin_log::Builder::new()
                .max_file_size(2_000_000)
                .rotation_strategy(tauri_plugin_log::RotationStrategy::KeepSome(5))
                .timezone_strategy(tauri_plugin_log::TimezoneStrategy::UseLocal)
                .build(),
        )
        .setup(|app| {
            let data_directory = app.path().app_data_dir()?;
            std::fs::create_dir_all(&data_directory)?;
            let database =
                database::connection::open_database(&data_directory.join("mochi-reader.sqlite3"))
                    .map_err(|error| error.to_string())?;
            database::migrations::migrate(&database).map_err(|error| error.to_string())?;
            app.manage(app_state::AppState {
                database: std::sync::Arc::new(std::sync::Mutex::new(database)),
                cache_directory: data_directory.join("cache").join("source-pages"),
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::health_status,
            commands::annotations::list_annotations,
            commands::annotations::create_annotation,
            commands::annotations::update_annotation,
            commands::annotations::delete_annotation,
            commands::annotations::copy_text,
            commands::annotations::export_annotations,
            commands::bookmarks::list_bookmarks,
            commands::bookmarks::create_bookmark,
            commands::bookmarks::delete_bookmark,
            commands::cache::get_cache_stats,
            commands::cache::clear_cache,
            commands::collections::list_collections,
            commands::collections::get_collection,
            commands::collections::create_collection,
            commands::collections::add_to_collection,
            commands::collections::update_collection,
            commands::collections::remove_from_collection,
            commands::collections::delete_collection,
            commands::diagnostics::open_log_directory,
            commands::diagnostics::copy_diagnostic_information,
            commands::history::start_reading_session,
            commands::history::end_reading_session,
            commands::history::list_history,
            commands::history::delete_history_entry,
            commands::history::clear_history,
            commands::import::import_paths,
            commands::library::list_works,
            commands::library::get_work,
            commands::library::add_remote_work_to_library,
            commands::library::find_remote_work,
            commands::library::remove_from_library,
            commands::library::set_favorite,
            commands::library::set_work_status,
            commands::library::reveal_work_source,
            commands::library::update_work_metadata,
            commands::library::relink_work_source,
            commands::manga::get_manga_manifest,
            commands::manga::get_manga_page,
            commands::progress::get_progress,
            commands::progress::save_progress,
            commands::reader::get_pdf_bytes,
            commands::reader::get_reader_document,
            commands::settings::get_settings,
            commands::settings::update_settings,
            commands::sources::list_sources,
            commands::sources::add_builtin_source,
            commands::sources::add_source_from_url,
            commands::sources::import_source_profile,
            commands::sources::set_source_enabled,
            commands::sources::remove_source,
            commands::sources::search_source,
            commands::sources::get_source_chapters,
            commands::sources::get_source_pages,
            commands::sources::get_source_page,
            commands::sources::download_source_chapter
        ])
        .run(tauri::generate_context!())
        .expect("failed to run Mochi Reader");
}
