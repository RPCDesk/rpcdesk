# Handoff — Pi Desktop

Working notes for whoever picks this up next (human or agent). Keep it current: it is the
one file that should always describe the real state of the project.

_Last updated: 2026-10-22 — after the CLI-RPC rewrite, cross-platform builds, and self-update._

## What this is

A desktop front-end for the `pi` and `omp` coding-agent CLIs. One tab = one persisted agent
session, rendered as a chat transcript with streaming text, thinking, tool cards, diffs,
approvals, and resume. The app owns presentation and process lifecycle only: models,
credentials, tools, sessions, and policy stay with the CLIs.

Repository root: `~/Documents/Projects/pi-desktop` (macOS host).

## Where things live

| Path | What it is |
| --- | --- |
| `src/` | React UI, Zustand stores (`state/tabs.ts`, `state/transcript.ts`, `state/updates.ts`, `state/runtime.ts`, `state/settings.ts`), plugin host |
| `sidecar/` | Bun bridge: spawns one CLI in RPC mode, translates records to app frames (`src/backends/cli.ts`, `src/cli-process.ts`, `src/ui-context.ts`, `src/approval.ts`) |
| `packages/protocol/` | Shared frame/snapshot types + runtime guards (`index.ts`, `frames.test.ts`) |
| `src-tauri/src/` | Tauri shell: `sidecar.rs` (supervision), `runtime.rs` (CLI discovery/download), `updates.rs` (self-update), `paths.rs` (platform dirs), `user_files.rs` |
| `scripts/` | `stage-sidecar.ts`, `build-app.ts` (signing-aware build), `publish-update.ts`, `zip-store.ts` |
| `docs/adr/` | 0001 (original SDK design, superseded), 0002 (why CLI RPC) |
| `docs/updates.md` | Update modes, feed format, signing, per-platform behavior |
| `docs/vms.md` | Local test VMs, build commands, guest-specific gotchas |
| `CONTEXT.md` | Domain vocabulary — read before renaming anything |
| `AGENTS.md` | Rules for AI agents editing this repo (loaded automatically as a context file) |
| `.omp/skills/` | Built-in project skills: `pi-desktop-feature` (change procedure), `pi-desktop-release` (build/sign/publish) |

## Current state

Git: repository initialized on `main` (initial commit covers the whole tree; `node_modules`,
`dist`, `src-tauri/target`, the staged sidecar, and `dist-updates` are ignored).

Version `0.1.0` in `package.json` and `src-tauri/tauri.conf.json` (they must stay in sync).

**Verified working (real runs, not just tests):**

- macOS arm64: `.app` + `.dmg`, session started against `omp`, approvals, plugins, session resume.
- Linux arm64 (Debian 13 VM): `.deb`, `.rpm`, `.AppImage`; AppImage launched, managed `omp-linux-arm64` downloaded and SHA-256 verified.
- Windows x64 (Windows 11 arm64 VM): NSIS installer, app UI, `bun.bin` extraction, managed `omp.exe`, session whose stderr is surfaced in the error panel.
- Self-update: macOS `.app` replaced itself 0.1.0 → 0.2.0 and relaunched; Linux AppImage replaced in place (hash-verified); Windows NSIS install upgraded 0.1.0 → 0.2.0 in place.
- Themes: nine built-ins (System, Light, Dark, Graphite, Midnight, Aurora, Andromeda, Sand, Mist) plus user packs, selectable as swatches; every palette is contrast-checked and switching persists, verified in the running macOS app.
- Checks: `bun run typecheck`, 58 Vitest tests, 9 Rust tests (3 network tests are `#[ignore]`).

**Not yet done / open:**

- No remote yet: the repository is local (`main`), and CI has never run against it. Before publishing, decide what to do with the test-VM credentials written in `docs/vms.md`.
- CI (`.github/workflows/build.yml`) exists but has never run — needs a remote and the secrets `TAURI_SIGNING_PRIVATE_KEY` / `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`. The matrix builds macOS arm64/x64, Linux x64, Windows x64.
- No Apple/Windows code signing or notarization. Updates are verified with the updater key only.
- Linux `.deb`/`.rpm` installs cannot self-update (updater limitation) — they need a package repository.
- Plugin UI runs unsandboxed in the main webview (CSP allows `eval` for transpiled plugin UI). A worker/iframe sandbox is unbuilt.
- Windows builds here target `x86_64-pc-windows-msvc`; the ARM64-targeting MSVC toolset could not be installed on the ARM VM (details in `docs/vms.md`).
- No provider credentials in the test VMs, so sessions stop with “No default model selected” — expected, not a bug.

## Agent tooling in the repo

`AGENTS.md` is the always-loaded rulebook. Two project skills ship in `.omp/skills/` and are
discovered whenever an agent runs inside the repository (verified by resolving
`skill://pi-desktop-feature` and `skill://pi-desktop-release` from a session at the repo root):

- `pi-desktop-feature` — where a change belongs, how to extend the frame protocol on both
  sides, what to test, how to run and verify, and the common failure modes.
- `pi-desktop-release` — version bump, signed build, feed publishing, per-OS builds, and how to
  prove an update actually installs.

Keep both in sync when the build or protocol procedure changes; they are the agent-facing copy
of `docs/updates.md` and `docs/vms.md`.

## Commands

```sh
bun install
bun run typecheck && bun run test          # 58 Vitest tests
cargo test --manifest-path src-tauri/Cargo.toml
bun run tauri dev                          # dev shell (needs the Vite dev server: bun run dev:web)
bun run build:app                          # bundles + updater artifacts (signs when the key exists)
bun run publish:update --version X --target darwin-aarch64 \
  --artifact "src-tauri/target/release/bundle/macos/Pi Desktop.app" \
  --base-url https://example.com/pi-desktop --feed dist-updates
```

Rules of thumb: run tests before any Rust build (compiles are slow); `bun run stage:sidecar`
clears stale Tauri resource copies that otherwise leak into bundles.

## Environment facts and gotchas

- Updater private key: `~/.Secrets/pi-desktop/updater.key` (never commit or print it). Public key is committed in `src-tauri/tauri.conf.json`. `PI_DESKTOP_SIGNING_KEY` overrides the path; without a key `build:app` still succeeds with updater artifacts disabled.
- Update feeds must be HTTPS in release builds. Windows payloads must be **stored** (uncompressed) zips — the updater's zip reader has no codecs; use `bun run publish:update` rather than `zip`/`7z`.
- `PI_DESKTOP_UPDATE_ENDPOINT`, `PI_DESKTOP_OMP_PATH`, `PI_DESKTOP_PI_PATH`, `PI_DESKTOP_BUN` override feed and binary resolution.
- macOS: launching the `.app` from a TCC-protected folder (`~/Documents`, `~/Desktop`) blocks the sidecar behind a folder-access prompt. Install to `/Applications`.
- Windows: set `RUSTUP_TOOLCHAIN` with `set "VAR=value"` (a trailing space breaks rustup); builds need `vcvarsall.bat arm64_x64`.
- Linux VM: `/tmp` is a 1.5 GB tmpfs; clear it before AppImage builds. The guest has no usable GPU, so run the app with `LIBGL_ALWAYS_SOFTWARE=1 WEBKIT_DISABLE_COMPOSITING_MODE=1 WEBKIT_DISABLE_DMABUF_RENDERER=1`.
- Test VMs and their credentials/commands: `docs/vms.md`. Host helpers live in `~/Parallels/vm-assets/`.
- Diagnostics: per-tab CLI stderr at the app-support `logs` folder (`sidecar-<tab>.log`), update attempts in `updates.log` next to it.
- Runtime floor: omp ≥ 18.12.0, pi ≥ 1.4.0. Managed downloads are pinned to omp 18.12.6 and pi 1.4.0.

## Decisions that constrain future work

- The app drives the CLIs over RPC instead of embedding SDKs (ADR 0002). Do not reintroduce SDK dependencies: the bundle went from ~1.1 GB to ~45 MB (`.app`) / ~32 MB (`.dmg`) because of this.
- Frames between host and sidecar are newline-delimited JSON with runtime guards in `packages/protocol`; extend the guard and its test with any new frame.
- The Bun runtime ships gzipped as `sidecar/bun.bin` and is inflated into the app-support `bin/` folder on first launch. Keep the payload compressed; a raw binary breaks the AppImage bundler.
- Platform directories come from `src-tauri/src/paths.rs` — no ad-hoc `$HOME` concatenation.
- Plugins are user-level only (`~/.pi-desktop/plugins`), never project-level.
- Theme palettes in `src/themes.ts` must satisfy the invariants in `src/themes.test.ts` (all tokens present, dark surfaces lighten as they stack, light insets darken, contrast floors, label colour on accent via `--on-accent`). Never hard-code `text-white` on an accent surface.
- Base element styles in `src/styles/tokens.css` live inside `@layer base`; unlayered rules there outrank Tailwind utilities and silently drop classes like `text-[var(--muted)]` on buttons and inputs.
- Vocabulary in `CONTEXT.md` is authoritative (harness, backend, sidecar, host, frame, runtime, session, tab, workspace, transcript).

## Maintenance rule

Update this file in the same change whenever you: add or remove a verified capability, change
a command, learn a new environment gotcha, or open/close an item in “Not yet done”. Keep
“Current state” evidence-based — only claim what was actually run.
