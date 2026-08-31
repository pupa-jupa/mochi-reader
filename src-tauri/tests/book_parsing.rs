use std::io::Write;

use mochi_reader_lib::{
    domain::error::AppError,
    domain::work::WorkFormat,
    parsers::{parse_book, sanitize_book_html},
};

fn fb2_document(encoding: &str) -> String {
    format!(
        r#"<?xml version="1.0" encoding="{encoding}"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"
             xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <genre>sf</genre>
      <author><first-name>Моти</first-name><last-name>Ридер</last-name></author>
      <book-title>Лунная книга</book-title>
      <annotation><p>Тёплая аннотация.</p></annotation>
      <lang>ru</lang>
    </title-info>
    <document-info>
      <author><nickname>fixture</nickname></author>
      <program-used>tests</program-used>
      <date value="2026-01-01">2026</date>
      <id>fixture-book</id>
      <version>1.0</version>
    </document-info>
  </description>
  <body>
    <section id="first">
      <title><p>Первая</p></title>
      <p>Тихий <emphasis>свет</emphasis>.</p>
    </section>
    <section id="second">
      <title><p>Вторая</p></title>
      <p>Луна рядом.</p>
    </section>
  </body>
</FictionBook>"#
    )
}

fn encode_utf16_le_with_bom(input: &str) -> Vec<u8> {
    let mut bytes = vec![0xff, 0xfe];
    for unit in input.encode_utf16() {
        bytes.extend_from_slice(&unit.to_le_bytes());
    }
    bytes
}

fn encode_utf16_be_with_bom(input: &str) -> Vec<u8> {
    let mut bytes = vec![0xfe, 0xff];
    for unit in input.encode_utf16() {
        bytes.extend_from_slice(&unit.to_be_bytes());
    }
    bytes
}

fn encode_windows_1251(input: &str) -> Vec<u8> {
    input
        .chars()
        .map(|character| match character {
            character if character.is_ascii() => character as u8,
            '\u{0401}' => 0xa8,
            '\u{0451}' => 0xb8,
            '\u{0410}'..='\u{042f}' => 0xc0 + (character as u32 - 0x0410) as u8,
            '\u{0430}'..='\u{044f}' => 0xe0 + (character as u32 - 0x0430) as u8,
            _ => panic!("fixture contains a character outside Windows-1251: {character}"),
        })
        .collect()
}

fn assert_fb2_book(path: &std::path::Path) {
    let book = parse_book(path, WorkFormat::Fb2).unwrap();

    assert_eq!(book.title.as_deref(), Some("Лунная книга"));
    assert_eq!(book.chapters.len(), 2);
    assert_eq!(book.chapters[0].title, "Первая");
    assert!(book.chapters[0].html.contains("Тихий <em>свет</em>."));
    assert_eq!(book.chapters[1].title, "Вторая");
    assert!(book.chapters[1].html.contains("Луна рядом."));
}

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

#[test]
fn fb2_supports_utf8_utf8_bom_utf16_and_windows_1251() {
    let directory = tempfile::tempdir().unwrap();
    let fixtures = [
        ("utf8.fb2", fb2_document("UTF-8").into_bytes()),
        (
            "utf8-bom.fb2",
            [vec![0xef, 0xbb, 0xbf], fb2_document("UTF-8").into_bytes()].concat(),
        ),
        (
            "utf16.fb2",
            encode_utf16_le_with_bom(&fb2_document("UTF-16")),
        ),
        (
            "utf16-be.fb2",
            encode_utf16_be_with_bom(&fb2_document("UTF-16BE")),
        ),
        (
            "windows-1251.fb2",
            encode_windows_1251(&fb2_document("windows-1251")),
        ),
        (
            "detected-windows-1251.fb2",
            encode_windows_1251(&fb2_document("UTF-8").replacen(" encoding=\"UTF-8\"", "", 1)),
        ),
    ];

    for (name, bytes) in fixtures {
        let path = directory.path().join(name);
        std::fs::write(&path, bytes).unwrap();
        assert_fb2_book(&path);
    }
}

#[test]
fn fb2_zip_extracts_the_book_before_parsing() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("Moon.fb2.zip");
    let file = std::fs::File::create(&path).unwrap();
    let mut archive = zip::ZipWriter::new(file);
    archive
        .start_file("Moon.fb2", zip::write::SimpleFileOptions::default())
        .unwrap();
    archive.write_all(fb2_document("UTF-8").as_bytes()).unwrap();
    archive.finish().unwrap();

    assert_fb2_book(&path);
}

#[test]
fn broken_fb2_reports_a_safe_line_number() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("broken.fb2");
    std::fs::write(
        &path,
        br#"<?xml version="1.0" encoding="UTF-8"?>
<FictionBook>
  <description></description>
  <body><section><p>broken</section></body>
</FictionBook>"#,
    )
    .unwrap();

    let error = parse_book(&path, WorkFormat::Fb2).unwrap_err();
    let AppError::Validation { message } = error else {
        panic!("expected a validation error");
    };

    assert!(message.contains("Не получилось открыть FB2"));
    assert!(message.contains("около строки"));
    assert!(!message.contains("quick_xml"));
    assert!(!message.contains("Expecting"));
}

#[test]
fn fb2_preserves_cover_annotation_links_and_footnotes() {
    let directory = tempfile::tempdir().unwrap();
    let path = directory.path().join("illustrated.fb2");
    let source = r##"<?xml version="1.0" encoding="UTF-8"?>
<FictionBook xmlns="http://www.gribuser.ru/xml/fictionbook/2.0"
             xmlns:l="http://www.w3.org/1999/xlink">
  <description>
    <title-info>
      <genre>sf</genre>
      <author><nickname>Mochi</nickname></author>
      <book-title>Иллюстрированная книга</book-title>
      <annotation><p>Аннотация для читателя.</p></annotation>
      <coverpage><image l:href="#cover" alt="Обложка"/></coverpage>
      <lang>ru</lang>
    </title-info>
    <document-info>
      <author><nickname>fixture</nickname></author>
      <date value="2026-01-01">2026</date>
      <id>illustrated-fixture</id>
      <version>1.0</version>
    </document-info>
  </description>
  <body>
    <section id="chapter">
      <title><p>Глава с примечанием</p></title>
      <p>Луна светит<a l:href="#note-1" type="note">[1]</a>.</p>
      <p><image l:href="#cover" alt="Тихая &quot;луна&quot;"/></p>
      <p><a l:href="javascript:alert(1)">Внешний текст</a></p>
    </section>
  </body>
  <body name="notes">
    <section id="note-1">
      <title><p>1</p></title>
      <p>Это текст примечания.</p>
    </section>
  </body>
  <binary id="cover" content-type="image/png">iVBORw0KGgo=</binary>
</FictionBook>"##;
    std::fs::write(&path, source).unwrap();

    let book = parse_book(&path, WorkFormat::Fb2).unwrap();
    let chapter = &book.chapters[0];

    assert_eq!(book.title.as_deref(), Some("Иллюстрированная книга"));
    assert!(chapter.html.contains("Аннотация для читателя."));
    assert!(chapter.html.contains("data:image/png;base64,"));
    assert!(chapter.html.contains("alt=\"Тихая &quot;луна&quot;\""));
    assert!(chapter.html.contains("href=\"#fb2-note-1\""));
    assert!(chapter.html.contains("fb2-footnotes"));
    assert!(chapter.html.contains("Это текст примечания."));
    assert!(chapter.html.contains("Внешний текст"));
    assert!(!chapter.html.contains("javascript:"));
}
