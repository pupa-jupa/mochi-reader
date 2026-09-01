# Mochi Reader 2.0

Mochi Reader — local-first desktop reader for Windows built with React, TypeScript, Tauri and Rust. Library metadata, progress, history, collections, bookmarks and annotations stay in the local SQLite database.

## Supported reading formats

Built in and routed to a real reader:

- EPUB 2/3;
- FB2 and FB2 inside ZIP, including UTF-8, UTF-16 and Windows-1251 sources;
- PDF with PDF.js layout, search, thumbnails and anchored annotations;
- TXT, HTML/HTM and Markdown;
- CBZ, ZIP images, image folders, JPG/JPEG, PNG, WEBP and AVIF;
- remote MangaDex manga;
- open-access EPUB, PDF, FB2, TXT, HTML and Markdown books from same-origin OPDS acquisitions.

CBR is detected and shown in the library, but opening it currently requires an external UnRAR integration that is not bundled. MOBI, AZW/AZW3, DJVU, DOCX and DRM-encrypted publications are not advertised as supported.

## Development

Prerequisites:

- Windows 10 or 11 with WebView2;
- Node.js 24;
- pnpm 11.19.0;
- Rust stable with the Windows MSVC toolchain;
- Visual Studio Build Tools with Desktop development with C++.

```powershell
pnpm install --frozen-lockfile
pnpm tauri dev
```

Quality gates:

```powershell
pnpm lint
pnpm test -- --run
pnpm build
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets --all-features --locked -- -D warnings
cargo test --manifest-path src-tauri/Cargo.toml --all-features --locked
```

Build an unsigned current-user NSIS installer:

```powershell
pnpm tauri build --ci --bundles nsis
```

The installer is written below `src-tauri/target/release/bundle/nsis/`.

## Online catalogs

- MangaDex is a compiled built-in Rust adapter.
- OPDS 1.x and 2.0 catalogs can be checked, previewed and connected by URL.
- JSON/REST manga catalogs use the declarative [Mochi Source Manifest v1](docs/source-manifest.md).
- Legacy HTML profiles contain only URL templates and CSS selectors.

No source can execute JavaScript inside Mochi Reader. Network adapters enforce HTTPS, origin boundaries, response limits, timeouts and private-address blocking. Mochi Reader does not bypass login, CAPTCHA, paywalls, anti-bot systems or DRM. See [privacy and security](docs/privacy-and-security.md) and [source adapter details](docs/manga-source-adapters.md).

## Releases

CI verifies frontend and Rust gates and builds the Windows NSIS package. Pushing a tag matching the application version, for example `v2.0.0`, creates a draft GitHub release and uploads the installer. Drafts are intentionally not published automatically; review and sign the Windows binary before public distribution.

The draft also includes `SHA256SUMS.txt`. The workflow uses least-privilege `GITHUB_TOKEN` permissions and pins every external action to a full commit SHA. The latest local release evidence is recorded in [docs/release-verification.md](docs/release-verification.md).
