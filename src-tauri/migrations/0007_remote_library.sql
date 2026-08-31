BEGIN IMMEDIATE;

ALTER TABLE works ADD COLUMN remote_cover_url TEXT;

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (7, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

COMMIT;
