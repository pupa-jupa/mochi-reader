# Mochi Reader 2.0

Mochi Reader is a local-first desktop reader for Windows. It manages books, manga, reading progress, bookmarks, collections, history, and annotations without requiring an account or cloud service.

## Features

- Local SQLite library with search, filters, sorting, collections, favorites, and metadata editing.
- Unified readers for reflowable books, PDF documents, image archives, image folders, and remote manga.
- Persistent progress, reading sessions, bookmarks, highlights, quotes, and notes.
- Text controls for font, size, line height, content width, paragraph spacing, first-line indent, letter spacing, alignment, and color theme.
- PDF search, thumbnails, zoom, page fitting, and anchored annotations.
- Manga page, spread, vertical, and webtoon modes with offline cache controls.
- Local file import and declarative online catalogs with strict network policies.

## Format support

| Format | Support |
| --- | --- |
| EPUB 2/3 | Built-in reflowable reader |
| FB2, FB2.ZIP | Built-in reader; UTF-8, UTF-16, Windows-1251, legacy entity and markup compatibility |
| PDF | PDF.js reader with text search and annotations |
| TXT, HTML, HTM, Markdown | Built-in reflowable reader |
| CBZ, ZIP images, image folders | Built-in manga reader |
| JPG, JPEG, PNG, WEBP, AVIF | Built-in image reader |
| MangaDex | Built-in read-only API adapter |
| OPDS 1.x and 2.0 | Open-access EPUB, PDF, FB2, TXT, HTML, and Markdown acquisitions |
| CBR | Detected but not opened; an UnRAR implementation is not bundled |
| MOBI, AZW, AZW3, DJVU, DOCX, DRM publications | Not supported |

## Online sources

The application supports three source types:

- the compiled MangaDex adapter;
- OPDS 1.x and 2.0 catalogs;
- declarative JSON/REST or legacy HTML profiles.

Source profiles cannot execute JavaScript. Network requests enforce HTTPS, origin restrictions, response-size limits, timeouts, and private-address blocking. The application does not bypass authentication, CAPTCHA, paywalls, anti-bot systems, or DRM.

See [source adapter documentation](docs/manga-source-adapters.md), [Mochi Source Manifest v1](docs/source-manifest.md), and [privacy and security](docs/privacy-and-security.md).

## Technology

- React 19 and TypeScript 6
- Tauri 2
- Rust
- SQLite
- Vite and Vitest
- PDF.js

The React frontend contains the application shell and readers. Rust handles file detection, parsing, persistence, cache management, source adapters, and operating-system integration.

## Development

Requirements:

- Windows 10 or 11 with WebView2;
- Node.js 24;
- pnpm 11.19.0;
- stable Rust with the Windows MSVC toolchain;
- Visual Studio Build Tools with Desktop development with C++.

```powershell
pnpm install --frozen-lockfile
pnpm tauri dev
```

Run the verification suite:

```powershell
pnpm lint
pnpm test -- --run
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features --locked
```

Build the Windows installer:

```powershell
pnpm tauri build --ci --bundles nsis
```

The unsigned current-user NSIS installer is written to `src-tauri/target/release/bundle/nsis/`.

## Releases

CI runs the frontend and Rust verification gates and builds the Windows installer. A tag matching the application version creates a draft GitHub release with the installer and `SHA256SUMS.txt`. Drafts require manual review before publication.

Local release evidence is recorded in [docs/release-verification.md](docs/release-verification.md).
