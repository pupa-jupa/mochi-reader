BEGIN IMMEDIATE;

CREATE TABLE reader_annotations (
    id TEXT PRIMARY KEY NOT NULL,
    content_identity TEXT NOT NULL,
    work_id TEXT NOT NULL REFERENCES works(id) ON DELETE CASCADE,
    annotation_type TEXT NOT NULL
        CHECK(annotation_type IN ('highlight', 'note', 'quote')),
    quote TEXT NOT NULL DEFAULT '',
    note TEXT,
    locator_json TEXT NOT NULL,
    color TEXT CHECK(color IS NULL OR color IN ('sakura', 'peach', 'lavender', 'butter', 'mint')),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE INDEX reader_annotations_created_idx
    ON reader_annotations(created_at DESC);
CREATE INDEX reader_annotations_work_idx
    ON reader_annotations(work_id, created_at DESC);
CREATE INDEX reader_annotations_identity_idx
    ON reader_annotations(content_identity, created_at DESC);
CREATE INDEX reader_annotations_type_idx
    ON reader_annotations(annotation_type, created_at DESC);

INSERT OR IGNORE INTO reader_annotations (
    id, content_identity, work_id, annotation_type, quote, note,
    locator_json, color, created_at, updated_at
)
SELECT
    b.id,
    COALESCE(w.content_identity, 'local:' || w.id),
    b.work_id,
    CASE
        WHEN b.note IS NOT NULL AND length(trim(b.note)) > 0 THEN 'note'
        ELSE 'quote'
    END,
    COALESCE(trim(b.excerpt), ''),
    NULLIF(trim(b.note), ''),
    CASE
        WHEN w.kind = 'manga' THEN json_object(
            'kind', 'manga',
            'chapterId', b.chapter_id,
            'pageIndex', COALESCE(b.page_index, 0)
        )
        WHEN w.format = 'pdf' THEN json_object(
            'kind', 'pdf',
            'pageIndex', COALESCE(b.page_index, 0),
            'quote', CASE WHEN b.excerpt IS NULL THEN NULL ELSE json_object(
                'exact', trim(b.excerpt),
                'prefix', '',
                'suffix', ''
            ) END,
            'rects', json_array()
        )
        ELSE json_object(
            'kind', 'book',
            'chapterId', COALESCE(b.chapter_id, 'chapter-0'),
            'startOffset', COALESCE(b.char_offset, 0),
            'endOffset', COALESCE(b.char_offset, 0) + length(COALESCE(trim(b.excerpt), '')),
            'quote', json_object(
                'exact', COALESCE(trim(b.excerpt), ''),
                'prefix', '',
                'suffix', ''
            ),
            'domRange', NULL
        )
    END,
    NULL,
    b.created_at,
    b.updated_at
FROM bookmarks b
JOIN works w ON w.id = b.work_id
WHERE (b.excerpt IS NOT NULL AND length(trim(b.excerpt)) > 0)
   OR (b.note IS NOT NULL AND length(trim(b.note)) > 0);

INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (8, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

COMMIT;
