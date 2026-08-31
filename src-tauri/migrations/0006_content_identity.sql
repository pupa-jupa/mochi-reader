BEGIN IMMEDIATE;

ALTER TABLE works ADD COLUMN content_identity TEXT;
ALTER TABLE works ADD COLUMN origin_kind TEXT NOT NULL DEFAULT 'local'
    CHECK(origin_kind IN ('local', 'remote'));
ALTER TABLE works ADD COLUMN source_id TEXT REFERENCES sources(id) ON DELETE SET NULL;
ALTER TABLE works ADD COLUMN remote_id TEXT;
ALTER TABLE works ADD COLUMN remote_url TEXT;

UPDATE works
SET content_identity = 'local:' || id
WHERE content_identity IS NULL;

CREATE UNIQUE INDEX works_content_identity_idx ON works(content_identity);
CREATE UNIQUE INDEX works_source_remote_idx ON works(source_id, remote_id)
    WHERE source_id IS NOT NULL AND remote_id IS NOT NULL;

ALTER TABLE reading_progress RENAME TO reading_progress_v5;

CREATE TABLE reading_progress (
    content_identity TEXT PRIMARY KEY NOT NULL,
    work_id TEXT NOT NULL UNIQUE REFERENCES works(id) ON DELETE CASCADE,
    locator_json TEXT NOT NULL,
    percent REAL NOT NULL DEFAULT 0 CHECK(percent >= 0 AND percent <= 1),
    reader_mode TEXT NOT NULL CHECK(reader_mode IN ('book', 'pdf', 'manga')),
    updated_at TEXT NOT NULL
);

INSERT INTO reading_progress (
    content_identity, work_id, locator_json, percent, reader_mode, updated_at
)
SELECT
    w.content_identity,
    p.work_id,
    CASE p.reader_mode
        WHEN 'pdf' THEN json_object(
            'kind', 'pdf',
            'pageIndex', COALESCE(p.page_index, 0)
        )
        WHEN 'manga' THEN json_object(
            'kind', 'manga',
            'chapterId', p.chapter_id,
            'pageIndex', COALESCE(p.page_index, 0)
        )
        ELSE json_object(
            'kind', 'book',
            'chapterId', p.chapter_id,
            'charOffset', p.char_offset
        )
    END,
    p.percent,
    p.reader_mode,
    p.updated_at
FROM reading_progress_v5 p
JOIN works w ON w.id = p.work_id;

DROP TABLE reading_progress_v5;

CREATE TABLE reading_sessions (
    id TEXT PRIMARY KEY NOT NULL,
    content_identity TEXT NOT NULL,
    work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    start_locator_json TEXT NOT NULL,
    end_locator_json TEXT,
    started_at TEXT NOT NULL,
    ended_at TEXT,
    duration_seconds INTEGER CHECK(duration_seconds IS NULL OR duration_seconds >= 0)
);

INSERT INTO reading_sessions (
    id, content_identity, work_id, start_locator_json, end_locator_json,
    started_at, ended_at, duration_seconds
)
SELECT
    h.id,
    w.content_identity,
    h.work_id,
    CASE
        WHEN w.kind = 'manga' THEN json_object(
            'kind', 'manga',
            'chapterId', h.chapter_id,
            'pageIndex', COALESCE(h.page_index, 0)
        )
        WHEN w.format = 'pdf' THEN json_object(
            'kind', 'pdf',
            'pageIndex', COALESCE(h.page_index, 0)
        )
        ELSE json_object(
            'kind', 'book',
            'chapterId', h.chapter_id,
            'charOffset', NULL
        )
    END,
    CASE WHEN h.closed_at IS NULL THEN NULL ELSE
        CASE
            WHEN w.kind = 'manga' THEN json_object(
                'kind', 'manga',
                'chapterId', h.chapter_id,
                'pageIndex', COALESCE(h.page_index, 0)
            )
            WHEN w.format = 'pdf' THEN json_object(
                'kind', 'pdf',
                'pageIndex', COALESCE(h.page_index, 0)
            )
            ELSE json_object(
                'kind', 'book',
                'chapterId', h.chapter_id,
                'charOffset', NULL
            )
        END
    END,
    h.opened_at,
    h.closed_at,
    CASE WHEN h.closed_at IS NULL THEN NULL ELSE
        MAX(0, CAST(ROUND((julianday(h.closed_at) - julianday(h.opened_at)) * 86400) AS INTEGER))
    END
FROM history h
JOIN works w ON w.id = h.work_id;

DROP TABLE history;

CREATE INDEX reading_sessions_started_idx ON reading_sessions(started_at DESC);
CREATE INDEX reading_sessions_work_idx ON reading_sessions(work_id, started_at DESC);
CREATE INDEX reading_sessions_identity_idx
    ON reading_sessions(content_identity, started_at DESC);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (6, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

COMMIT;
