# Mochi Reader Windows Release Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Подготовить воспроизводимый Windows production build, end-to-end проверки, installer, документацию и финальный доказуемый release candidate.

**Architecture:** Сборка остаётся self-contained Tauri application; все runtime assets локальны. E2E использует deterministic fixture library и локальный source fixture server.

**Tech Stack:** Tauri 2 bundler, NSIS/MSI, Playwright, Vitest, Cargo test/clippy, pnpm, Windows WebView2.

**Spec:** `docs/superpowers/specs/2026-08-30-mochi-reader-design.md`

## Global Constraints

- Production build поддерживает Windows 10/11 x64.
- README перечисляет только реально проверенные форматы.
- Installer не требует обязательной регистрации или внешнего сервера.
- Release не содержит source fixtures, debug credentials или абсолютные пути разработчика.
- Все checks выполняются на чистом production bundle.

---

### Task 1: Product metadata, icons and hardened Tauri capabilities

**Files:**
- Create: `src-tauri/icons/*`, `src/assets/brand/*`, `LICENSES-THIRD-PARTY.md`
- Modify: `src-tauri/tauri.conf.json`, `src-tauri/capabilities/default.json`, `src-tauri/Cargo.toml`, `package.json`

**Interfaces:**
- Produces: branded `Mochi Reader` executable, MSI/NSIS bundle configuration and least-privilege production capabilities.

- [ ] **Step 1: Create original application mark from the mascot visual language**

Use a simple mochi-book/sakura mark readable at 16 px; generate Windows `.ico` and required PNG sizes from the approved local source asset. Do not reuse a franchise or third-party logo.

- [ ] **Step 2: Add a capability snapshot test**

Parse `default.json` in a Rust/Node test and assert no wildcard shell execution, no global filesystem scope, no remote window URL and only the required dialog/opener/clipboard/event permissions.

- [ ] **Step 3: Verify RED**

Run: `pnpm vitest run src-tauri/capabilities/capabilities.test.ts`

Expected: FAIL until hardened production capability file and test fixture exist.

- [ ] **Step 4: Harden config and inventory licenses**

Set strict CSP, updater disabled unless explicitly configured, product identifier, window min/default sizes, local assets, NSIS/MSI targets and third-party notices including UnRAR terms.

- [ ] **Step 5: Verify configs**

Run: `pnpm test && pnpm tauri info`

Expected: valid config and no over-broad capability assertion.

- [ ] **Step 6: Commit**

```bash
git add src-tauri src/assets/brand package.json LICENSES-THIRD-PARTY.md
git commit -m "build: brand and harden Windows bundle"
```

### Task 2: Deterministic end-to-end fixtures and critical flows

**Files:**
- Create: `tests/e2e/onboarding.spec.ts`, `tests/e2e/library.spec.ts`, `tests/e2e/book-reader.spec.ts`, `tests/e2e/manga-reader.spec.ts`, `tests/e2e/sources.spec.ts`, `tests/e2e/settings.spec.ts`
- Create: `tests/e2e/fixtures/source-server.ts`, `tests/e2e/fixtures/library/*`, `playwright.config.ts`
- Modify: `package.json`

**Interfaces:**
- Produces: `pnpm test:e2e` running against isolated app data and local fixture source.

- [ ] **Step 1: Write the first failing onboarding/import E2E**

Launch with an empty temporary app-data directory, complete theme/folder onboarding, import fixtures and assert persisted cards after process restart.

- [ ] **Step 2: Verify RED**

Run: `pnpm test:e2e --grep "onboarding and import persist"`

Expected: FAIL before the harness/environment hooks exist.

- [ ] **Step 3: Implement isolated desktop E2E harness**

Allocate a unique temp app-data directory per worker, start fixture HTTP source on loopback test mode, capture screenshots/logs on failure and terminate child processes cleanly.

- [ ] **Step 4: Add reader/source/settings flows**

Cover book resume/bookmark/search, manga single/double/vertical/RTL resume, manifest source add/catalog/chapter/cache/download, three themes, reduced motion, mascot toggle and log-folder action.

- [ ] **Step 5: Verify all E2E flows**

Run: `pnpm test:e2e`

Expected: all flows PASS twice consecutively with isolated data.

- [ ] **Step 6: Commit**

```bash
git add tests/e2e playwright.config.ts package.json
git commit -m "test: cover critical desktop reading flows"
```

### Task 3: README and operator documentation

**Files:**
- Create: `README.md`, `docs/troubleshooting.md`, `docs/privacy-and-security.md`
- Modify: `docs/manga-source-adapters.md`

**Interfaces:**
- Produces: exact Development, Build, Supported formats and Manga sources instructions required by the product specification.

- [ ] **Step 1: Derive commands from package/Cargo manifests**

Document prerequisites, `rustup default stable`, pnpm install, `pnpm tauri dev`, test commands, installer build and actual output paths. Do not document commands that were not executed successfully.

- [ ] **Step 2: Document the verified format matrix**

Separate built-in readable formats, optional Calibre-converted formats and unsupported cases; describe damaged/encrypted archive handling.

- [ ] **Step 3: Document source adapter extension**

Link the schema/example, explain manifest/HTML profiles, compiled trait implementation, test fixture flow, permissions and prohibited access-bypass behavior.

- [ ] **Step 4: Add troubleshooting/privacy pages**

Cover WebView2/Rust build prerequisites, missing source files, cache/log locations, diagnostics contents and local-only data behavior.

- [ ] **Step 5: Verify every documented command**

Run each Development/Test/Build command exactly as written and correct documentation immediately when output differs.

- [ ] **Step 6: Commit**

```bash
git add README.md docs
git commit -m "docs: explain development formats and source adapters"
```

### Task 4: Full release verification and installer smoke test

**Files:**
- Modify only files required to correct failures found by the commands below.
- Create: `docs/release-verification.md`

**Interfaces:**
- Produces: a reproducible signed-or-unsigned local release candidate with recorded artifact hashes and check results.

- [ ] **Step 1: Run frontend static and unit checks**

Run: `pnpm lint`

Run: `pnpm test -- --run`

Run: `pnpm build`

Expected: exit 0, no warnings treated as errors, no React act/console errors.

- [ ] **Step 2: Run Rust checks**

Run from `src-tauri`: `cargo fmt --check`

Run from `src-tauri`: `cargo clippy --all-targets --all-features -- -D warnings`

Run from `src-tauri`: `cargo test --all-features`

Expected: exit 0.

- [ ] **Step 3: Run E2E and production build**

Run: `pnpm test:e2e`

Run: `pnpm tauri build`

Expected: exit 0 and Windows installer artifacts in the Tauri target bundle directory.

- [ ] **Step 4: Smoke-test the installer**

Install into the current-user scope, launch with clean app data, import one EPUB and one CBZ, resume both after restart, then uninstall. Verify the external source fixtures remain untouched and app-owned data follows installer choice.

- [ ] **Step 5: Record exact evidence**

Write tool versions, command outcomes, installer filenames, SHA-256 hashes, fixture matrix and any explicitly non-blocking known limitations to `docs/release-verification.md`.

- [ ] **Step 6: Commit final fixes and verification**

```bash
git add .
git commit -m "release: verify Mochi Reader Windows build"
```
