use std::io::Write;

use mochi_reader_lib::{
    import::detect::{DetectedFormat, detect_format},
    manga::natural_sort::natural_cmp,
};
use zip::{ZipWriter, write::SimpleFileOptions};

#[test]
fn signature_wins_over_a_misleading_extension() {
    let mut file = tempfile::Builder::new().suffix(".txt").tempfile().unwrap();
    file.write_all(b"%PDF-1.7\nfixture").unwrap();

    assert_eq!(detect_format(file.path()).unwrap(), DetectedFormat::Pdf);
}

#[test]
fn zip_containers_distinguish_epub_from_cbz() {
    let epub = tempfile::Builder::new().suffix(".zip").tempfile().unwrap();
    let mut epub_writer = ZipWriter::new(epub.reopen().unwrap());
    epub_writer
        .start_file("mimetype", SimpleFileOptions::default())
        .unwrap();
    epub_writer.write_all(b"application/epub+zip").unwrap();
    epub_writer
        .start_file("META-INF/container.xml", SimpleFileOptions::default())
        .unwrap();
    epub_writer.write_all(b"<container />").unwrap();
    epub_writer.finish().unwrap();

    let cbz = tempfile::Builder::new().suffix(".cbz").tempfile().unwrap();
    let mut cbz_writer = ZipWriter::new(cbz.reopen().unwrap());
    cbz_writer
        .start_file("001.jpg", SimpleFileOptions::default())
        .unwrap();
    cbz_writer.write_all(&[0xff, 0xd8, 0xff, 0xd9]).unwrap();
    cbz_writer.finish().unwrap();

    assert_eq!(detect_format(epub.path()).unwrap(), DetectedFormat::Epub);
    assert_eq!(detect_format(cbz.path()).unwrap(), DetectedFormat::Cbz);
}

#[test]
fn manga_pages_sort_by_numeric_segments() {
    let mut names = vec!["10.jpg", "2.jpg", "1.jpg", "page3.jpg"];

    names.sort_by(|left, right| natural_cmp(left, right));

    assert_eq!(names, vec!["1.jpg", "2.jpg", "10.jpg", "page3.jpg"]);
}
