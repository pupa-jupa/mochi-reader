use mochi_reader_lib::{
    database::migrations::migrate,
    import::job::{ImportOptions, import_paths},
    reader::load_reader_document,
};
use rusqlite::Connection;

#[test]
fn imported_text_work_opens_through_the_reader_service() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("Quiet Moon.txt");
    std::fs::write(&path, "A calm first paragraph.\n\nAnd another page.").unwrap();
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let imported = import_paths(&connection, &[path], &ImportOptions::default());
    let id = imported.items[0].work_id.as_deref().unwrap();

    let document = load_reader_document(&connection, id).unwrap();

    assert_eq!(document.work_id, id);
    assert_eq!(document.title, "Quiet Moon");
    assert_eq!(document.chapters.len(), 1);
    assert!(document.chapters[0].html.contains("calm first paragraph"));
}
