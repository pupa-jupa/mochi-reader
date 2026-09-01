# Release verification

## Mochi Reader 2.0.0

Local verification was completed on Windows x64 on 2026-09-01 from the `codex/mochi-reader-2-0` branch.

| Gate | Result |
| --- | --- |
| `pnpm install --frozen-lockfile` | passed |
| `pnpm lint` | passed |
| `pnpm test -- --run` | 26 files, 87 tests passed |
| `pnpm build` | passed |
| `cargo fmt --check` | passed |
| `cargo clippy --all-targets --all-features --locked -- -D warnings` | passed |
| `cargo test --all-features --locked -j 1` | 63 tests passed |
| `pnpm tauri build --ci --bundles nsis` | passed |
| GitHub Actions CI run `33499181330` | passed on a clean `windows-latest` runner |

The local build produced:

- file: `Mochi Reader_2.0.0_x64-setup.exe`;
- size: 12,096,053 bytes (11.54 MiB);
- SHA-256: `BD855D57E68A3DCC4B9C8AD4B14E16A5519CCF6BB29CA1110E4BB34F7E77B404`.

This installer includes the Sakura Stationery art-direction pass from commit `a4f88e4`.

This hash identifies the local build only. GitHub Actions produces a fresh artifact and publishes its own `SHA256SUMS.txt` alongside the draft release. The successful CI evidence is available at <https://github.com/pupa-jupa/mochi-reader/actions/runs/33499181330>.

The release executable was also rebuilt with the isolated test identifier `app.mochireader.smoke` and launched successfully into the clean first-run onboarding screen. The window was closed normally after capture, and the existing Mochi Reader library was not modified.

The installer is currently unsigned. A complete install/uninstall smoke test was not performed because Mochi Reader 0.1.0 is already installed on this Windows account; overwriting and uninstalling that registered application would risk the existing installation. The NSIS package itself was produced successfully both locally and by GitHub Actions.
