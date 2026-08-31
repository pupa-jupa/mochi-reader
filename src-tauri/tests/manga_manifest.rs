use std::io::Write;

use mochi_reader_lib::manga::manifest::{load_manga_manifest, load_manga_page};

#[test]
fn image_folder_manifest_uses_natural_page_order() {
    let directory = tempfile::tempdir().unwrap();
    for name in ["10.png", "2.png", "1.png"] {
        std::fs::write(directory.path().join(name), tiny_png()).unwrap();
    }

    let manifest = load_manga_manifest("work-1", "Moon", directory.path()).unwrap();

    assert_eq!(manifest.pages.len(), 3);
    assert_eq!(manifest.pages[0].label, "1.png");
    assert_eq!(manifest.pages[1].label, "2.png");
    assert_eq!(manifest.pages[2].label, "10.png");
    let page = load_manga_page(directory.path(), &manifest.pages[1]).unwrap();
    assert!(page.data_url.starts_with("data:image/png;base64,"));
}

#[test]
fn cbz_manifest_ignores_non_images_and_blocks_traversal_entries() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("chapter.cbz");
    let file = std::fs::File::create(&path).unwrap();
    let mut archive = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    archive.start_file("pages/2.png", options).unwrap();
    archive.write_all(tiny_png()).unwrap();
    archive.start_file("notes.txt", options).unwrap();
    archive.write_all(b"ignore").unwrap();
    archive.start_file("../escape.png", options).unwrap();
    archive.write_all(tiny_png()).unwrap();
    archive.start_file("pages/1.png", options).unwrap();
    archive.write_all(tiny_png()).unwrap();
    archive.finish().unwrap();

    let manifest = load_manga_manifest("work-2", "CBZ", &path).unwrap();

    assert_eq!(manifest.pages.len(), 2);
    assert_eq!(manifest.pages[0].label, "pages/1.png");
    assert_eq!(manifest.pages[1].label, "pages/2.png");
}

fn tiny_png() -> &'static [u8] {
    // 1x1 transparent PNG
    &[
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44,
        0x52, 0x00, 0x00, 0x00, 0x01, 0x00, 0x00, 0x00, 0x01, 0x08, 0x06, 0x00, 0x00, 0x00, 0x1f,
        0x15, 0xc4, 0x89, 0x00, 0x00, 0x00, 0x0a, 0x49, 0x44, 0x41, 0x54, 0x78, 0x9c, 0x63, 0x00,
        0x01, 0x00, 0x00, 0x05, 0x00, 0x01, 0x0d, 0x0a, 0x2d, 0xb4, 0x00, 0x00, 0x00, 0x00, 0x49,
        0x45, 0x4e, 0x44, 0xae, 0x42, 0x60, 0x82,
    ]
}
