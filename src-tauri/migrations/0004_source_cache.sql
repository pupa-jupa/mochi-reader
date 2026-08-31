CREATE TABLE IF NOT EXISTS source_cache_entries (
    cache_key TEXT PRIMARY KEY NOT NULL,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    page_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
    pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
    created_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL,
    UNIQUE(source_id, page_url)
);

CREATE INDEX IF NOT EXISTS source_cache_lru_idx
    ON source_cache_entries(pinned, last_accessed_at);
CREATE INDEX IF NOT EXISTS source_cache_source_idx
    ON source_cache_entries(source_id);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (4, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
