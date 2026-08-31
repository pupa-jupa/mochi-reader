use mochi_reader_lib::{
    cache::CacheManager,
    database::{migrations::migrate, source_repository::SourceRepository},
    sources::manifest::validate_manifest,
};
use rusqlite::Connection;
use tempfile::tempdir;
use url::Url;

fn insert_source(connection: &Connection) -> String {
    let source = validate_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "Cache fixture",
          "endpoints": {
            "search": "/search?q={query}&page={page}",
            "manga": "/manga/{id}",
            "chapters": "/manga/{id}/chapters",
            "pages": "/chapter/{id}/pages"
          }
        }"#,
        &Url::parse("https://manga.example").unwrap(),
    )
    .unwrap();
    SourceRepository::new(connection).upsert(&source).unwrap()
}

#[test]
fn page_cache_round_trips_bytes_and_tracks_usage() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let source_id = insert_source(&connection);
    let directory = tempdir().unwrap();
    let manager = CacheManager::new(&connection, directory.path()).unwrap();

    manager
        .store(
            &source_id,
            "https://manga.example/page/1.jpg",
            b"fixture-image",
            "image/jpeg",
            false,
            Some(1_024),
        )
        .unwrap();
    let cached = manager
        .get(&source_id, "https://manga.example/page/1.jpg")
        .unwrap()
        .unwrap();

    assert_eq!(cached.bytes, b"fixture-image");
    assert_eq!(cached.media_type, "image/jpeg");
    assert_eq!(manager.stats().unwrap().total_bytes, 13);
}

#[test]
fn quota_eviction_keeps_pinned_downloads() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let source_id = insert_source(&connection);
    let directory = tempdir().unwrap();
    let manager = CacheManager::new(&connection, directory.path()).unwrap();

    manager
        .store(
            &source_id,
            "https://manga.example/page/pinned.jpg",
            &[1; 60],
            "image/jpeg",
            true,
            Some(100),
        )
        .unwrap();
    manager
        .store(
            &source_id,
            "https://manga.example/page/transient.jpg",
            &[2; 60],
            "image/jpeg",
            false,
            Some(100),
        )
        .unwrap();

    assert!(
        manager
            .get(&source_id, "https://manga.example/page/pinned.jpg")
            .unwrap()
            .is_some()
    );
    assert!(
        manager
            .get(&source_id, "https://manga.example/page/transient.jpg")
            .unwrap()
            .is_none()
    );
    assert_eq!(manager.stats().unwrap().pinned_bytes, 60);
}

#[test]
fn clearing_transient_cache_does_not_remove_offline_pages() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let source_id = insert_source(&connection);
    let directory = tempdir().unwrap();
    let manager = CacheManager::new(&connection, directory.path()).unwrap();
    manager
        .store(
            &source_id,
            "https://manga.example/pinned",
            &[1; 8],
            "image/png",
            true,
            None,
        )
        .unwrap();
    manager
        .store(
            &source_id,
            "https://manga.example/cache",
            &[2; 8],
            "image/png",
            false,
            None,
        )
        .unwrap();

    manager.clear_transient().unwrap();

    let stats = manager.stats().unwrap();
    assert_eq!(stats.entry_count, 1);
    assert_eq!(stats.pinned_bytes, 8);
}

#[test]
fn clearing_a_source_removes_its_cached_files_and_keeps_other_sources() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let first_source = insert_source(&connection);
    let other_source = format!("{first_source}-other");
    connection
        .execute(
            "INSERT INTO sources (
                id, name, base_url, adapter_kind, enabled, config_json,
                supports_search, supports_download, created_at, updated_at
             ) SELECT ?1, name || ' other', 'https://other.example', adapter_kind, enabled,
                      config_json, supports_search, supports_download, created_at, updated_at
               FROM sources WHERE id = ?2",
            [&other_source, &first_source],
        )
        .unwrap();
    let directory = tempdir().unwrap();
    let manager = CacheManager::new(&connection, directory.path()).unwrap();
    manager
        .store(
            &first_source,
            "https://manga.example/one",
            &[1; 8],
            "image/png",
            true,
            None,
        )
        .unwrap();
    manager
        .store(
            &other_source,
            "https://other.example/two",
            &[2; 6],
            "image/png",
            false,
            None,
        )
        .unwrap();

    manager.clear_source(&first_source).unwrap();

    assert!(
        manager
            .get(&first_source, "https://manga.example/one")
            .unwrap()
            .is_none()
    );
    assert!(
        manager
            .get(&other_source, "https://other.example/two")
            .unwrap()
            .is_some()
    );
    assert_eq!(manager.stats().unwrap().total_bytes, 6);
    assert_eq!(std::fs::read_dir(directory.path()).unwrap().count(), 1);
}
