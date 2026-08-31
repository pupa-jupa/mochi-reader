use std::path::PathBuf;

use mochi_reader_lib::{
    database::{
        bookmark_repository::{BookmarkDraft, BookmarkRepository},
        collection_repository::CollectionRepository,
        migrations::migrate,
        reading_session_repository::ReadingSessionRepository,
        settings_repository::{AppSettings, SettingsRepository, ThemeName},
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
fn progress_is_upserted_and_exposed_in_library_summaries() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let work_id = insert_work(&connection);
    let service = ReadingProgressService::new(&connection);

    service
        .save(&ProgressUpdate {
            work_id: work_id.clone(),
            locator: ReaderLocator::Book {
                chapter_id: Some("chapter-2".to_string()),
                char_offset: Some(120),
            },
            percent: 0.64,
        })
        .unwrap();

    let progress = service.get_for_work(&work_id).unwrap().unwrap();
    assert_eq!(
        progress.locator,
        ReaderLocator::Book {
            chapter_id: Some("chapter-2".to_string()),
            char_offset: Some(120),
        }
    );
    assert_eq!(progress.percent, 0.64);
    let summary = WorkRepository::new(&connection)
        .list("", 0, 10)
        .unwrap()
        .items
        .remove(0);
    assert_eq!(summary.progress_percent, 64.0);
}

#[test]
fn bookmarks_history_and_collections_survive_repository_reloads() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let work_id = insert_work(&connection);

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
    let bookmarks = BookmarkRepository::new(&connection).list().unwrap();
    assert_eq!(bookmarks[0].id, bookmark_id);
    assert_eq!(bookmarks[0].work_title, "Moonlit pages");
    assert_eq!(bookmarks[0].note.as_deref(), Some("return here"));

    let session_id = ReadingSessionRepository::new(&connection)
        .start(
            &work_id,
            &ReaderLocator::Book {
                chapter_id: Some("chapter-1".to_string()),
                char_offset: Some(10),
            },
        )
        .unwrap();
    ReadingSessionRepository::new(&connection)
        .finish(
            &session_id,
            &ReaderLocator::Book {
                chapter_id: Some("chapter-2".to_string()),
                char_offset: Some(20),
            },
        )
        .unwrap();
    let history = ReadingSessionRepository::new(&connection).list(20).unwrap();
    assert_eq!(history[0].work_id, work_id);
    assert_eq!(
        history[0].end_locator,
        Some(ReaderLocator::Book {
            chapter_id: Some("chapter-2".to_string()),
            char_offset: Some(20),
        })
    );
    assert!(history[0].ended_at.is_some());

    let collection_id = CollectionRepository::new(&connection)
        .create("Evening", Some("For quiet reading"))
        .unwrap();
    CollectionRepository::new(&connection)
        .add_work(&collection_id, &work_id)
        .unwrap();
    CollectionRepository::new(&connection)
        .add_work(&collection_id, &work_id)
        .unwrap();
    let collections = CollectionRepository::new(&connection).list().unwrap();
    assert_eq!(collections[0].item_count, 1);
}

#[test]
fn collection_members_can_be_reopened_edited_and_removed_without_deleting_the_work() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let work_id = insert_work(&connection);
    let collection_id = CollectionRepository::new(&connection)
        .create("Evening", Some("For quiet reading"))
        .unwrap();
    CollectionRepository::new(&connection)
        .add_work(&collection_id, &work_id)
        .unwrap();

    let reopened = CollectionRepository::new(&connection)
        .get(&collection_id)
        .unwrap();
    assert_eq!(reopened.title, "Evening");
    assert_eq!(reopened.items.len(), 1);
    assert_eq!(reopened.items[0].id, work_id);
    assert_eq!(reopened.items[0].title, "Moonlit pages");

    CollectionRepository::new(&connection)
        .update(&collection_id, "Rainy evening", Some("Updated shelf"))
        .unwrap();
    let updated = CollectionRepository::new(&connection)
        .get(&collection_id)
        .unwrap();
    assert_eq!(updated.title, "Rainy evening");
    assert_eq!(updated.description.as_deref(), Some("Updated shelf"));

    CollectionRepository::new(&connection)
        .remove_work(&collection_id, &work_id)
        .unwrap();
    assert!(
        CollectionRepository::new(&connection)
            .get(&collection_id)
            .unwrap()
            .items
            .is_empty()
    );
    assert_eq!(
        WorkRepository::new(&connection)
            .get(&work_id)
            .unwrap()
            .title,
        "Moonlit pages"
    );

    CollectionRepository::new(&connection)
        .delete(&collection_id)
        .unwrap();
    assert!(
        CollectionRepository::new(&connection)
            .get(&collection_id)
            .is_err()
    );
}

#[test]
fn versioned_settings_have_defaults_and_round_trip() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let repository = SettingsRepository::new(&connection);

    assert_eq!(repository.get().unwrap(), AppSettings::default());
    let updated = AppSettings {
        theme: ThemeName::Night,
        reduce_motion: true,
        show_mascot: false,
        ui_scale: 112,
        onboarding_complete: true,
        cache_limit_mb: Some(2_048),
    };
    repository.save(&updated).unwrap();

    assert_eq!(SettingsRepository::new(&connection).get().unwrap(), updated);
    let version: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(version, 7);
}
