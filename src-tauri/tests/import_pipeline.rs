use mochi_reader_lib::{
    database::{migrations::migrate, work_repository::WorkRepository},
    import::job::{ImportOptions, import_paths},
};
use rusqlite::Connection;

#[test]
fn importing_a_supported_file_creates_a_queryable_library_work() {
    let directory = tempfile::tempdir().unwrap();
    let book_path = directory.path().join("Evening Sakura.txt");
    std::fs::write(&book_path, "A quiet chapter under the moon.").unwrap();
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();

    let result = import_paths(
        &connection,
        std::slice::from_ref(&book_path),
        &ImportOptions::default(),
    );

    assert_eq!(result.imported, 1);
    assert_eq!(result.failed, 0);
    let work_id = result.items[0].work_id.as_deref().unwrap();
    let work = WorkRepository::new(&connection).get(work_id).unwrap();
    assert_eq!(work.title, "Evening Sakura");
    assert_eq!(work.format.as_str(), "txt");
    assert_eq!(work.source_path, book_path.to_string_lossy());
}

#[test]
fn batch_import_keeps_valid_items_when_another_path_is_missing() {
    let directory = tempfile::tempdir().unwrap();
    let valid_path = directory.path().join("Valid.md");
    let missing_path = directory.path().join("Missing.epub");
    std::fs::write(&valid_path, "# Valid").unwrap();
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();

    let result = import_paths(
        &connection,
        &[valid_path, missing_path.clone()],
        &ImportOptions::default(),
    );

    assert_eq!(result.imported, 1);
    assert_eq!(result.failed, 1);
    assert_eq!(result.items[1].path, missing_path.to_string_lossy());
    assert!(
        result.items[1]
            .error
            .as_deref()
            .unwrap()
            .contains("не найден")
    );
}
