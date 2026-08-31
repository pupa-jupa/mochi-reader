use std::path::PathBuf;

use mochi_reader_lib::{
    database::{
        annotation_repository::{AnnotationQuery, AnnotationRepository},
        bookmark_repository::{BookmarkDraft, BookmarkRepository},
        connection::open_database,
        migrations::migrate,
        work_repository::WorkRepository,
    },
    domain::{
        annotation::{
            AnnotationKind, AnnotationLocator, DomRangeSelector, HighlightColor,
            ReaderAnnotationDraft, ReaderAnnotationUpdate, TextQuoteSelector,
        },
        work::{NewWork, WorkFormat, WorkKind},
    },
};

fn insert_book(connection: &rusqlite::Connection) -> String {
    WorkRepository::new(connection)
        .insert(&NewWork {
            title: "Moonlit pages".to_string(),
            author: Some("Mochi".to_string()),
            kind: WorkKind::Book,
            format: WorkFormat::Fb2,
            source_path: PathBuf::from("C:/books/moon.fb2"),
            file_size: 42,
            fingerprint: "sha256:annotation-fixture".to_string(),
            cover_path: None,
            page_count: None,
            chapter_count: 3,
        })
        .unwrap()
}

fn book_locator() -> AnnotationLocator {
    AnnotationLocator::Book {
        chapter_id: "chapter-1".to_string(),
        start_offset: 17,
        end_offset: 27,
        quote: TextQuoteSelector {
            exact: "quiet moon".to_string(),
            prefix: "A very ".to_string(),
            suffix: " appeared".to_string(),
        },
        dom_range: Some(DomRangeSelector {
            start_path: vec![0, 1],
            start_node_offset: 2,
            end_path: vec![0, 2],
            end_node_offset: 4,
        }),
    }
}

#[test]
fn annotations_survive_reopen_and_support_search_update_and_delete() {
    let directory = tempfile::tempdir().unwrap();
    let database_path = directory.path().join("annotations.sqlite3");
    let connection = open_database(&database_path).unwrap();
    migrate(&connection).unwrap();
    let work_id = insert_book(&connection);

    let created = AnnotationRepository::new(&connection)
        .create(&ReaderAnnotationDraft {
            work_id: work_id.clone(),
            kind: AnnotationKind::Highlight,
            quote: "quiet moon".to_string(),
            note: None,
            locator: book_locator(),
            color: None,
        })
        .unwrap();

    assert_eq!(created.content_identity, format!("local:{work_id}"));
    assert_eq!(created.work_title, "Moonlit pages");
    assert_eq!(created.color, Some(HighlightColor::Sakura));
    drop(connection);

    let connection = open_database(&database_path).unwrap();
    migrate(&connection).unwrap();
    let repository = AnnotationRepository::new(&connection);
    let results = repository
        .list(&AnnotationQuery {
            work_id: Some(work_id),
            kind: Some(AnnotationKind::Highlight),
            search: Some("moon".to_string()),
            limit: Some(20),
        })
        .unwrap();

    assert_eq!(results, vec![created.clone()]);

    let updated = repository
        .update(
            &created.id,
            &ReaderAnnotationUpdate {
                note: Some("Return to this image".to_string()),
                color: Some(HighlightColor::Lavender),
            },
        )
        .unwrap();
    assert_eq!(updated.note.as_deref(), Some("Return to this image"));
    assert_eq!(updated.color, Some(HighlightColor::Lavender));
    assert_ne!(updated.updated_at, "");

    repository.delete(&created.id).unwrap();
    assert!(
        repository
            .list(&AnnotationQuery::default())
            .unwrap()
            .is_empty()
    );
}

#[test]
fn annotation_locator_must_match_the_work_reader() {
    let connection = rusqlite::Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let work_id = insert_book(&connection);

    let error = AnnotationRepository::new(&connection)
        .create(&ReaderAnnotationDraft {
            work_id,
            kind: AnnotationKind::Quote,
            quote: "wrong reader".to_string(),
            note: None,
            locator: AnnotationLocator::Manga {
                chapter_id: Some("chapter-1".to_string()),
                page_index: 4,
            },
            color: None,
        })
        .unwrap_err();

    assert!(error.to_string().contains("позиция аннотации"));
}

#[test]
fn v8_migration_preserves_legacy_quotes_and_notes() {
    let connection = rusqlite::Connection::open_in_memory().unwrap();
    for migration in [
        include_str!("../migrations/0001_initial.sql"),
        include_str!("../migrations/0002_persistent_reader_state.sql"),
        include_str!("../migrations/0003_sources.sql"),
        include_str!("../migrations/0004_source_cache.sql"),
        include_str!("../migrations/0005_mangadex_source.sql"),
        include_str!("../migrations/0006_content_identity.sql"),
        include_str!("../migrations/0007_remote_library.sql"),
    ] {
        connection.execute_batch(migration).unwrap();
    }
    let work_id = insert_book(&connection);
    let bookmark_id = BookmarkRepository::new(&connection)
        .create(&BookmarkDraft {
            work_id: work_id.clone(),
            chapter_id: Some("chapter-1".to_string()),
            page_index: None,
            char_offset: Some(17),
            percent: 0.2,
            excerpt: Some("quiet moon".to_string()),
            note: Some("return here".to_string()),
        })
        .unwrap();
    BookmarkRepository::new(&connection)
        .create(&BookmarkDraft {
            work_id: work_id.clone(),
            chapter_id: Some("chapter-2".to_string()),
            page_index: None,
            char_offset: Some(40),
            percent: 0.7,
            excerpt: None,
            note: None,
        })
        .unwrap();

    migrate(&connection).unwrap();

    let migrated = AnnotationRepository::new(&connection)
        .list(&AnnotationQuery::default())
        .unwrap();
    assert_eq!(migrated.len(), 1);
    assert_eq!(migrated[0].id, bookmark_id);
    assert_eq!(migrated[0].kind, AnnotationKind::Note);
    assert_eq!(migrated[0].quote, "quiet moon");
    assert_eq!(migrated[0].note.as_deref(), Some("return here"));
    assert_eq!(
        migrated[0].locator,
        AnnotationLocator::Book {
            chapter_id: "chapter-1".to_string(),
            start_offset: 17,
            end_offset: 27,
            quote: TextQuoteSelector {
                exact: "quiet moon".to_string(),
                prefix: String::new(),
                suffix: String::new(),
            },
            dom_range: None,
        }
    );
    let version: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(version, 8);
}

#[test]
fn v8_migration_keeps_pdf_quote_selector_as_structured_json() {
    let connection = rusqlite::Connection::open_in_memory().unwrap();
    for migration in [
        include_str!("../migrations/0001_initial.sql"),
        include_str!("../migrations/0002_persistent_reader_state.sql"),
        include_str!("../migrations/0003_sources.sql"),
        include_str!("../migrations/0004_source_cache.sql"),
        include_str!("../migrations/0005_mangadex_source.sql"),
        include_str!("../migrations/0006_content_identity.sql"),
        include_str!("../migrations/0007_remote_library.sql"),
    ] {
        connection.execute_batch(migration).unwrap();
    }
    let work_id = WorkRepository::new(&connection)
        .insert(&NewWork {
            title: "Paper moon".to_string(),
            author: None,
            kind: WorkKind::Book,
            format: WorkFormat::Pdf,
            source_path: PathBuf::from("C:/books/paper-moon.pdf"),
            file_size: 84,
            fingerprint: "sha256:pdf-annotation-fixture".to_string(),
            cover_path: None,
            page_count: Some(12),
            chapter_count: 0,
        })
        .unwrap();
    BookmarkRepository::new(&connection)
        .create(&BookmarkDraft {
            work_id,
            chapter_id: None,
            page_index: Some(4),
            char_offset: None,
            percent: 0.4,
            excerpt: Some("paper moon".to_string()),
            note: None,
        })
        .unwrap();

    migrate(&connection).unwrap();

    let migrated = AnnotationRepository::new(&connection)
        .list(&AnnotationQuery::default())
        .unwrap();
    assert_eq!(migrated.len(), 1);
    assert_eq!(migrated[0].kind, AnnotationKind::Quote);
    assert_eq!(
        migrated[0].locator,
        AnnotationLocator::Pdf {
            page_index: 4,
            quote: Some(TextQuoteSelector {
                exact: "paper moon".to_string(),
                prefix: String::new(),
                suffix: String::new(),
            }),
            rects: Vec::new(),
        }
    );
}
