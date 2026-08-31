PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

ALTER TABLE source_cache_entries RENAME TO source_cache_entries_v4;
ALTER TABLE sources RENAME TO sources_v4;

CREATE TABLE sources (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    base_url TEXT NOT NULL,
    adapter_kind TEXT NOT NULL CHECK(adapter_kind IN ('manifest', 'generic_html', 'mangadex')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    config_json TEXT NOT NULL,
    supports_search INTEGER NOT NULL DEFAULT 1 CHECK(supports_search IN (0, 1)),
    supports_download INTEGER NOT NULL DEFAULT 0 CHECK(supports_download IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(base_url, adapter_kind)
);

INSERT INTO sources (
    id, name, base_url, adapter_kind, enabled, config_json,
    supports_search, supports_download, created_at, updated_at
)
SELECT
    id, name, base_url, adapter_kind, enabled, config_json,
    supports_search, supports_download, created_at, updated_at
FROM sources_v4;

CREATE TABLE source_cache_entries (
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

INSERT INTO source_cache_entries (
    cache_key, source_id, page_url, file_name, media_type,
    size_bytes, pinned, created_at, last_accessed_at
)
SELECT
    cache_key, source_id, page_url, file_name, media_type,
    size_bytes, pinned, created_at, last_accessed_at
FROM source_cache_entries_v4;

DROP TABLE source_cache_entries_v4;
DROP TABLE sources_v4;

CREATE INDEX sources_enabled_idx ON sources(enabled, name);
CREATE INDEX source_cache_lru_idx
    ON source_cache_entries(pinned, last_accessed_at);
CREATE INDEX source_cache_source_idx
    ON source_cache_entries(source_id);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

COMMIT;
PRAGMA foreign_keys = ON;
