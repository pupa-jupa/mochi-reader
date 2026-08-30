use std::sync::{Arc, Mutex};

use rusqlite::Connection;

pub struct AppState {
    pub database: Arc<Mutex<Connection>>,
}
