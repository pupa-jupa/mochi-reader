# Release verification

## Mochi Reader 2.0.0

Local verification was completed on Windows x64 on 2026-09-02 from commit `a79c094` on the `codex/mochi-reader-2-0` branch.

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | passed |
| `pnpm lint` | passed |
| `pnpm test -- --run` | 26 files, 88 tests passed |
| `pnpm build` | passed |
| `cargo fmt --check` | passed |
| `cargo clippy --all-targets --all-features --locked -- -D warnings` | passed |
| `cargo test --all-features --locked -j 1` | 66 tests passed |
| `pnpm tauri build --ci --bundles nsis` | passed |

The local build produced:

- file: `Mochi Reader_2.0.0_x64-setup.exe`;
- size: 12,100,377 bytes (11.54 MiB);
- SHA-256: `ED68CB73B80EA17B937494F013E881166295720EDE04D70358CEF51D11475085`.

This installer includes the expanded reader typography controls, legacy FB2 compatibility fixes, and revised product copy from commit `a79c094`.

This hash identifies the local build only. GitHub Actions produces a fresh artifact with its own checksum when the workflow runs.

The installer is currently unsigned. A complete install/uninstall smoke test was not performed because Mochi Reader 0.1.0 is already installed on this Windows account; overwriting and uninstalling that registered application would risk the existing installation. The NSIS package itself was produced successfully.
