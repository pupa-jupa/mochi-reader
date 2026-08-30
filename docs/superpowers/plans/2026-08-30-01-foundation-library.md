# Mochi Reader Foundation and Library Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Создать запускаемое Tauri-приложение с дизайн-системой, SQLite, типизированным IPC, реальным импортом и рабочей библиотекой.

**Architecture:** React feature-модули вызывают тонкий TypeScript bridge; Rust-команды делегируют repositories и import services. SQLite является source of truth, а Zustand хранит только UI/query state.

**Tech Stack:** Tauri 2, Rust stable, React, TypeScript, Vite, pnpm, Tailwind CSS, Motion, Lucide, Zustand, rusqlite, Vitest, Testing Library.

**Spec:** `docs/superpowers/specs/2026-08-30-mochi-reader-design.md`

## Global Constraints

- Windows 10/11 x64 — целевая desktop-платформа.
- Tauri 2 / Rust владеет SQLite, filesystem и импортом; frontend не выполняет SQL.
- Все импортированные HTML-фрагменты считаются недоверенными.
- Исходные файлы открываются read-only и не копируются без настройки пользователя.
- Ни одна тяжёлая операция не блокирует UI thread.
- Все новые production-функции проходят RED → GREEN → REFACTOR.

---

### Task 1: Workspace, test harness and application shell

**Files:**
- Create: `package.json`, `pnpm-workspace.yaml`, `vite.config.ts`, `vitest.config.ts`, `tsconfig.json`, `tsconfig.node.json`, `eslint.config.js`, `index.html`
- Create: `src/test/setup.ts`, `src/app/App.test.tsx`, `src/app/App.tsx`, `src/app/main.tsx`, `src/styles/index.css`
- Create: `src-tauri/Cargo.toml`, `src-tauri/build.rs`, `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/src/main.rs`, `src-tauri/src/lib.rs`
- Create: `.gitignore`, `.editorconfig`

**Interfaces:**
- Produces: `App(): JSX.Element`, Tauri application entrypoint, `pnpm test`, `pnpm build`, `cargo test`.

- [ ] **Step 1: Add manifests and test configuration**

Declare scripts `dev`, `build`, `test`, `test:watch`, `lint`, `tauri`, pin package-manager in `package.json`, and configure jsdom with `src/test/setup.ts` importing `@testing-library/jest-dom/vitest`.

- [ ] **Step 2: Write the failing shell test**

```tsx
it('renders the Mochi Reader application landmark', () => {
  render(<App />);
  expect(screen.getByRole('application', { name: 'Mochi Reader' })).toBeVisible();
});
```

- [ ] **Step 3: Run the focused test and verify RED**

Run: `pnpm vitest run src/app/App.test.tsx`

Expected: FAIL because `src/app/App.tsx` does not exist.

- [ ] **Step 4: Add the minimal React and Tauri shells**

Create `App` with the named application landmark, router outlet, error boundary, and local CSS import. Create Tauri `run()` that opens one window and exposes a `health_check` command returning `{"status":"ok"}`.

- [ ] **Step 5: Verify frontend and native shells**

Run: `pnpm test && pnpm build`

Run from `src-tauri`: `cargo fmt --check; cargo test`

Expected: all commands exit 0.

- [ ] **Step 6: Commit**

```bash
git add package.json pnpm-workspace.yaml vite.config.ts vitest.config.ts tsconfig.json tsconfig.node.json eslint.config.js index.html src src-tauri .gitignore .editorconfig
git commit -m "feat: scaffold Mochi Reader desktop shell"
```

### Task 2: Domain errors, SQLite migrations and repositories

**Files:**
- Create: `src-tauri/src/domain/mod.rs`, `src-tauri/src/domain/error.rs`, `src-tauri/src/domain/work.rs`
- Create: `src-tauri/src/database/mod.rs`, `src-tauri/src/database/connection.rs`, `src-tauri/src/database/migrations.rs`, `src-tauri/src/database/work_repository.rs`
- Create: `src-tauri/migrations/0001_initial.sql`
- Modify: `src-tauri/src/lib.rs`

**Interfaces:**
- Produces: `AppError`, `AppErrorPayload`, `WorkKind`, `WorkStatus`, `WorkSummary`, `WorkDetails`, `WorkRepository::{insert,list,get,set_favorite,update_metadata,remove}`.
- Database path: app data `mochi-reader.sqlite3`; tests use in-memory SQLite with identical migrations.

- [ ] **Step 1: Write failing migration/repository tests**

```rust
#[test]
fn migrations_create_queryable_library() {
    let db = test_connection();
    migrate(&db).unwrap();
    let repo = WorkRepository::new(&db);
    let id = repo.insert(&fixture_work("Moonlit Letters")).unwrap();
    assert_eq!(repo.get(id).unwrap().title, "Moonlit Letters");
}

#[test]
fn removing_a_work_does_not_remove_its_source_file() {
    let fixture = tempfile::NamedTempFile::new().unwrap();
    let db = migrated_test_connection();
    let id = WorkRepository::new(&db).insert(&fixture_at(fixture.path())).unwrap();
    WorkRepository::new(&db).remove(id).unwrap();
    assert!(fixture.path().exists());
}
```

- [ ] **Step 2: Verify repository tests fail for missing modules**

Run from `src-tauri`: `cargo test database::`

Expected: compilation failure for missing `database` and `WorkRepository`.

- [ ] **Step 3: Add schema and domain types**

Create the tables and indexes listed in the spec, including FTS5 for work title/author/tags/chapter title. Implement `AppErrorPayload { code, user_message, detail, recoverable }` and conversion from I/O/SQLite errors without exposing stack traces.

- [ ] **Step 4: Implement parameterized repository methods**

Use transactions for insert/update/remove. `remove` deletes rows, thumbnails and internal cache references only; it never calls filesystem deletion on `source_path`.

- [ ] **Step 5: Verify migrations and repositories**

Run from `src-tauri`: `cargo test database:: domain::`

Expected: PASS with the real migration on every test DB.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/domain src-tauri/src/database src-tauri/migrations src-tauri/src/lib.rs
git commit -m "feat: add persistent library database"
```

### Task 3: Format detection, natural sorting and import pipeline

**Files:**
- Create: `src-tauri/src/import/mod.rs`, `src-tauri/src/import/detect.rs`, `src-tauri/src/import/job.rs`, `src-tauri/src/import/scanner.rs`, `src-tauri/src/import/thumbnail.rs`
- Create: `src-tauri/src/manga/mod.rs`, `src-tauri/src/manga/natural_sort.rs`
- Create: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/import.rs`, `src-tauri/src/commands/library.rs`
- Modify: `src-tauri/src/lib.rs`
- Test fixtures: `tests/fixtures/import/*`

**Interfaces:**
- Consumes: `WorkRepository` and domain errors.
- Produces: `DetectedFormat`, `ImportOptions { copy_into_library: bool }`, `ImportItemResult`, `ImportBatchResult`, `detect_format(path)`, `natural_cmp(a,b)`, Tauri commands `import_paths`, `scan_folder`, `list_works`, `get_work`.

- [ ] **Step 1: Write failing detector and natural-sort tests**

```rust
#[test]
fn signature_wins_over_a_wrong_extension() {
    let path = fixture_named_with_bytes("novel.txt", include_bytes!("../../../../tests/fixtures/import/minimal.epub"));
    assert_eq!(detect_format(&path).unwrap(), DetectedFormat::Epub);
}

#[test]
fn manga_pages_use_numeric_segments() {
    let mut names = vec!["10.jpg", "2.jpg", "1.jpg", "page3.jpg"];
    names.sort_by(|a, b| natural_cmp(a, b));
    assert_eq!(names, vec!["1.jpg", "2.jpg", "10.jpg", "page3.jpg"]);
}
```

- [ ] **Step 2: Verify RED**

Run from `src-tauri`: `cargo test import:: manga::natural_sort::`

Expected: compilation failure because detector and comparator are absent.

- [ ] **Step 3: Implement safe detection and scanning**

Detect ZIP/EPUB/CBZ using container entries, RAR/CBR and PDF using signatures, XML root for FB2, image magic, and text family by extension only after UTF decoding succeeds. Canonicalize paths, skip symlink loops, apply bounded concurrency, and return per-item errors instead of aborting the batch.

- [ ] **Step 4: Implement import orchestration and events**

`import_paths` starts an async job, emits `import://progress` with `{completed,total,currentPath}`, persists each valid candidate in a transaction, and creates a generated cover thumbnail when metadata has no cover.

- [ ] **Step 5: Verify pipeline tests**

Run from `src-tauri`: `cargo test import:: manga::natural_sort:: commands::import::`

Expected: PASS for valid, damaged, missing and duplicate fixtures.

- [ ] **Step 6: Commit**

```bash
git add src-tauri/src/import src-tauri/src/manga src-tauri/src/commands src-tauri/src/lib.rs tests/fixtures/import
git commit -m "feat: import books and manga safely"
```

### Task 4: Typed bridge, library store and library UI

**Files:**
- Create: `src/types/library.ts`, `src/app/bridge.ts`, `src/app/bridge.test.ts`
- Create: `src/stores/libraryStore.ts`, `src/stores/libraryStore.test.ts`
- Create: `src/features/library/LibraryPage.tsx`, `src/features/library/LibraryPage.test.tsx`, `src/features/library/LibraryGrid.tsx`, `src/features/library/LibraryToolbar.tsx`, `src/features/library/ImportDropZone.tsx`
- Create: `src/components/BookCard.tsx`, `src/components/BookCard.test.tsx`, `src/components/ProgressBar.tsx`, `src/components/SkeletonCard.tsx`, `src/components/EmptyState.tsx`
- Modify: `src/app/App.tsx`

**Interfaces:**
- Consumes: commands `list_works`, `get_work`, `import_paths`, `scan_folder`.
- Produces: `desktopBridge` and injectable `DesktopBridge`; `useLibraryStore` with paged query/filter/import state.

- [ ] **Step 1: Write failing bridge and store tests**

```ts
it('maps a library query to the native command contract', async () => {
  const invoke = vi.fn().mockResolvedValue({ items: [], total: 0 });
  await createDesktopBridge(invoke).listWorks({ query: 'sakura', offset: 0, limit: 40 });
  expect(invoke).toHaveBeenCalledWith('list_works', {
    request: { query: 'sakura', offset: 0, limit: 40 },
  });
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/app/bridge.test.ts src/stores/libraryStore.test.ts`

Expected: FAIL because bridge/store modules are absent.

- [ ] **Step 3: Implement typed bridge and store**

Use direct static imports, primitive selector subscriptions and functional state updates. Store only the current page, query state and selection; do not mirror all SQLite rows.

- [ ] **Step 4: Write failing accessible UI tests**

```tsx
it('offers real file and folder imports in an empty library', async () => {
  renderLibrary({ items: [], total: 0 });
  expect(screen.getByRole('button', { name: 'Добавить книги' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Добавить папку' })).toBeEnabled();
  expect(screen.getByText('Здесь пока пусто ♡')).toBeVisible();
});
```

- [ ] **Step 5: Implement virtualized library UI and drag-and-drop**

Build filter chips for all/read/reading/planned/completed/on-hold/favorite, debounced search, paged virtual grid, import dialogs, Tauri drag events, progress UI and per-item error summary. Every card exposes read/details/favorite/context actions.

- [ ] **Step 6: Verify frontend**

Run: `pnpm test && pnpm build`

Expected: PASS with no React warnings.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: build searchable desktop library"
```

### Task 5: Dashboard, work details, collections and file recovery

**Files:**
- Create: `src-tauri/src/database/dashboard_repository.rs`, `src-tauri/src/database/collection_repository.rs`
- Create: `src-tauri/src/commands/dashboard.rs`, `src-tauri/src/commands/collections.rs`
- Create: `src/features/dashboard/DashboardPage.tsx`, `src/features/dashboard/DashboardPage.test.tsx`
- Create: `src/features/details/WorkDetailsPage.tsx`, `src/features/details/WorkDetailsPage.test.tsx`, `src/features/details/MetadataEditor.tsx`, `src/features/details/ChapterList.tsx`
- Create: `src/features/collections/CollectionsPage.tsx`, `src/components/ContinueReadingCard.tsx`, `src/components/CollectionCard.tsx`, `src/components/ContextMenu.tsx`
- Modify: `src/app/bridge.ts`, `src/app/App.tsx`, `src/types/library.ts`

**Interfaces:**
- Produces: `get_dashboard`, `update_work_metadata`, `set_favorite`, `set_work_status`, `create_collection`, `add_to_collection`, `remove_from_library`, `relink_file`.

- [ ] **Step 1: Write failing repository tests for dashboard and collections**

Assert recent ordering, favorite filtering, reading statistics and unique collection membership against a migrated in-memory DB.

- [ ] **Step 2: Verify RED**

Run from `src-tauri`: `cargo test dashboard_repository collection_repository`

Expected: compilation failure for missing repositories.

- [ ] **Step 3: Implement repositories and commands**

Use SQL aggregation for statistics, parameterized metadata updates, source-file existence checks, fingerprint validation on relink, and library-only deletion semantics.

- [ ] **Step 4: Write failing page-flow tests**

Test continue-reading navigation, metadata editing, favorite toggle, collection creation, missing-file recovery and library-only removal confirmation using an injected bridge.

- [ ] **Step 5: Implement dashboard and details flows**

Render continue card, recent and favorite rails, compact statistics, cover/details layout, chapter list, editable metadata dialog and working context menu. Missing files show `Файл не найден` with `Найти файл`.

- [ ] **Step 6: Run phase verification**

Run: `pnpm lint && pnpm test && pnpm build`

Run from `src-tauri`: `cargo fmt --check; cargo clippy -- -D warnings; cargo test`

Expected: all exit 0.

- [ ] **Step 7: Commit**

```bash
git add src src-tauri
git commit -m "feat: complete library management flows"
```
