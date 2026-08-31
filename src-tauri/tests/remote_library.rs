use mochi_reader_lib::{
    database::{
        migrations::migrate, source_repository::SourceRepository, work_repository::WorkRepository,
    },
    domain::{
        reader::{ProgressUpdate, ReaderLocator},
        work::{RemoteWorkDraft, WorkFormat, WorkOrigin},
    },
    services::reading_progress::ReadingProgressService,
    sources::mangadex::builtin_source,
};
use rusqlite::Connection;

#[test]
fn remote_manga_is_idempotent_in_library_and_progress_survives_database_reopen() {
    let directory = tempfile::tempdir().unwrap();
    let database_path = directory.path().join("remote-library.sqlite3");
    let connection = Connection::open(&database_path).unwrap();
    migrate(&connection).unwrap();
    let source_id = SourceRepository::new(&connection)
        .upsert(&builtin_source())
        .unwrap();
    let draft = RemoteWorkDraft {
        source_id: source_id.clone(),
        remote_id: "manga-uuid".to_string(),
        title: "Лунные письма".to_string(),
        description: Some("Тихая история".to_string()),
        remote_url: "https://mangadex.org/title/manga-uuid".to_string(),
        cover_url: Some(
            "https://uploads.mangadex.org/covers/manga-uuid/cover.jpg.256.jpg".to_string(),
        ),
        chapter_count: 12,
    };
    let repository = WorkRepository::new(&connection);

    let first_id = repository.upsert_remote(&draft).unwrap();
    let sparse_reader_draft = RemoteWorkDraft {
        description: None,
        cover_url: None,
        chapter_count: 0,
        ..draft.clone()
    };
    let second_id = repository.upsert_remote(&sparse_reader_draft).unwrap();
    let found_id = repository.find_remote_id(&source_id, "manga-uuid").unwrap();
    let details = repository.get(&first_id).unwrap();
    let page = repository.list("", 0, 20).unwrap();
    let cache_count: i64 = connection
        .query_row("SELECT COUNT(*) FROM source_cache_entries", [], |row| {
            row.get(0)
        })
        .unwrap();

    assert_eq!(first_id, second_id);
    assert_eq!(found_id.as_deref(), Some(first_id.as_str()));
    assert_eq!(page.total, 1);
    assert_eq!(page.items[0].id, first_id);
    assert_eq!(details.origin_kind, WorkOrigin::Remote);
    assert_eq!(details.format, WorkFormat::RemoteManga);
    assert_eq!(details.source_id.as_deref(), Some(source_id.as_str()));
    assert_eq!(details.remote_id.as_deref(), Some("manga-uuid"));
    assert_eq!(
        details.remote_url.as_deref(),
        Some("https://mangadex.org/title/manga-uuid")
    );
    assert_eq!(details.remote_cover_url, draft.cover_url);
    assert_eq!(details.description, draft.description);
    assert_eq!(details.chapter_count, 12);
    assert!(!details.missing_file);
    assert_eq!(cache_count, 0);

    let saved = ReadingProgressService::new(&connection)
        .save(&ProgressUpdate {
            work_id: first_id.clone(),
            locator: ReaderLocator::Manga {
                chapter_id: Some("chapter-readable".to_string()),
                page_index: 6,
            },
            percent: 0.58,
        })
        .unwrap();
    drop(connection);

    let reopened = Connection::open(&database_path).unwrap();
    migrate(&reopened).unwrap();
    let progress = ReadingProgressService::new(&reopened)
        .get_for_work(&first_id)
        .unwrap()
        .unwrap();
    let reopened_details = WorkRepository::new(&reopened).get(&first_id).unwrap();

    assert_eq!(progress, saved);
    assert_eq!(
        progress.locator,
        ReaderLocator::Manga {
            chapter_id: Some("chapter-readable".to_string()),
            page_index: 6,
        }
    );
    assert_eq!(reopened_details.title, "Лунные письма");
    assert!((reopened_details.progress_percent - 58.0).abs() < 1e-9);
}
