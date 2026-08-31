use mochi_reader_lib::sources::mangadex::{
    builtin_source, builtin_source_for, parse_chapters, parse_pages, parse_search,
};

const SEARCH_FIXTURE: &str = r#"{
  "result": "ok",
  "response": "collection",
  "data": [{
    "id": "manga-uuid",
    "type": "manga",
    "attributes": {
      "title": { "en": "Moon Letters", "ru": "Лунные письма" },
      "description": { "en": "English description", "ru": "Русское описание" }
    },
    "relationships": [{
      "id": "cover-uuid",
      "type": "cover_art",
      "attributes": { "fileName": "cover-file.jpg" }
    }]
  }],
  "limit": 20,
  "offset": 0,
  "total": 21
}"#;

const CHAPTER_FIXTURE: &str = r#"{
  "result": "ok",
  "response": "collection",
  "data": [{
    "id": "chapter-readable",
    "type": "chapter",
    "attributes": {
      "volume": "2",
      "chapter": "7",
      "title": "Тихий вечер",
      "translatedLanguage": "ru",
      "externalUrl": null
    },
    "relationships": [{
      "id": "group-uuid",
      "type": "scanlation_group",
      "attributes": { "name": "Moon Team" }
    }]
  }, {
    "id": "chapter-external",
    "type": "chapter",
    "attributes": {
      "volume": null,
      "chapter": "8",
      "title": null,
      "translatedLanguage": "en",
      "externalUrl": "https://publisher.example/chapter/8"
    },
    "relationships": []
  }],
  "limit": 100,
  "offset": 0,
  "total": 2
}"#;

const AT_HOME_FIXTURE: &str = r#"{
  "result": "ok",
  "baseUrl": "https://uploads.mangadex.org",
  "chapter": {
    "hash": "chapter-hash",
    "data": ["page-01.png"],
    "dataSaver": ["page-01.jpg"]
  }
}"#;

const CHAPTER_PAGE_FIXTURE: &str = r#"{
  "result": "ok",
  "response": "collection",
  "data": [],
  "limit": 100,
  "offset": 0,
  "total": 101
}"#;

const CHAPTER_FINAL_FIXTURE: &str = r#"{
  "result": "ok",
  "response": "collection",
  "data": [],
  "limit": 100,
  "offset": 100,
  "total": 101
}"#;

#[test]
fn mangadex_search_prefers_russian_text_and_builds_cover_url() {
    let page = parse_search(&builtin_source(), SEARCH_FIXTURE, 1).unwrap();

    assert_eq!(page.items[0].remote_id, "manga-uuid");
    assert_eq!(page.items[0].title, "Лунные письма");
    assert_eq!(page.items[0].summary.as_deref(), Some("Русское описание"));
    assert_eq!(
        page.items[0].cover_url.as_deref(),
        Some("https://uploads.mangadex.org/covers/manga-uuid/cover-file.jpg.256.jpg")
    );
    assert!(page.has_next_page);
}

#[test]
fn mangadex_chapters_skip_external_entries_and_credit_group() {
    let batch = parse_chapters(CHAPTER_FIXTURE).unwrap();

    assert_eq!(batch.items.len(), 1);
    assert_eq!(batch.items[0].remote_id, "chapter-readable");
    assert_eq!(batch.items[0].title, "Том 2 · Глава 7 · Тихий вечер · RU");
    assert_eq!(batch.items[0].attribution.as_deref(), Some("Moon Team"));
    assert_eq!(batch.total, 2);
}

#[test]
fn mangadex_pages_use_data_saver_and_reject_unknown_cdn() {
    let source = builtin_source();
    let pages = parse_pages(&source, AT_HOME_FIXTURE).unwrap();

    assert_eq!(
        pages[0].url,
        "https://uploads.mangadex.org/data-saver/chapter-hash/page-01.jpg"
    );
    assert!(
        parse_pages(
            &source,
            &AT_HOME_FIXTURE.replace("uploads.mangadex.org", "evil.example")
        )
        .is_err()
    );
}

#[test]
fn builtin_source_only_accepts_the_mangadex_identifier() {
    assert_eq!(builtin_source_for("mangadex").unwrap().name, "MangaDex");
    assert!(builtin_source_for("unknown").is_err());
}

#[test]
fn chapter_batch_reports_the_next_offset() {
    let batch = parse_chapters(CHAPTER_PAGE_FIXTURE).unwrap();
    assert_eq!(batch.next_offset(), Some(100));

    let final_batch = parse_chapters(CHAPTER_FINAL_FIXTURE).unwrap();
    assert_eq!(final_batch.next_offset(), None);
}
