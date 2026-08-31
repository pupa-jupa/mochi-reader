use std::io::Write;

use mochi_reader_lib::{
    domain::work::WorkFormat,
    parsers::{parse_book, sanitize_book_html},
};

#[test]
fn sanitizer_removes_active_content_and_remote_resources() {
    let dirty = r#"
        <h1 onclick="steal()">Moon</h1>
        <script>steal()</script>
        <iframe src="https://evil.test"></iframe>
        <p><em>safe</em><img src="https://evil.test/pixel.png"></p>
    "#;

    let clean = sanitize_book_html(dirty);

    assert!(clean.contains("<h1>Moon</h1>"));
    assert!(clean.contains("<em>safe</em>"));
    assert!(!clean.contains("onclick"));
    assert!(!clean.contains("script"));
    assert!(!clean.contains("iframe"));
    assert!(!clean.contains("evil.test"));
}

#[test]
fn text_and_markdown_become_readable_chapters() {
    let directory = tempfile::tempdir().unwrap();
    let text_path = directory.path().join("Evening.txt");
    let markdown_path = directory.path().join("Notes.md");
    std::fs::write(&text_path, "First line.\n\nSecond paragraph.").unwrap();
    std::fs::write(&markdown_path, "# Chapter one\n\nA *quiet* page.").unwrap();

    let text = parse_book(&text_path, WorkFormat::Txt).unwrap();
    let markdown = parse_book(&markdown_path, WorkFormat::Markdown).unwrap();

    assert_eq!(text.chapters.len(), 1);
    assert!(text.chapters[0].html.contains("<p>First line.</p>"));
    assert!(markdown.chapters[0].html.contains("<h1>Chapter one</h1>"));
    assert!(markdown.chapters[0].html.contains("<em>quiet</em>"));
}

#[test]
fn epub_spine_order_defines_chapter_order() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("Moon.epub");
    let file = std::fs::File::create(&path).unwrap();
    let mut archive = zip::ZipWriter::new(file);
    let options = zip::write::SimpleFileOptions::default();
    archive.start_file("mimetype", options).unwrap();
    archive.write_all(b"application/epub+zip").unwrap();
    archive
        .start_file("META-INF/container.xml", options)
        .unwrap();
    archive.write_all(br#"<?xml version="1.0"?><container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>"#).unwrap();
    archive.start_file("OPS/book.opf", options).unwrap();
    archive.write_all(br#"<package><metadata><title>Moon</title></metadata><manifest><item id="second" href="second.xhtml" media-type="application/xhtml+xml"/><item id="first" href="first.xhtml" media-type="application/xhtml+xml"/></manifest><spine><itemref idref="first"/><itemref idref="second"/></spine></package>"#).unwrap();
    archive.start_file("OPS/first.xhtml", options).unwrap();
    archive
        .write_all(b"<html><body><h1>First</h1><p>One</p></body></html>")
        .unwrap();
    archive.start_file("OPS/second.xhtml", options).unwrap();
    archive
        .write_all(b"<html><body><h1>Second</h1><p>Two</p></body></html>")
        .unwrap();
    archive.finish().unwrap();

    let book = parse_book(&path, WorkFormat::Epub).unwrap();

    assert_eq!(book.title.as_deref(), Some("Moon"));
    assert_eq!(book.chapters.len(), 2);
    assert_eq!(book.chapters[0].title, "First");
    assert_eq!(book.chapters[1].title, "Second");
}
