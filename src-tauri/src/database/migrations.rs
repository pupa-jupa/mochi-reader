use rusqlite::Connection;

use crate::domain::error::AppResult;

const INITIAL_SCHEMA: &str = include_str!("../../migrations/0001_initial.sql");

pub fn migrate(connection: &Connection) -> AppResult<()> {
    connection.execute_batch(INITIAL_SCHEMA)?;
    Ok(())
}
