use mochi_reader_lib::{
    database::migrations::migrate,
    import::job::{ImportOptions, import_paths},
    reader::load_pdf_bytes,
};
use rusqlite::Connection;

#[test]
fn pdf_bytes_are_only_read_through_a_library_work() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("Moon.pdf");
    std::fs::write(&path, b"%PDF-1.4\n%%EOF").unwrap();
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let imported = import_paths(&connection, &[path], &ImportOptions::default());
    let id = imported.items[0].work_id.as_deref().unwrap();

    let bytes = load_pdf_bytes(&connection, id).unwrap();

    assert!(bytes.starts_with(b"%PDF-"));
    assert!(load_pdf_bytes(&connection, "unknown-work").is_err());
}
