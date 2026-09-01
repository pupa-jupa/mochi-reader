use mochi_reader_lib::sources::{
    model::{AdapterKind, RemoteContentKind},
    opds::{OpdsCatalogType, parse_catalog, validated_source},
};
use url::Url;

#[test]
fn parses_opds_2_catalog_preview_search_and_open_access_books() {
    let catalog_url = Url::parse("https://books.example/opds/v2").unwrap();
    let catalog = parse_catalog(
        r#"{
          "metadata": { "title": "Lunar Library", "numberOfItems": 12 },
          "links": [
            { "rel": "self", "href": "/opds/v2", "type": "application/opds+json" },
            { "rel": "search", "href": "/opds/search{?query}", "type": "application/opds+json", "templated": true }
          ],
          "publications": [{
            "metadata": {
              "title": "Moon Letters",
              "author": [{ "name": "Aki Snow" }],
              "identifier": "urn:isbn:9780000000001",
              "description": "Quiet letters from a lunar town."
            },
            "links": [
              { "rel": "download", "href": "/books/moon.epub", "type": "application/epub+zip" }
            ],
            "images": [
              { "href": "/covers/moon.jpg", "type": "image/jpeg" }
            ]
          }]
        }"#,
        "application/opds+json",
        &catalog_url,
    )
    .unwrap();

    assert_eq!(catalog.preview.name, "Lunar Library");
    assert_eq!(catalog.preview.catalog_type, OpdsCatalogType::Opds2);
    assert_eq!(catalog.preview.item_count, Some(12));
    assert_eq!(
        catalog.search_template.as_deref(),
        Some("https://books.example/opds/search{?query}")
    );
    assert!(!catalog.page.has_next_page);
    let book = &catalog.page.items[0];
    assert_eq!(book.content_kind, RemoteContentKind::Book);
    assert_eq!(book.remote_id, "urn:isbn:9780000000001");
    assert_eq!(book.title, "Moon Letters");
    assert_eq!(book.author.as_deref(), Some("Aki Snow"));
    assert_eq!(
        book.acquisition_url.as_deref(),
        Some("https://books.example/books/moon.epub")
    );
    assert_eq!(book.format.as_deref(), Some("epub"));
    assert_eq!(
        book.cover_url.as_deref(),
        Some("https://books.example/covers/moon.jpg")
    );

    let source = validated_source(Some("My books"), &catalog_url, &catalog).unwrap();
    assert_eq!(source.adapter_kind, AdapterKind::Opds);
    assert_eq!(source.name, "My books");
    assert_eq!(source.base_url, catalog_url.as_str());
    assert!(source.capabilities.search);
    assert!(source.capabilities.download);
}

#[test]
fn parses_opds_1_atom_catalog_and_rejects_cross_origin_acquisition() {
    let catalog_url = Url::parse("https://books.example/opds/root.xml").unwrap();
    let catalog = parse_catalog(
        r#"<?xml version="1.0" encoding="utf-8"?>
        <feed xmlns="http://www.w3.org/2005/Atom">
          <title>Classic Shelf</title>
          <link rel="self" href="/opds/root.xml" type="application/atom+xml;profile=opds-catalog" />
          <link rel="search" href="/opds/search?q={searchTerms}" type="application/atom+xml;profile=opds-catalog" />
          <entry>
            <id>urn:uuid:moon-book</id>
            <title>Moon Book</title>
            <author><name>Mochi Author</name></author>
            <summary>A small classic.</summary>
            <link rel="http://opds-spec.org/image/thumbnail" href="/covers/moon.png" type="image/png" />
            <link rel="http://opds-spec.org/acquisition/open-access" href="/books/moon.pdf" type="application/pdf" />
          </entry>
        </feed>"#,
        "application/atom+xml",
        &catalog_url,
    )
    .unwrap();

    assert_eq!(catalog.preview.catalog_type, OpdsCatalogType::Opds1);
    assert_eq!(catalog.preview.item_count, Some(1));
    assert_eq!(catalog.page.items[0].format.as_deref(), Some("pdf"));
    assert_eq!(
        catalog.page.items[0].author.as_deref(),
        Some("Mochi Author")
    );

    let unsafe_catalog = parse_catalog(
        r#"{
          "metadata": { "title": "Unsafe" },
          "links": [{ "rel": "self", "href": "/opds", "type": "application/opds+json" }],
          "publications": [{
            "metadata": { "title": "Trap", "identifier": "trap" },
            "links": [{ "rel": "download", "href": "https://evil.example/trap.epub", "type": "application/epub+zip" }]
          }]
        }"#,
        "application/opds+json",
        &Url::parse("https://books.example/opds").unwrap(),
    );
    assert!(unsafe_catalog.is_err());
}

#[test]
fn rejects_html_and_non_catalog_json_instead_of_guessing() {
    let url = Url::parse("https://books.example/opds").unwrap();
    assert!(parse_catalog("<html>login</html>", "text/html", &url).is_err());
    assert!(
        parse_catalog(
            r#"{"metadata":{"title":"Missing collections"}}"#,
            "application/json",
            &url
        )
        .is_err()
    );
}
