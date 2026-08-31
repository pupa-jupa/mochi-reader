CREATE TABLE IF NOT EXISTS reading_progress (
    work_id TEXT PRIMARY KEY NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    chapter_id TEXT,
    page_index INTEGER CHECK(page_index IS NULL OR page_index >= 0),
    char_offset INTEGER CHECK(char_offset IS NULL OR char_offset >= 0),
    percent REAL NOT NULL DEFAULT 0 CHECK(percent >= 0 AND percent <= 1),
    reader_mode TEXT NOT NULL CHECK(reader_mode IN ('book', 'pdf', 'manga')),
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS bookmarks (
    id TEXT PRIMARY KEY NOT NULL,
    work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    chapter_id TEXT,
    page_index INTEGER CHECK(page_index IS NULL OR page_index >= 0),
    char_offset INTEGER CHECK(char_offset IS NULL OR char_offset >= 0),
    percent REAL NOT NULL DEFAULT 0 CHECK(percent >= 0 AND percent <= 1),
    excerpt TEXT,
    note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS bookmarks_work_idx ON bookmarks(work_id, created_at DESC);
CREATE INDEX IF NOT EXISTS bookmarks_created_idx ON bookmarks(created_at DESC);

CREATE TABLE IF NOT EXISTS history (
    id TEXT PRIMARY KEY NOT NULL,
    work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    chapter_id TEXT,
    page_index INTEGER CHECK(page_index IS NULL OR page_index >= 0),
    opened_at TEXT NOT NULL,
    closed_at TEXT
);
CREATE INDEX IF NOT EXISTS history_opened_idx ON history(opened_at DESC);
CREATE INDEX IF NOT EXISTS history_work_idx ON history(work_id, opened_at DESC);

CREATE TABLE IF NOT EXISTS collections (
    id TEXT PRIMARY KEY NOT NULL,
    title TEXT NOT NULL CHECK(length(trim(title)) > 0),
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS collection_items (
    collection_id TEXT NOT NULL REFERENCES collections(id) ON DELETE CASCADE,
    work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    added_at TEXT NOT NULL,
    PRIMARY KEY (collection_id, work_id)
);
CREATE INDEX IF NOT EXISTS collection_items_work_idx ON collection_items(work_id);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY NOT NULL,
    value_json TEXT NOT NULL,
    schema_version INTEGER NOT NULL CHECK(schema_version > 0),
    updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (2, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
