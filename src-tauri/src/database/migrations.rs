use rusqlite::Connection;

use crate::domain::error::AppResult;

const INITIAL_SCHEMA: &str = include_str!("../../migrations/0001_initial.sql");
const PERSISTENT_READER_STATE: &str =
    include_str!("../../migrations/0002_persistent_reader_state.sql");
const SOURCES: &str = include_str!("../../migrations/0003_sources.sql");
const SOURCE_CACHE: &str = include_str!("../../migrations/0004_source_cache.sql");
const MANGADEX_SOURCE: &str = include_str!("../../migrations/0005_mangadex_source.sql");
const CONTENT_IDENTITY: &str = include_str!("../../migrations/0006_content_identity.sql");
const REMOTE_LIBRARY: &str = include_str!("../../migrations/0007_remote_library.sql");
const READER_ANNOTATIONS: &str = include_str!("../../migrations/0008_reader_annotations.sql");
const OPDS_SOURCE: &str = include_str!("../../migrations/0009_opds_source.sql");

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
        version = 4;
    }
    if version < 5 {
        connection.execute_batch(MANGADEX_SOURCE)?;
        version = 5;
    }
    if version < 6 {
        connection.execute_batch(CONTENT_IDENTITY)?;
        version = 6;
    }
    if version < 7 {
        connection.execute_batch(REMOTE_LIBRARY)?;
        version = 7;
    }
    if version < 8 {
        connection.execute_batch(READER_ANNOTATIONS)?;
        version = 8;
    }
    if version < 9 {
        connection.execute_batch(OPDS_SOURCE)?;
    }
    connection.execute_batch("PRAGMA foreign_keys = ON;")?;
    Ok(())
}
