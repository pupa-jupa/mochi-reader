# MangaDex Adapter Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить встроенный источник MangaDex, подключаемый одной кнопкой и читающий русские и английские главы через официальный API.

**Architecture:** Новый `AdapterKind::Mangadex` хранится в существующей таблице sources и использует тот же `SourceHttpClient`, cache manager и standard manga reader. Отдельный модуль `sources/mangadex.rs` владеет built-in config, URL builders, serde response types и чистыми преобразованиями; `service.rs` только выполняет HTTP и dispatch.

**Tech Stack:** Rust 1.88+, Tauri 2, reqwest, serde, rusqlite/SQLite, React 19, TypeScript 6, Vitest/Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-31-mangadex-adapter-design.md`

## Global Constraints

- Использовать только официальный гостевой API `https://api.mangadex.org`; не хранить credentials, cookies или API keys.
- Языки по умолчанию: `ru`, `en`; content ratings: `safe`, `suggestive`.
- Постоянный offline download отключён; временный cache остаётся включён.
- Показывать MangaDex attribution и scanlation group attribution.
- Все production changes реализуются через RED → GREEN → REFACTOR.
- Сохранить SSRF, DNS pinning, proxy disable, timeout, redirect, MIME и byte limits существующего `SourceHttpClient`.
- Не изменять и не добавлять в Git пользовательский файл `Mochi Reader_0.1.0_x64-setup.exe` в корне workspace.

---

### Task 1: Persist the MangaDex adapter kind safely

**Files:**
- Create: `src-tauri/migrations/0005_mangadex_adapter.sql`
- Modify: `src-tauri/src/database/migrations.rs`
- Modify: `src-tauri/src/sources/model.rs`
- Modify: `src-tauri/src/database/source_repository.rs`
- Modify: `src-tauri/tests/source_core.rs`

**Interfaces:**
- Produces: `AdapterKind::Mangadex`, serialized as `"mangadex"`.
- Produces: schema version 5 accepting `manifest`, `generic_html`, and `mangadex` while preserving sources and cache rows.
- Consumes: existing `SourceRepository::upsert`, `list`, and `get_stored` APIs unchanged.

- [ ] **Step 1: Write the failing migration/model test**

Add a test that catches a missing enum branch, a broken CHECK migration, or duplicate built-in rows:

```rust
#[test]
fn mangadex_source_kind_survives_migration_and_upserts_idempotently() {
    let connection = Connection::open_in_memory().unwrap();
    migrate(&connection).unwrap();
    let source = ValidatedSource {
        name: "MangaDex".to_string(),
        base_url: "https://api.mangadex.org/".to_string(),
        adapter_kind: AdapterKind::Mangadex,
        config: serde_json::json!({"schemaVersion": 1}),
        capabilities: SourceCapabilities { search: true, download: false },
    };
    let repository = SourceRepository::new(&connection);
    let first = repository.upsert(&source).unwrap();
    let second = repository.upsert(&source).unwrap();

    assert_eq!(first, second);
    assert_eq!(repository.list().unwrap().len(), 1);
    assert_eq!(repository.get(&first).unwrap().adapter_kind, AdapterKind::Mangadex);
    assert_eq!(
        connection.query_row("SELECT MAX(version) FROM schema_migrations", [], |row| row.get::<_, i64>(0)).unwrap(),
        5,
    );
}
```

- [ ] **Step 2: Run the focused test and verify RED**

Run: `cargo test --test source_core mangadex_source_kind_survives_migration_and_upserts_idempotently`

Expected: compilation fails because `AdapterKind::Mangadex` does not exist.

- [ ] **Step 3: Add the enum, parser branch, and migration**

Extend the enum and stable DB string:

```rust
pub enum AdapterKind {
    Manifest,
    GenericHtml,
    Mangadex,
}

match self {
    Self::Manifest => "manifest",
    Self::GenericHtml => "generic_html",
    Self::Mangadex => "mangadex",
}
```

Parse all known database values explicitly and return `Manifest` only for legacy/unknown rows to preserve the current non-fallible mapper:

```rust
match value {
    "generic_html" => AdapterKind::GenericHtml,
    "mangadex" => AdapterKind::Mangadex,
    _ => AdapterKind::Manifest,
}
```

Create migration 0005 with this transaction shape so foreign-key rows are copied and rebound to the new table:

```sql
PRAGMA foreign_keys = OFF;
BEGIN IMMEDIATE;
ALTER TABLE source_cache_entries RENAME TO source_cache_entries_v4;
ALTER TABLE sources RENAME TO sources_v4;
CREATE TABLE sources (
    id TEXT PRIMARY KEY NOT NULL,
    name TEXT NOT NULL CHECK(length(trim(name)) > 0),
    base_url TEXT NOT NULL,
    adapter_kind TEXT NOT NULL CHECK(adapter_kind IN ('manifest', 'generic_html', 'mangadex')),
    enabled INTEGER NOT NULL DEFAULT 1 CHECK(enabled IN (0, 1)),
    config_json TEXT NOT NULL,
    supports_search INTEGER NOT NULL DEFAULT 1 CHECK(supports_search IN (0, 1)),
    supports_download INTEGER NOT NULL DEFAULT 0 CHECK(supports_download IN (0, 1)),
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    UNIQUE(base_url, adapter_kind)
);
INSERT INTO sources SELECT * FROM sources_v4;
CREATE TABLE source_cache_entries (
    cache_key TEXT PRIMARY KEY NOT NULL,
    source_id TEXT NOT NULL REFERENCES sources(id) ON DELETE CASCADE,
    page_url TEXT NOT NULL,
    file_name TEXT NOT NULL,
    media_type TEXT NOT NULL,
    size_bytes INTEGER NOT NULL CHECK(size_bytes >= 0),
    pinned INTEGER NOT NULL DEFAULT 0 CHECK(pinned IN (0, 1)),
    created_at TEXT NOT NULL,
    last_accessed_at TEXT NOT NULL,
    UNIQUE(source_id, page_url)
);
INSERT INTO source_cache_entries SELECT * FROM source_cache_entries_v4;
DROP TABLE source_cache_entries_v4;
DROP TABLE sources_v4;
CREATE INDEX sources_enabled_idx ON sources(enabled, name);
CREATE INDEX source_cache_lru_idx ON source_cache_entries(pinned, last_accessed_at);
CREATE INDEX source_cache_source_idx ON source_cache_entries(source_id);
INSERT OR IGNORE INTO schema_migrations(version, applied_at)
VALUES (5, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));
COMMIT;
PRAGMA foreign_keys = ON;
```

Include and run migration 0005 when `version < 5`.

- [ ] **Step 4: Verify GREEN and migration integrity**

Run: `cargo test --test source_core mangadex_source_kind_survives_migration_and_upserts_idempotently`

Run: `cargo test --test cache --test database --test source_core`

Expected: all selected tests pass and cached rows remain queryable.

- [ ] **Step 5: Commit Task 1**

```powershell
git add src-tauri/migrations/0005_mangadex_adapter.sql src-tauri/src/database/migrations.rs src-tauri/src/sources/model.rs src-tauri/src/database/source_repository.rs src-tauri/tests/source_core.rs
git commit -m "feat: persist MangaDex source kind"
```

---

### Task 2: Parse MangaDex catalog, chapters, and MangaDex@Home responses

**Files:**
- Create: `src-tauri/src/sources/mangadex.rs`
- Modify: `src-tauri/src/sources/mod.rs`
- Modify: `src-tauri/src/sources/model.rs`
- Create: `src-tauri/tests/mangadex_adapter.rs`

**Interfaces:**
- Produces: `mangadex::builtin_source() -> ValidatedSource`.
- Produces: `mangadex::search_url(&ValidatedSource, &str, u32) -> AppResult<Url>`.
- Produces: `mangadex::chapter_url(&ValidatedSource, &str, usize) -> AppResult<Url>`.
- Produces: `mangadex::at_home_url(&ValidatedSource, &str) -> AppResult<Url>`.
- Produces: `mangadex::parse_search(&ValidatedSource, &str, u32) -> AppResult<RemoteSearchPage>`.
- Produces: `mangadex::parse_chapters(&str) -> AppResult<ChapterBatch>` where `ChapterBatch { items, offset, limit, total }`.
- Produces: `mangadex::parse_pages(&ValidatedSource, &str) -> AppResult<Vec<RemotePage>>`.
- Extends: `RemoteChapter` with `attribution: Option<String>`; non-MangaDex adapters set it to `None`.

- [ ] **Step 1: Write failing parser contract tests with literal fixtures**

Create tests whose hand-derived expectations catch wrong locale precedence, cover URLs, external chapter leakage, missing attribution, and wrong data-saver paths:

```rust
#[test]
fn mangadex_search_prefers_russian_text_and_builds_cover_url() {
    let source = builtin_source();
    let page = parse_search(&source, SEARCH_FIXTURE, 1).unwrap();
    assert_eq!(page.items[0].remote_id, "manga-uuid");
    assert_eq!(page.items[0].title, "Лунные письма");
    assert_eq!(page.items[0].summary.as_deref(), Some("Русское описание"));
    assert_eq!(
        page.items[0].cover_url.as_deref(),
        Some("https://uploads.mangadex.org/covers/manga-uuid/cover-file.jpg.256.jpg"),
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
        "https://uploads.mangadex.org/data-saver/chapter-hash/page-01.jpg",
    );
    assert!(parse_pages(&source, &AT_HOME_FIXTURE.replace("uploads.mangadex.org", "evil.example")).is_err());
}
```

Fixtures must include all MangaDex fields read by production: response/result, data IDs/types/attributes, localized maps, relationships, pagination, externalUrl, translatedLanguage, chapter hash, `data`, and `dataSaver`.

- [ ] **Step 2: Run parser tests and verify RED**

Run: `cargo test --test mangadex_adapter`

Expected: compilation fails because module/functions and `RemoteChapter.attribution` do not exist.

- [ ] **Step 3: Implement built-in config and URL builders**

Use a denied-unknown-fields config:

```rust
#[derive(Debug, Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase", deny_unknown_fields)]
pub struct MangadexConfig {
    schema_version: u32,
    languages: Vec<String>,
    content_ratings: Vec<String>,
    data_saver: bool,
    image_origins: Vec<String>,
}
```

`builtin_source()` must return `AdapterKind::Mangadex`, base URL `https://api.mangadex.org/`, and config values `ru/en`, `safe/suggestive`, `dataSaver: true`, and `https://uploads.mangadex.org`.

URL builders use `url::Url::query_pairs_mut()` rather than string concatenation. Search offset is `(page - 1) * 20`; chapter offset is passed explicitly with limit 100.

- [ ] **Step 4: Implement serde response types and pure transformations**

Implement locale selection with this exact order:

```rust
fn localized(values: &HashMap<String, String>) -> Option<String> {
    ["ru", "en", "ja-ro"]
        .into_iter()
        .find_map(|key| values.get(key).filter(|value| !value.trim().is_empty()))
        .or_else(|| values.values().find(|value| !value.trim().is_empty()))
        .map(|value| value.trim().to_string())
}
```

`parse_chapters` excludes entries where `externalUrl` is non-empty and composes title only from present values. Group names come from relationships with `type == "scanlation_group"`; unique names are joined with `, `.

`parse_pages` selects `dataSaver` when config enables it and it is non-empty, otherwise `data`. Reject an empty hash, more than 2 000 filenames, filenames containing `/`, `\\`, `.` or `..` as complete path components, and any base URL outside configured image origins. Build URLs using `Url::path_segments_mut()`.

- [ ] **Step 5: Verify GREEN and update existing adapter constructors**

Set `attribution: None` in manifest and HTML chapter parsers.

Run: `cargo test --test mangadex_adapter --test source_core`

Expected: all tests pass.

- [ ] **Step 6: Commit Task 2**

```powershell
git add src-tauri/src/sources/mangadex.rs src-tauri/src/sources/mod.rs src-tauri/src/sources/model.rs src-tauri/src/sources/adapter.rs src-tauri/tests/mangadex_adapter.rs
git commit -m "feat: parse MangaDex API responses"
```

---

### Task 3: Connect MangaDex to commands and the HTTP service

**Files:**
- Modify: `src-tauri/src/sources/service.rs`
- Modify: `src-tauri/src/sources/http_client.rs`
- Modify: `src-tauri/src/commands/sources.rs`
- Modify: `src-tauri/src/lib.rs`
- Modify: `src-tauri/tests/mangadex_adapter.rs`

**Interfaces:**
- Produces command: `add_builtin_source(state, kind: String) -> AppResult<SourceConfig>`.
- Reuses commands: `search_source`, `get_source_chapters`, `get_source_pages`, and `get_source_page` unchanged.
- Consumes Task 2 URL builders and parsers.

- [ ] **Step 1: Write failing tests for built-in validation and pagination decisions**

Add pure behavior tests:

```rust
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
```

The mutation caught is accepting arbitrary built-in identifiers or stopping chapter pagination after the first 100 results.

- [ ] **Step 2: Run focused tests and verify RED**

Run: `cargo test --test mangadex_adapter builtin_source_only_accepts_the_mangadex_identifier chapter_batch_reports_the_next_offset`

Expected: compilation fails because `builtin_source_for` and `next_offset` do not exist.

- [ ] **Step 3: Implement validated built-in source selection**

```rust
pub fn builtin_source_for(kind: &str) -> AppResult<ValidatedSource> {
    match kind {
        "mangadex" => Ok(builtin_source()),
        _ => Err(validation("Неизвестный встроенный источник.")),
    }
}
```

The command upserts this value synchronously through `SourceRepository` and returns the stored row. Register it in Tauri's invoke handler.

- [ ] **Step 4: Add `AdapterKind::Mangadex` dispatch**

In `search_source`, build a MangaDex search URL, fetch JSON with the existing 4 MiB catalog limit, then call `mangadex::parse_search`.

In `load_chapters`, create one `SourceHttpClient`, loop from offset 0 while `ChapterBatch::next_offset()` returns a value and total collected is under 5 000, and append readable chapters. Stop if a batch returns no data to prevent an infinite loop.

In `load_pages`, fetch `GET /at-home/server/{chapterId}` as JSON and call `mangadex::parse_pages`.

Existing manifest/HTML branches remain behaviorally unchanged. `ensure_download_allowed` continues to reject MangaDex because built-in capability is false.

- [ ] **Step 5: Improve rate-limit errors without automatic retries**

In `SourceHttpClient::get`, handle status 429 before the generic status branch:

```rust
if response.status() == reqwest::StatusCode::TOO_MANY_REQUESTS {
    return Err(validation("MangaDex временно ограничил частоту запросов. Подожди немного и повтори."));
}
```

Do not retry automatically and do not bypass server limits.

- [ ] **Step 6: Verify GREEN and existing service contracts**

Run: `cargo test --test mangadex_adapter --test source_core --test cache`

Run: `cargo check --all-targets --all-features`

Expected: selected tests and compile checks pass.

- [ ] **Step 7: Commit Task 3**

```powershell
git add src-tauri/src/sources/service.rs src-tauri/src/sources/http_client.rs src-tauri/src/commands/sources.rs src-tauri/src/lib.rs src-tauri/tests/mangadex_adapter.rs
git commit -m "feat: connect MangaDex API service"
```

---

### Task 4: Add one-click MangaDex connection and attribution to the UI

**Files:**
- Modify: `src/types/sources.ts`
- Modify: `src/app/bridge.ts`
- Modify: `src/app/bridge.test.ts`
- Modify: `src/features/sources/SourcesPage.tsx`
- Modify: `src/features/sources/SourcesPage.test.tsx`
- Modify: `src/features/sources/SourceCatalogPage.tsx`
- Modify: `src/features/sources/SourceCatalogPage.test.tsx`
- Modify: `src/features/sources/RemoteMangaDetailsPage.tsx`
- Modify: `src/features/sources/RemoteMangaDetailsPage.test.tsx`
- Modify: `src/styles/index.css`

**Interfaces:**
- Extends: `SourceAdapterKind = 'manifest' | 'generic_html' | 'mangadex'`.
- Extends: `RemoteChapter` with `attribution: string | null`.
- Produces: `DesktopBridge.addBuiltInSource(kind: 'mangadex'): Promise<SourceConfig>`.

- [ ] **Step 1: Write failing bridge and page tests**

Bridge test:

```typescript
it('connects the built-in MangaDex source', async () => {
  const invoke = vi.fn().mockResolvedValue(sourceFixture);
  await createDesktopBridge(invoke).addBuiltInSource('mangadex');
  expect(invoke).toHaveBeenCalledWith('add_builtin_source', { kind: 'mangadex' });
});
```

Sources page behavior test:

```typescript
it('connects MangaDex once and labels the API adapter', async () => {
  const bridge = mangaDexBridge([]);
  render(<MemoryRouter><SourcesPage bridge={bridge} /></MemoryRouter>);
  fireEvent.click(await screen.findByRole('button', { name: 'Подключить MangaDex' }));
  expect(await screen.findByRole('heading', { name: 'MangaDex' })).toBeVisible();
  expect(screen.getByText('MangaDex API')).toBeVisible();
  expect(screen.getAllByRole('heading', { name: 'MangaDex' })).toHaveLength(1);
});
```

Details page test fixture includes `attribution: 'Moon Team'` and asserts visible text `Перевод: Moon Team`.

- [ ] **Step 2: Run frontend tests and verify RED**

Run: `pnpm vitest run src/app/bridge.test.ts src/features/sources/SourcesPage.test.tsx src/features/sources/RemoteMangaDetailsPage.test.tsx`

Expected: TypeScript/test failures because the bridge method, button, adapter kind, and attribution UI do not exist.

- [ ] **Step 3: Extend the frontend contract and bridge**

```typescript
export type SourceAdapterKind = 'manifest' | 'generic_html' | 'mangadex';

export interface RemoteChapter {
  remoteId: string;
  title: string;
  url: string;
  attribution: string | null;
}
```

Add `addBuiltInSource(kind: 'mangadex')` to the bridge interface and implementation, invoking `add_builtin_source` with `{ kind }`.

- [ ] **Step 4: Implement the one-click UI**

Add a dedicated button using the existing `Button` component. While the request is active, disable all add actions and show a spinner. On success, reuse `upsertSource`; on error, show `Не удалось подключить MangaDex.` or native `userMessage`.

Adapter labels use an explicit helper:

```typescript
function adapterLabel(kind: SourceAdapterKind) {
  if (kind === 'mangadex') return 'MangaDex API';
  if (kind === 'manifest') return 'Manifest adapter';
  return 'HTML profile';
}
```

Disable or replace the connect button with `MangaDex подключён` when `sources.some(source => source.adapterKind === 'mangadex')`.

- [ ] **Step 5: Render required attribution**

In the catalog header, render `Данные и изображения: MangaDex` only for a MangaDex source. In the details hero, identify the selected source from `listSources()` and render the same attribution. In each chapter row, render `<small>Перевод: {chapter.attribution}</small>` when attribution is non-null; otherwise preserve `Открыть в Manga Reader`.

- [ ] **Step 6: Verify GREEN and frontend regressions**

Run: `pnpm vitest run src/app/bridge.test.ts src/features/sources/SourcesPage.test.tsx src/features/sources/SourceCatalogPage.test.tsx src/features/sources/RemoteMangaDetailsPage.test.tsx`

Run: `pnpm lint`

Expected: tests and ESLint pass.

- [ ] **Step 7: Commit Task 4**

```powershell
git add src/types/sources.ts src/app/bridge.ts src/app/bridge.test.ts src/features/sources/SourcesPage.tsx src/features/sources/SourcesPage.test.tsx src/features/sources/SourceCatalogPage.tsx src/features/sources/SourceCatalogPage.test.tsx src/features/sources/RemoteMangaDetailsPage.tsx src/features/sources/RemoteMangaDetailsPage.test.tsx src/styles/index.css
git commit -m "feat: add one-click MangaDex source UI"
```

---

### Task 5: Validate the live API boundary and document the integration

**Files:**
- Modify: `README.md`
- Modify: `docs/manga-source-adapters.md`
- Modify: `docs/privacy-and-security.md`

**Interfaces:**
- Documents the built-in adapter, languages, content ratings, guest limits, attribution, and disabled offline downloads.
- Does not change runtime interfaces.

- [ ] **Step 1: Run a minimal live API smoke test**

Use the installed app's Rust path indirectly after focused tests, or make these three read-only requests with a single known-safe search result:

```text
GET https://api.mangadex.org/manga?title=witch&limit=1&includes[]=cover_art&contentRating[]=safe
GET https://api.mangadex.org/chapter?manga={returned-id}&limit=1&translatedLanguage[]=en&includes[]=scanlation_group
GET https://api.mangadex.org/at-home/server/{returned-readable-chapter-id}
```

Verify status 200, JSON content type, expected top-level fields, and that the returned page base URL is accepted by the allowlist. Do not bulk-download pages during this smoke test.

- [ ] **Step 2: Update documentation**

README feature list states MangaDex is built-in and connects from «Источники». Adapter docs describe the native third adapter kind separately from manifest and HTML. Privacy docs state no login/token is collected and include the attribution/removal-policy obligations.

- [ ] **Step 3: Run complete verification**

Run in project root:

```powershell
pnpm lint
pnpm test
pnpm build
```

Run in `src-tauri`:

```powershell
cargo fmt --check
cargo clippy --all-targets --all-features -- -D warnings
cargo test --all-features
```

Expected: every command exits 0 with zero failed tests.

- [ ] **Step 4: Build and hash the updated Windows installer**

Run:

```powershell
pnpm tauri build --bundles nsis
Get-FileHash -Algorithm SHA256 -LiteralPath 'src-tauri\target\release\bundle\nsis\Mochi Reader_0.1.0_x64-setup.exe'
```

Expected: NSIS build exits 0 and produces a SHA-256 hash for the installer.

- [ ] **Step 5: Commit docs and report the artifact**

```powershell
git add README.md docs/manga-source-adapters.md docs/privacy-and-security.md
git commit -m "docs: explain built-in MangaDex integration"
```

Report installer absolute path, hash, test counts, guest/no-login behavior, Russian/English filtering, and the unchanged limitation that the executable is unsigned.
