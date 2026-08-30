# Mochi Reader Product Experience Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Довести приложение до цельного коммерческого опыта: оригинальная визуальная система и ассеты, onboarding, настройки, диагностика, accessibility и масштабируемая навигация.

**Architecture:** Theme/motion tokens применяются на корневом элементе, persistent settings остаются в SQLite, а UI chrome разделён на доступные reusable components. ImageGen-ассеты поставляются локально и не требуют сети.

**Tech Stack:** React, TypeScript, Tailwind CSS, Motion, Lucide, Zustand, Tauri, ImageGen, Vitest, Testing Library, axe.

**Spec:** `docs/superpowers/specs/2026-08-30-mochi-reader-design.md`

## Global Constraints

- Темы: Sakura Pink, Strawberry Milk, Night Sakura.
- `prefers-reduced-motion` и пользовательская настройка отключают spatial motion.
- Mascot оригинальный, не связан с существующей франшизой и полностью отключаем.
- Настройки сохраняются автоматически между запусками.
- UI не выглядит административной панелью и остаётся reader-first.
- Все новые production-функции проходят RED → GREEN → REFACTOR.

---

### Task 1: Theme tokens, shell navigation and reusable UI primitives

**Files:**
- Create: `src/styles/tokens.css`, `src/styles/themes.css`, `src/styles/motion.css`, `src/styles/typography.css`
- Create: `src/app/AppLayout.tsx`, `src/app/Sidebar.tsx`, `src/app/TopBar.tsx`, `src/app/RouteTransition.tsx`
- Create: `src/components/Button.tsx`, `src/components/IconButton.tsx`, `src/components/Modal.tsx`, `src/components/Dropdown.tsx`, `src/components/SearchBar.tsx`, `src/components/ToastViewport.tsx`, `src/components/SettingsSection.tsx`
- Create: `src/stores/uiStore.ts`, `src/stores/uiStore.test.ts`
- Modify: `src/app/App.tsx`, `src/styles/index.css`

**Interfaces:**
- Produces: semantic token classes, collapsible sidebar, global search, modal/toast APIs and keyboard focus management.

- [ ] **Step 1: Write failing UI store and motion tests**

```ts
it('disables spatial motion when either preference requests reduction', () => {
  expect(resolveMotionLevel({ systemReduced: true, userReduced: false })).toBe('reduced');
  expect(resolveMotionLevel({ systemReduced: false, userReduced: true })).toBe('reduced');
});
```

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/stores/uiStore.test.ts`

Expected: FAIL because store/motion resolver are absent.

- [ ] **Step 3: Implement semantic themes and UI state**

Define background/surface/ink/accent/border/shadow/reader tokens for all themes; set `data-theme` and `data-motion`; avoid component-specific hard-coded palette values.

- [ ] **Step 4: Write failing navigation/component tests**

Test sidebar collapse, every required route, global search focus, modal focus trap/return, Escape close, toast auto-dismiss/pause and active route announcement.

- [ ] **Step 5: Implement reader-first application shell**

Build compact sidebar, contextual top bar and shared primitives with visible focus, 44px targets, correct labels, no emoji-only controls and short reduced-motion-safe transitions.

- [ ] **Step 6: Verify UI foundation**

Run: `pnpm test && pnpm build`

Expected: PASS with no accessibility warnings in component tests.

- [ ] **Step 7: Commit**

```bash
git add src
git commit -m "feat: establish Mochi Reader visual system"
```

### Task 2: Original mascot and empty-state asset family

**Files:**
- Create via ImageGen: `src/assets/mascot/mochi-librarian.png`, `src/assets/mascot/empty-library.png`, `src/assets/mascot/empty-manga.png`, `src/assets/mascot/welcome.png`
- Create: `src/assets/mascot/README.md`, `src/components/Mascot.tsx`, `src/components/Mascot.test.tsx`
- Modify: `src/components/EmptyState.tsx`, `src/features/dashboard/DashboardPage.tsx`

**Interfaces:**
- Produces: local transparent PNG/WebP-compatible asset family and `Mascot { pose, size, decorative }`.

- [ ] **Step 1: Generate the original asset sheet through ImageGen**

Prompt for one consistent original mochi-rabbit librarian character, soft editorial kawaii watercolor/gouache, blush/cream palette, no text, no logo, no known anime character, transparent/simple backgrounds and production-safe generous padding.

- [ ] **Step 2: Inspect generated pixels and derive the four crops**

Verify silhouette, hand/paw count, no accidental letters/watermarks, contrast in light/dark themes and consistent facial details. Regenerate any failed pose rather than shipping a flawed crop.

- [ ] **Step 3: Write the failing Mascot behavior test**

```tsx
it('renders nothing when mascot display is disabled', () => {
  render(<Mascot pose="empty-library" />, { settings: { showMascot: false } });
  expect(screen.queryByTestId('mascot')).not.toBeInTheDocument();
});
```

- [ ] **Step 4: Verify RED**

Run: `pnpm vitest run src/components/Mascot.test.tsx`

Expected: FAIL because `Mascot` is absent.

- [ ] **Step 5: Implement responsive mascot usage**

Use empty alt for decorative poses, meaningful localized alt when informative, fixed aspect ratios to prevent layout shift and `content-visibility` for offscreen illustrations.

- [ ] **Step 6: Commit assets and component**

```bash
git add src/assets/mascot src/components/Mascot.tsx src/components/Mascot.test.tsx src/components/EmptyState.tsx src/features/dashboard/DashboardPage.tsx
git commit -m "feat: add original Mochi mascot artwork"
```

### Task 3: Persistent settings and first-run onboarding

**Files:**
- Create: `src-tauri/src/database/settings_repository.rs`, `src-tauri/src/commands/settings.rs`
- Create: `src/types/settings.ts`, `src/stores/settingsStore.ts`, `src/stores/settingsStore.test.ts`
- Create: `src/features/onboarding/OnboardingFlow.tsx`, `src/features/onboarding/OnboardingFlow.test.tsx`
- Create: `src/features/settings/SettingsPage.tsx`, `src/features/settings/AppearanceSettings.tsx`, `src/features/settings/ReaderSettings.tsx`, `src/features/settings/MangaSettings.tsx`, `src/features/settings/LibrarySettings.tsx`, `src/features/settings/CacheSettings.tsx`, `src/features/settings/SourceSettings.tsx`, `src/features/settings/DiagnosticsSettings.tsx`
- Modify: `src/app/bridge.ts`, `src/app/App.tsx`

**Interfaces:**
- Produces: versioned `AppSettings`, `get_settings`, `update_settings`, `complete_onboarding`, automatic theme/reader/manga/cache/mascot/UI-scale persistence.

- [ ] **Step 1: Write failing settings migration tests**

Test default values, round-trip, preservation of unknown future-safe keys and migration from schema version 1 to current.

- [ ] **Step 2: Verify RED**

Run from `src-tauri`: `cargo test settings_repository`

Expected: compilation failure for missing repository.

- [ ] **Step 3: Implement settings repository and commands**

Validate enum/range values, store a versioned JSON document transactionally and retain last-known-good defaults if the persisted value is damaged.

- [ ] **Step 4: Write failing onboarding/settings UI tests**

Test four onboarding steps, back/next, folder skip/selection, theme preview, completion persistence, every settings control and reset-to-default confirmation.

- [ ] **Step 5: Implement onboarding and settings pages**

Wire all controls to real settings/cache/source/library commands, apply theme and UI scale immediately, and avoid showing onboarding after completion.

- [ ] **Step 6: Verify settings**

Run: `pnpm test && pnpm build`

Run from `src-tauri`: `cargo test settings_repository commands::settings`

Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add src src-tauri
git commit -m "feat: add onboarding and persistent preferences"
```

### Task 4: Diagnostics, converter integration and polished error UX

**Files:**
- Create: `src-tauri/src/diagnostics/mod.rs`, `src-tauri/src/diagnostics/report.rs`, `src-tauri/src/commands/diagnostics.rs`, `src-tauri/src/import/converter.rs`
- Create: `src/features/settings/ConverterSettings.tsx`, `src/components/ErrorDetailsDialog.tsx`, `src/components/AppErrorBoundary.tsx`
- Modify: `src-tauri/src/lib.rs`, `src/app/bridge.ts`, `src/app/App.tsx`, `src/features/library/LibraryPage.tsx`

**Interfaces:**
- Produces: `open_log_folder`, `copy_diagnostics`, `validate_converter`, `convert_and_import`; rotating privacy-filtered logs; user-safe error details.

- [ ] **Step 1: Write failing diagnostic redaction tests**

Assert paths are reduced to basenames where possible, auth headers/query secrets/book excerpts are absent, and build/schema/OS versions remain.

- [ ] **Step 2: Verify RED**

Run from `src-tauri`: `cargo test diagnostics::`

Expected: compilation failure for missing diagnostics modules.

- [ ] **Step 3: Implement logs and diagnostics commands**

Configure rotating app-log files, open only the app log directory, construct redacted plain-text diagnostics and copy through the clipboard plugin.

- [ ] **Step 4: Write failing converter tests**

Test missing executable, invalid executable, timeout, non-zero exit, path quoting, EPUB/PDF output verification and cleanup of partial output using a fixture converter process.

- [ ] **Step 5: Implement opt-in Calibre conversion**

Accept only a user-selected `ebook-convert` path, invoke it without a shell, cap runtime/output, write into app library only after verified completion, and label MOBI/AZW3/DJVU unsupported when unavailable.

- [ ] **Step 6: Implement polished error boundary/details UI**

Map known error codes to localized messages/toasts, provide retry/relink/details where recoverable, and never render raw payloads as ordinary copy.

- [ ] **Step 7: Verify diagnostics and errors**

Run: `pnpm test && pnpm build`

Run from `src-tauri`: `cargo test diagnostics:: import::converter::`

Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add src src-tauri
git commit -m "feat: add diagnostics and optional format conversion"
```

### Task 5: Accessibility, performance and interaction polish

**Files:**
- Create: `src/test/accessibility.tsx`, `src/app/App.accessibility.test.tsx`, `src/utils/keyboard.ts`, `src/utils/keyboard.test.ts`
- Modify: library grids, dashboards, readers, dialogs, settings, sources and CSS motion files touched by prior tasks.

**Interfaces:**
- Produces: zero serious axe violations on critical pages, consistent shortcuts, scalable UI and virtualized long collections.

- [ ] **Step 1: Write failing critical-screen axe tests**

Run axe against onboarding, empty/populated library, details, book reader toolbar, manga reader toolbar, sources and settings with representative fixtures.

- [ ] **Step 2: Verify RED**

Run: `pnpm vitest run src/app/App.accessibility.test.tsx`

Expected: FAIL on the first actual landmark/name/contrast/focus issue.

- [ ] **Step 3: Fix semantics, focus and contrast at token level**

Add landmarks, headings, descriptions, live regions, roving focus where appropriate, focus return and theme token adjustments; keep reader content selectable.

- [ ] **Step 4: Add long-library performance test**

Render a 5,000-item data source and assert the DOM contains only the virtual window; assert source search and import progress do not trigger full-card rerenders.

- [ ] **Step 5: Refine animations and loading states**

Use one orchestrated page reveal, short card/modal interactions, skeletons with fixed dimensions, and no transforms when reduced motion is active.

- [ ] **Step 6: Run phase verification**

Run: `pnpm lint && pnpm test && pnpm build`

Run from `src-tauri`: `cargo fmt --check; cargo clippy -- -D warnings; cargo test`

Expected: all exit 0 with no test warnings.

- [ ] **Step 7: Commit**

```bash
git add src src-tauri
git commit -m "feat: polish accessibility and large-library performance"
```
