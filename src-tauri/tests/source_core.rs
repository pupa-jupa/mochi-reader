use mochi_reader_lib::{
    database::{migrations::migrate, source_repository::SourceRepository},
    sources::{
        adapter::{
            parse_html_chapters, parse_html_pages, parse_html_search, parse_manifest_chapters,
            parse_manifest_pages, parse_manifest_search,
        },
        html_profile::validate_html_profile,
        http_policy::HttpPolicy,
        manifest::validate_manifest,
        service::ensure_download_allowed,
    },
};
use rusqlite::Connection;
use url::Url;

#[test]
fn http_policy_requires_https_and_keeps_requests_on_the_source_origin() {
    assert!(HttpPolicy::for_source("http://manga.example").is_err());
    let policy = HttpPolicy::for_source("https://manga.example/catalog").unwrap();

    assert!(
        policy
            .ensure_allowed(&Url::parse("https://manga.example/api/search").unwrap())
            .is_ok()
    );
    assert!(
        policy
            .ensure_allowed(&Url::parse("https://cdn.example/page.jpg").unwrap())
            .is_err()
    );
    assert!(
        policy
            .ensure_allowed(&Url::parse("javascript:alert(1)").unwrap())
            .is_err()
    );
}

#[test]
fn manifest_validation_rejects_cross_origin_endpoint_templates() {
    let base = Url::parse("https://manga.example").unwrap();
    let valid = r#"{
      "schemaVersion": 1,
      "name": "Example Manga",
      "endpoints": {
        "search": "/api/search?q={query}&page={page}",
        "manga": "/api/manga/{id}",
        "chapters": "/api/manga/{id}/chapters",
        "pages": "/api/chapter/{id}/pages"
      },
      "capabilities": { "download": false }
    }"#;
    let invalid = valid.replace("/api/chapter/{id}/pages", "https://evil.example/pages/{id}");

    assert!(validate_manifest(valid, &base).is_ok());
    assert!(validate_manifest(&invalid, &base).is_err());
}

#[test]
fn declarative_html_profiles_cannot_contain_javascript_and_are_persistent() {
    let profile = r#"{
      "schemaVersion": 1,
      "name": "Panels",
      "baseUrl": "https://panels.example",
      "searchPath": "/search?q={query}&page={page}",
      "selectors": {
        "searchItems": ".result",
        "title": ".title",
        "mangaUrl": "a@href",
        "chapterItems": ".chapter",
        "chapterUrl": "a@href",
        "pageImages": ".reader img@src"
      },
      "allowDownload": false
    }"#;
    let unsafe_profile = profile.replace(".title", "javascript:alert(1)");
    assert!(validate_html_profile(&unsafe_profile).is_err());

    let validated = validate_html_profile(profile).unwrap();
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let repository = SourceRepository::new(&connection);
    let id = repository.upsert(&validated).unwrap();
    let sources = SourceRepository::new(&connection).list().unwrap();

    assert_eq!(sources.len(), 1);
    assert_eq!(sources[0].id, id);
    assert_eq!(sources[0].name, "Panels");
    assert_eq!(sources[0].adapter_kind.as_str(), "generic_html");
    let version: i64 = connection
        .query_row("SELECT MAX(version) FROM schema_migrations", [], |row| {
            row.get(0)
        })
        .unwrap();
    assert_eq!(version, 4);
}

#[test]
fn both_adapter_kinds_produce_the_same_remote_search_model() {
    let base = Url::parse("https://manga.example").unwrap();
    let manifest = r#"{
      "schemaVersion": 1,
      "name": "Manifest Panels",
      "endpoints": {
        "search": "/api/search?q={query}&page={page}",
        "manga": "/api/manga/{id}",
        "chapters": "/api/manga/{id}/chapters",
        "pages": "/api/chapter/{id}/pages"
      }
    }"#;
    let manifest_source = validate_manifest(manifest, &base).unwrap();
    let manifest_response = r#"{
      "items": [{
        "id": "moon",
        "title": "Moon Panels",
        "url": "/manga/moon",
        "coverUrl": "/covers/moon.jpg"
      }],
      "hasNextPage": false
    }"#;
    let manifest_page = parse_manifest_search(&manifest_source, manifest_response).unwrap();
    assert_eq!(manifest_page.items[0].title, "Moon Panels");
    assert_eq!(
        manifest_page.items[0].url,
        "https://manga.example/manga/moon"
    );

    let profile = r#"{
      "schemaVersion": 1,
      "name": "HTML Panels",
      "baseUrl": "https://manga.example",
      "searchPath": "/search?q={query}&page={page}",
      "selectors": {
        "searchItems": ".result",
        "title": ".title",
        "mangaUrl": "a@href",
        "cover": "img@src",
        "chapterItems": ".chapter",
        "chapterUrl": "a@href",
        "pageImages": ".reader img@src"
      }
    }"#;
    let profile_source = validate_html_profile(profile).unwrap();
    let html = r#"<article class="result"><a href="/manga/moon"><span class="title">Moon Panels</span><img src="/covers/moon.jpg"></a></article>"#;
    let html_page = parse_html_search(&profile_source, html).unwrap();
    assert_eq!(html_page.items[0].title, "Moon Panels");
    assert_eq!(
        html_page.items[0].cover_url.as_deref(),
        Some("https://manga.example/covers/moon.jpg")
    );
}

#[test]
fn manifest_adapter_normalizes_chapters_and_pages() {
    let base = Url::parse("https://manga.example").unwrap();
    let source = validate_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "Manifest Panels",
          "endpoints": {
            "search": "/api/search?q={query}&page={page}",
            "manga": "/api/manga/{id}",
            "chapters": "/api/manga/{id}/chapters",
            "pages": "/api/chapter/{id}/pages"
          }
        }"#,
        &base,
    )
    .unwrap();

    let chapters = parse_manifest_chapters(
        &source,
        r#"{"items":[{"id":"ch-1","title":"Chapter 1","url":"/chapter/ch-1"}]}"#,
    )
    .unwrap();
    let pages = parse_manifest_pages(
        &source,
        r#"{"pages":[{"url":"/pages/001.webp","label":"Cover"},{"url":"/pages/002.webp"}]}"#,
    )
    .unwrap();

    assert_eq!(chapters[0].remote_id, "ch-1");
    assert_eq!(chapters[0].url, "https://manga.example/chapter/ch-1");
    assert_eq!(pages[0].label, "Cover");
    assert_eq!(pages[1].index, 1);
    assert_eq!(pages[1].url, "https://manga.example/pages/002.webp");
}

#[test]
fn html_adapter_normalizes_chapters_and_page_images() {
    let source = validate_html_profile(
        r#"{
          "schemaVersion": 1,
          "name": "HTML Panels",
          "baseUrl": "https://manga.example",
          "searchPath": "/search?q={query}&page={page}",
          "selectors": {
            "searchItems": ".result",
            "title": ".title",
            "mangaUrl": "a@href",
            "chapterItems": ".chapter",
            "chapterTitle": ".chapter-name",
            "chapterUrl": "a@href",
            "pageImages": ".reader img@data-src"
          }
        }"#,
    )
    .unwrap();

    let chapters = parse_html_chapters(
        &source,
        r#"<ol><li class="chapter"><a href="/chapter/2"><span class="chapter-name">Chapter 2</span></a></li></ol>"#,
    )
    .unwrap();
    let pages = parse_html_pages(
        &source,
        r#"<main class="reader"><img data-src="/pages/2-01.jpg"><img data-src="/pages/2-02.jpg"></main>"#,
    )
    .unwrap();

    assert_eq!(chapters[0].title, "Chapter 2");
    assert_eq!(chapters[0].remote_id, "https://manga.example/chapter/2");
    assert_eq!(pages.len(), 2);
    assert_eq!(pages[0].label, "2-01.jpg");
}

#[test]
fn offline_download_requires_an_explicit_source_capability() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let base = Url::parse("https://manga.example").unwrap();
    let manifest = r#"{
      "schemaVersion": 1,
      "name": "Read only source",
      "endpoints": {
        "search": "/search?q={query}&page={page}",
        "manga": "/manga/{id}",
        "chapters": "/manga/{id}/chapters",
        "pages": "/chapter/{id}/pages"
      },
      "capabilities": { "download": false }
    }"#;
    let source = validate_manifest(manifest, &base).unwrap();
    let id = SourceRepository::new(&connection).upsert(&source).unwrap();
    let stored = SourceRepository::new(&connection).get_stored(&id).unwrap();

    assert!(ensure_download_allowed(&stored).is_err());

    let allowed = validate_manifest(&manifest.replace("false", "true"), &base).unwrap();
    SourceRepository::new(&connection).upsert(&allowed).unwrap();
    let stored = SourceRepository::new(&connection).get_stored(&id).unwrap();
    assert!(ensure_download_allowed(&stored).is_ok());
}

#[test]
fn image_cdn_must_be_declared_explicitly() {
    let base = Url::parse("https://manga.example").unwrap();
    let manifest = r#"{
      "schemaVersion": 1,
      "name": "CDN source",
      "imageOrigins": ["https://cdn.manga.example"],
      "endpoints": {
        "search": "/search?q={query}&page={page}",
        "manga": "/manga/{id}",
        "chapters": "/manga/{id}/chapters",
        "pages": "/chapter/{id}/pages"
      }
    }"#;
    let allowed = validate_manifest(manifest, &base).unwrap();
    let pages = parse_manifest_pages(
        &allowed,
        r#"{"pages":[{"url":"https://cdn.manga.example/chapter/001.webp"}]}"#,
    )
    .unwrap();
    assert_eq!(pages[0].url, "https://cdn.manga.example/chapter/001.webp");

    let blocked = validate_manifest(
        r#"{
          "schemaVersion": 1,
          "name": "No CDN source",
          "endpoints": {
            "search": "/search?q={query}&page={page}",
            "manga": "/manga/{id}",
            "chapters": "/manga/{id}/chapters",
            "pages": "/chapter/{id}/pages"
          }
        }"#,
        &base,
    )
    .unwrap();
    assert!(
        parse_manifest_pages(
            &blocked,
            r#"{"pages":[{"url":"https://cdn.manga.example/chapter/001.webp"}]}"#,
        )
        .is_err()
    );
}
