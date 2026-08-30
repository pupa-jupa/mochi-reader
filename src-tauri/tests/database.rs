use std::path::Path;

use mochi_reader_lib::{
    database::{migrations::migrate, work_repository::WorkRepository},
    domain::work::{NewWork, WorkFormat, WorkKind},
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
