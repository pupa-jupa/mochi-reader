# Mochi Reader Sources and Cache Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Добавить безопасную расширяемую систему онлайн-источников, каталог, чтение глав, disk cache и разрешённое offline-скачивание.

**Architecture:** Rust adapter registry выбирает manifest или Generic HTML adapter. Все HTTP-запросы проходят единую policy layer; reader получает онлайн-страницы через тот же content protocol, что локальную мангу.

**Tech Stack:** Rust, reqwest, scraper, jsonschema, url, tokio, SQLite, React, Zustand, Vitest.

**Spec:** `docs/superpowers/specs/2026-08-30-mochi-reader-design.md`

## Global Constraints

- Нет обхода DRM, paywall, CAPTCHA, login и ограничений доступа.
- Нет исполнения JavaScript из manifest/профиля/страницы.
- HTTPS используется по умолчанию; redirects и subresources остаются в разрешённом origin set.
- Offline download доступен только при `allow_download: true`.
- Cache writes атомарны; LRU не удаляет pinned/active entries.
- Все новые production-функции проходят RED → GREEN → REFACTOR.

---

### Task 1: Adapter contract, HTTP policy and manifest adapter

**Files:**
- Create: `src-tauri/src/sources/mod.rs`, `src-tauri/src/sources/adapter.rs`, `src-tauri/src/sources/model.rs`, `src-tauri/src/sources/http_policy.rs`, `src-tauri/src/sources/manifest.rs`, `src-tauri/src/sources/registry.rs`
- Create: `src-tauri/src/database/source_repository.rs`, `src-tauri/src/commands/sources.rs`
- Create: `src-tauri/src/sources/schema/mochi-reader-source.schema.json`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `MangaSourceAdapter` trait from spec, `SourceDescriptor`, `SourceConfig`, `RemoteManga`, `RemoteChapter`, `RemotePage`, `probe_source`, `add_source`, `list_sources`, `set_source_enabled`, `remove_source`.

- [ ] **Step 1: Write failing URL-policy tests**

```rust
#[test]
fn blocks_cross_origin_redirects_and_private_network_targets() {
    let policy = HttpPolicy::for_source("https://manga.example").unwrap();
    assert!(policy.validate("https://cdn.manga.example/page.jpg").is_err());
    assert!(policy.validate("http://127.0.0.1/admin").is_err());
}
```

Also test user opt-in HTTP for localhost fixture only, redirect count, response byte limits and valid image MIME.

- [ ] **Step 2: Verify RED**

Run from `src-tauri`: `cargo test sources::http_policy`

Expected: compilation failure because source modules are absent.

- [ ] **Step 3: Implement source models, registry and HTTP policy**

Resolve hosts before request, reject loopback/private/link-local addresses except explicit test mode, set timeouts and identifiable User-Agent, enforce origin allowlist and strip auth/cookie headers from redirects.

- [ ] **Step 4: Write failing manifest probe tests**

Use a local mock server to assert well-known lookup, schema rejection, template origin validation and successful catalog/chapter/page mapping.

- [ ] **Step 5: Implement manifest adapter and persistence**

Validate against bundled schema; store only validated normalized JSON and capabilities; version adapter configurations and disable incompatible versions with a readable error.

- [ ] **Step 6: Verify adapter core**

Run from `src-tauri`: `cargo test sources:: source_repository`

Expected: PASS without external network.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/sources src-tauri/src/database/source_repository.rs src-tauri/src/commands/sources.rs src-tauri/src/lib.rs
git commit -m "feat: add secure manga source adapter core"
```

### Task 2: Generic HTML profile adapter and adapter SDK

**Files:**
- Create: `src-tauri/src/sources/html_profile.rs`, `src-tauri/src/sources/html_adapter.rs`
- Create: `docs/manga-source-adapters.md`, `examples/sources/generic-example.json`
- Test fixtures: `tests/fixtures/source-site/*`, `tests/fixtures/source-profiles/*`

**Interfaces:**
- Produces: `HtmlSourceProfileV1`, `validate_profile`, profile-backed implementation of `MangaSourceAdapter`.

- [ ] **Step 1: Write failing profile validation tests**

Test required selectors, absolute/same-origin URL normalization, invalid CSS selector, forbidden script/template expressions, chapter order and image extraction from fixture HTML.

- [ ] **Step 2: Verify RED**

Run from `src-tauri`: `cargo test sources::html_`

Expected: compilation failure for missing profile/adapter modules.

- [ ] **Step 3: Implement declarative profile model**

Allow selectors plus attribute/text extraction, URL joins, optional pagination selector, date/title cleanup and ascending/descending chapter order. Do not expose regex backtracking over unbounded documents or any expression language.

- [ ] **Step 4: Implement HTML adapter**

Parse capped HTML responses with `scraper`, map errors to selector-specific diagnostics, validate all extracted URLs through `HttpPolicy`, and reject pages that require client-side JavaScript rather than returning empty fake data.

- [ ] **Step 5: Write the complete adapter guide and example**

Document profile schema fields, probe flow, security boundaries, local fixture testing command and how a compiled adapter can implement the Rust trait.

- [ ] **Step 6: Verify SDK fixtures**

Run from `src-tauri`: `cargo test sources::html_`

Expected: PASS for catalog, details, chapters, pages and malicious fixtures.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/sources docs/manga-source-adapters.md examples/sources tests/fixtures/source-site tests/fixtures/source-profiles
git commit -m "feat: add declarative HTML source profiles"
```

### Task 3: Quota-aware cache and offline downloads

**Files:**
- Create: `src-tauri/src/cache/mod.rs`, `src-tauri/src/cache/index.rs`, `src-tauri/src/cache/quota.rs`, `src-tauri/src/cache/download.rs`
- Create: `src-tauri/src/database/cache_repository.rs`, `src-tauri/src/commands/cache.rs`, `src-tauri/src/commands/downloads.rs`
- Modify: `src-tauri/src/sources/adapter.rs`, `src-tauri/src/commands/manga.rs`, `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `CacheLimit::{Mb500,Gb1,Gb2,Gb5,Unlimited}`, `CacheManager::{get_or_fetch,clear_all,clear_work,enforce_quota}`, `download_chapter`, `cancel_download`, `list_downloads`.

- [ ] **Step 1: Write failing LRU/quota tests**

```rust
#[test]
fn eviction_skips_pinned_and_active_entries() {
    let cache = fixture_cache_with_limit(100);
    cache.insert(entry("old", 60).pinned()).unwrap();
    cache.insert(entry("new", 60)).unwrap();
    cache.enforce_quota().unwrap();
    assert!(cache.contains("old"));
    assert!(!cache.contains("new"));
}
```

Test atomic cleanup after interrupted download and per-work clearing.

- [ ] **Step 2: Verify RED**

Run from `src-tauri`: `cargo test cache::`

Expected: compilation failure for missing cache modules.

- [ ] **Step 3: Implement cache index and quota enforcement**

Use canonical hashed keys, temp file + fsync + atomic rename, SQLite metadata transaction, access-time batching and an active-session lease that protects current pages.

- [ ] **Step 4: Write failing download permission/progress tests**

Assert disabled download when capability is false, chapter-page progress events, cancellation cleanup and pinned completion when allowed.

- [ ] **Step 5: Implement downloads and manga integration**

Stream image responses with byte limits, emit `download://progress`, reuse complete cache entries, persist failure/cancel states and feed cached URLs into standard manga manifests.

- [ ] **Step 6: Verify cache/downloads**

Run from `src-tauri`: `cargo test cache:: commands::downloads::`

Expected: PASS with mock HTTP only.

- [ ] **Step 7: Commit**

```bash
git add src-tauri/src/cache src-tauri/src/database/cache_repository.rs src-tauri/src/commands/cache.rs src-tauri/src/commands/downloads.rs src-tauri/src/commands/manga.rs src-tauri/src/sources src-tauri/src/lib.rs
git commit -m "feat: cache and download online manga"
```

### Task 4: Sources catalog and chapter UI

**Files:**
- Create: `src/types/sources.ts`, `src/stores/sourceStore.ts`, `src/stores/sourceStore.test.ts`
- Create: `src/features/sources/SourcesPage.tsx`, `src/features/sources/SourcesPage.test.tsx`, `src/features/sources/AddSourceDialog.tsx`, `src/features/sources/ImportProfileDialog.tsx`, `src/features/sources/SourceCatalogPage.tsx`, `src/features/sources/RemoteMangaDetailsPage.tsx`, `src/features/sources/DownloadsPanel.tsx`
- Create: `src/components/SourceCard.tsx`, `src/components/DownloadProgress.tsx`
- Modify: `src/app/bridge.ts`, `src/app/App.tsx`, `src/features/manga-reader/MangaReaderPage.tsx`

**Interfaces:**
- Consumes: all source/cache/download commands.
- Produces: working add/probe/enable/disable/remove/profile-import/search/details/read/download/clear-cache flows.

- [ ] **Step 1: Write failing store race tests**

Assert a stale search response cannot replace a newer query, disabled sources cannot search, and cancellation removes transient progress without deleting completed cache.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/stores/sourceStore.test.ts`

Expected: FAIL because store is absent.

- [ ] **Step 3: Implement source store with request identity**

Use primitive selectors, request ids and functional updates. Keep only visible catalog pages and download summaries, not raw image bytes.

- [ ] **Step 4: Write failing source-page flows**

Test compatible URL success, adapter-required error, profile import validation details, catalog search, chapter open in standard manga reader, allowed/forbidden download and source removal confirmation.

- [ ] **Step 5: Implement source UI**

Create responsive source cards, explicit capability badges, catalog/details/chapters, live download progress and real cache-clear actions with non-blocking toasts.

- [ ] **Step 6: Run phase verification**

Run: `pnpm lint && pnpm test && pnpm build`

Run from `src-tauri`: `cargo fmt --check; cargo clippy -- -D warnings; cargo test`

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src src-tauri
git commit -m "feat: browse and read modular manga sources"
```
