use std::{
    path::PathBuf,
    sync::{Arc, Mutex},
};

use rusqlite::Connection;

pub struct AppState {
    pub database: Arc<Mutex<Connection>>,
    pub cache_directory: PathBuf,
}
