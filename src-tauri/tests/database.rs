use std::path::Path;

use mochi_reader_lib::{
    database::{migrations::migrate, work_repository::WorkRepository},
    domain::work::{NewWork, WorkFormat, WorkKind, WorkStatus},
};
use rusqlite::Connection;

fn migrated_database() -> Connection {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    connection
}

fn sample_work(path: &Path, title: &str) -> NewWork {
    NewWork {
        title: title.to_string(),
        author: Some("Aiko Mori".to_string()),
        kind: WorkKind::Book,
        format: WorkFormat::Epub,
        source_path: path.to_path_buf(),
        file_size: 128,
        fingerprint: format!("fixture-{title}"),
        cover_path: None,
        page_count: None,
        chapter_count: 3,
    }
}

#[test]
fn migrations_create_a_searchable_persistent_library() {
    let source = tempfile::NamedTempFile::new().unwrap();
    let connection = migrated_database();
    let repository = WorkRepository::new(&connection);

    let id = repository
        .insert(&sample_work(source.path(), "Moonlit Letters"))
        .unwrap();
    let work = repository.get(&id).unwrap();
    let result = repository.list("moonlit", 0, 40).unwrap();

    assert_eq!(work.title, "Moonlit Letters");
    assert_eq!(work.author.as_deref(), Some("Aiko Mori"));
    assert_eq!(result.total, 1);
    assert_eq!(result.items[0].id, id);
}

#[test]
fn removing_a_work_never_deletes_its_source_file() {
    let source = tempfile::NamedTempFile::new().unwrap();
    let connection = migrated_database();
    let repository = WorkRepository::new(&connection);
    let id = repository
        .insert(&sample_work(source.path(), "Safe Source"))
        .unwrap();

    repository.remove(&id).unwrap();

    assert!(source.path().exists());
    assert!(repository.get(&id).is_err());
}

#[test]
fn favorite_and_reading_status_updates_are_persistent() {
    let source = tempfile::NamedTempFile::new().unwrap();
    let connection = migrated_database();
    let repository = WorkRepository::new(&connection);
    let id = repository
        .insert(&sample_work(source.path(), "Mutable metadata"))
        .unwrap();

    repository.set_favorite(&id, true).unwrap();
    repository.set_status(&id, WorkStatus::Completed).unwrap();

    let work = WorkRepository::new(&connection).get(&id).unwrap();
    assert!(work.favorite);
    assert_eq!(work.status, WorkStatus::Completed);
}

#[test]
fn metadata_edits_refresh_search_and_relink_keeps_the_library_record() {
    let source = tempfile::NamedTempFile::new().unwrap();
    let replacement = tempfile::NamedTempFile::new().unwrap();
    let connection = migrated_database();
    let repository = WorkRepository::new(&connection);
    let id = repository
        .insert(&sample_work(source.path(), "Old title"))
        .unwrap();

    repository
        .update_metadata(
            &id,
            "New moon title",
            Some("New author"),
            Some("Original title"),
            Some("Updated description"),
        )
        .unwrap();
    repository
        .relink(
            &id,
            replacement.path(),
            replacement.as_file().metadata().unwrap().len(),
        )
        .unwrap();

    let work = repository.get(&id).unwrap();
    assert_eq!(work.title, "New moon title");
    assert_eq!(work.source_path, replacement.path().to_string_lossy());
    assert_eq!(repository.list("new moon", 0, 20).unwrap().total, 1);
    assert_eq!(repository.list("old title", 0, 20).unwrap().total, 0);
}
