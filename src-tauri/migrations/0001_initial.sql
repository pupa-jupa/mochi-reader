PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS works (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    original_title TEXT,
    author TEXT,
    description TEXT,
    kind TEXT NOT NULL CHECK(kind IN ('book', 'manga')),
    format TEXT NOT NULL,
    source_path TEXT NOT NULL,
    file_size INTEGER NOT NULL CHECK(file_size >= 0),
    fingerprint TEXT NOT NULL,
    cover_path TEXT,
    page_count INTEGER,
    chapter_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'planned' CHECK(status IN ('reading', 'planned', 'completed', 'on_hold')),
    favorite INTEGER NOT NULL DEFAULT 0 CHECK(favorite IN (0, 1)),
    missing_file INTEGER NOT NULL DEFAULT 0 CHECK(missing_file IN (0, 1)),
    added_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    last_opened_at TEXT
);

CREATE UNIQUE INDEX IF NOT EXISTS works_fingerprint_path_idx
    ON works(fingerprint, source_path);
CREATE INDEX IF NOT EXISTS works_added_at_idx ON works(added_at DESC);
CREATE INDEX IF NOT EXISTS works_kind_idx ON works(kind);
CREATE INDEX IF NOT EXISTS works_status_idx ON works(status);
CREATE INDEX IF NOT EXISTS works_favorite_idx ON works(favorite);

CREATE VIRTUAL TABLE IF NOT EXISTS work_fts USING fts5(
    work_id UNINDEXED,
    title,
    author,
    tokenize = 'unicode61 remove_diacritics 2'
);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (1, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
