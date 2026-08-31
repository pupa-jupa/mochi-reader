use std::path::PathBuf;

use mochi_reader_lib::{
    database::{
        migrations::migrate, reading_session_repository::ReadingSessionRepository,
        work_repository::WorkRepository,
    },
    domain::{
        reader::{ProgressUpdate, ReaderLocator},
        work::{NewWork, WorkFormat, WorkKind},
    },
    services::reading_progress::ReadingProgressService,
};
use rusqlite::Connection;

fn insert_work(connection: &Connection) -> String {
    WorkRepository::new(connection)
        .insert(&NewWork {
            title: "Moonlit pages".to_string(),
            author: Some("Mochi".to_string()),
            kind: WorkKind::Book,
            format: WorkFormat::Txt,
            source_path: PathBuf::from("C:/books/moon.txt"),
            file_size: 42,
            fingerprint: "sha256:fixture".to_string(),
            cover_path: None,
            page_count: None,
            chapter_count: 3,
        })
        .unwrap()
}

#[test]
fn v6_migration_preserves_legacy_progress_and_history_with_content_identity() {
    let connection = Connection::open_in_memory().unwrap();
    for schema in [
        include_str!("../migrations/0001_initial.sql"),
        include_str!("../migrations/0002_persistent_reader_state.sql"),
        include_str!("../migrations/0003_sources.sql"),
        include_str!("../migrations/0004_source_cache.sql"),
        include_str!("../migrations/0005_mangadex_source.sql"),
    ] {
        connection.execute_batch(schema).unwrap();
    }
    connection
        .execute(
            "INSERT INTO works (
                id, title, kind, format, source_path, file_size, fingerprint,
                chapter_count, added_at, updated_at
             ) VALUES (
                'legacy-work', 'Legacy book', 'book', 'txt', 'C:/legacy.txt', 10,
                'sha256:legacy', 2, '2026-08-30T10:00:00Z', '2026-08-30T10:00:00Z'
             )",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO reading_progress (
                work_id, chapter_id, page_index, char_offset, percent, reader_mode, updated_at
             ) VALUES (
                'legacy-work', 'chapter-2', NULL, 120, 0.64, 'book',
                '2026-08-30T11:00:00Z'
             )",
            [],
        )
        .unwrap();
    connection
        .execute(
            "INSERT INTO history (
                id, work_id, chapter_id, page_index, opened_at, closed_at
             ) VALUES (
                'legacy-session', 'legacy-work', 'chapter-1', NULL,
                '2026-08-30T10:00:00Z', '2026-08-30T10:10:00Z'
             )",
            [],
        )
        .unwrap();

    migrate(&connection).unwrap();

    let identity: String = connection
        .query_row(
            "SELECT content_identity FROM works WHERE id = 'legacy-work'",
            [],
            |row| row.get(0),
        )
        .unwrap();
    let (progress_identity, locator_json): (String, String) = connection
        .query_row(
            "SELECT content_identity, locator_json FROM reading_progress WHERE work_id = 'legacy-work'",
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .unwrap();
    let (session_identity, start_locator_json, duration_seconds): (String, String, i64) =
        connection
            .query_row(
                "SELECT content_identity, start_locator_json, duration_seconds
                 FROM reading_sessions WHERE id = 'legacy-session'",
                [],
                |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
            )
            .unwrap();
    let version: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .unwrap();

    assert_eq!(identity, "local:legacy-work");
    assert_eq!(progress_identity, identity);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&locator_json).unwrap(),
        serde_json::json!({
            "kind": "book",
            "chapterId": "chapter-2",
            "charOffset": 120
        })
    );
    assert_eq!(session_identity, identity);
    assert_eq!(
        serde_json::from_str::<serde_json::Value>(&start_locator_json).unwrap(),
        serde_json::json!({
            "kind": "book",
            "chapterId": "chapter-1",
            "charOffset": null
        })
    );
    assert_eq!(duration_seconds, 600);
    assert_eq!(version, 8);
}

#[test]
fn progress_service_uses_one_content_identity_and_typed_locators() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let work_id = insert_work(&connection);
    let service = ReadingProgressService::new(&connection);

    let saved = service
        .save(&ProgressUpdate {
            work_id: work_id.clone(),
            locator: ReaderLocator::Book {
                chapter_id: Some("chapter-2".to_string()),
                char_offset: Some(120),
            },
            percent: 0.64,
        })
        .unwrap();

    assert_eq!(saved.content_identity, format!("local:{work_id}"));
    assert_eq!(
        saved.locator,
        ReaderLocator::Book {
            chapter_id: Some("chapter-2".to_string()),
            char_offset: Some(120),
        }
    );
    assert_eq!(saved.percent, 0.64);
    assert_eq!(
        service
            .get_by_content_identity(&saved.content_identity)
            .unwrap()
            .unwrap(),
        saved
    );

    let updated = service
        .save(&ProgressUpdate {
            work_id: work_id.clone(),
            locator: ReaderLocator::Pdf { page_index: 8 },
            percent: 0.9,
        })
        .unwrap();
    let row_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM reading_progress", [], |row| {
            row.get(0)
        })
        .unwrap();

    assert_eq!(updated.content_identity, saved.content_identity);
    assert_eq!(updated.locator, ReaderLocator::Pdf { page_index: 8 });
    assert_eq!(row_count, 1);
}

#[test]
fn reading_session_captures_start_end_locators_and_can_be_removed_without_the_work() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let work_id = insert_work(&connection);
    let repository = ReadingSessionRepository::new(&connection);
    let start = ReaderLocator::Manga {
        chapter_id: Some("chapter-7".to_string()),
        page_index: 2,
    };
    let end = ReaderLocator::Manga {
        chapter_id: Some("chapter-7".to_string()),
        page_index: 9,
    };

    let session_id = repository.start(&work_id, &start).unwrap();
    repository.finish(&session_id, &end).unwrap();
    let sessions = repository.list(20).unwrap();

    assert_eq!(sessions.len(), 1);
    assert_eq!(sessions[0].content_identity, format!("local:{work_id}"));
    assert_eq!(sessions[0].start_locator, start);
    assert_eq!(sessions[0].end_locator.as_ref(), Some(&end));
    assert!(sessions[0].ended_at.is_some());
    assert!(sessions[0].duration_seconds.is_some());

    repository.delete(&session_id).unwrap();
    assert!(repository.list(20).unwrap().is_empty());
    assert_eq!(
        WorkRepository::new(&connection)
            .get(&work_id)
            .unwrap()
            .title,
        "Moonlit pages"
    );
}
