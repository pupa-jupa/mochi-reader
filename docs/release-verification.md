# Release verification

## Mochi Reader 2.0.0

Local verification was completed on Windows x64 on 2026-09-01 from the `codex/mochi-reader-2-0` branch.

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | passed |
| `pnpm lint` | passed |
| `pnpm test -- --run` | 25 files, 86 tests passed |
| `pnpm build` | passed |
| `cargo fmt --check` | passed |
| `cargo clippy --all-targets --all-features --locked -- -D warnings` | passed |
| `cargo test --all-features --locked -j 1` | 63 tests passed |
| `pnpm tauri build --ci --bundles nsis` | passed |

The local build produced:

- file: `Mochi Reader_2.0.0_x64-setup.exe`;
- size: 12,091,792 bytes (11.53 MiB);
- SHA-256: `A715D343C3DD6B840321F912DE127DBE73475F3CDB0E2D1155C1F517F8614AD2`.

This hash identifies the local build only. GitHub Actions produces a fresh artifact and publishes its own `SHA256SUMS.txt` alongside the draft release.

The installer is currently unsigned. Successful compilation and packaging were verified; an interactive install/uninstall smoke test was not performed as part of this automated pass.
