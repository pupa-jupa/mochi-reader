PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;

CREATE TABLE sources_v9 (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    base_url TEXT NOT NULL,
    adapter_kind TEXT NOT NULL CHECK(adapter_kind IN ('manifest', 'generic_html', 'mangadex', 'opds')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    config_json TEXT NOT NULL,
    supports_search INTEGER NOT NULL DEFAULT 1 CHECK(supports_search IN (0, 1)),
    supports_download INTEGER NOT NULL DEFAULT 0 CHECK(supports_download IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(base_url, adapter_kind)
);

INSERT INTO sources_v9 (
    id, name, base_url, adapter_kind, enabled, config_json,
    supports_search, supports_download, created_at, updated_at
)
SELECT
    id, name, base_url, adapter_kind, enabled, config_json,
    supports_search, supports_download, created_at, updated_at
FROM sources;

DROP TABLE sources;
ALTER TABLE sources_v9 RENAME TO sources;

CREATE INDEX sources_enabled_idx ON sources(enabled, name);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (9, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

COMMIT;
PRAGMA foreign_keys = ON;
