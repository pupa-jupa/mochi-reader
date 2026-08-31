use rusqlite::Connection;

use crate::domain::error::AppResult;

const INITIAL_SCHEMA: &str = include_str!("../../migrations/0001_initial.sql");
const PERSISTENT_READER_STATE: &str =
    include_str!("../../migrations/0002_persistent_reader_state.sql");
const SOURCES: &str = include_str!("../../migrations/0003_sources.sql");
const SOURCE_CACHE: &str = include_str!("../../migrations/0004_source_cache.sql");

pub fn migrate(connection: &Connection) -> AppResult<()> {
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    connection.execute_batch(INITIAL_SCHEMA)?;
    let mut version = connection.query_row(
        "SELECT COALESCE(MAX(version), 0) FROM schema_migrations",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    if version < 2 {
        connection.execute_batch(PERSISTENT_READER_STATE)?;
        version = 2;
    }
    if version < 3 {
        connection.execute_batch(SOURCES)?;
        version = 3;
    }
    if version < 4 {
        connection.execute_batch(SOURCE_CACHE)?;
    }
    Ok(())
}
