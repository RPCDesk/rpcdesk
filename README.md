# Pi Desktop

A macOS, Windows, and Linux desktop front-end for the [pi](https://pi.dev) and [omp](https://omp.sh) coding-agent harnesses. Each tab owns one persisted agent session, rendered as a chat transcript with streaming text, thinking, tool cards, diffs, approvals, and session resume.

Pi Desktop is a thin shell around the installed CLIs, not a replacement for them. Models, credentials, tools, sessions, and policy remain owned by pi/omp.

Pi Desktop prefers an installed `omp` or `pi` and only offers to download an official standalone build when neither is found. Managed downloads cover omp 18.12.6 and pi 1.4.0 on macOS, Linux, and Windows (arm64 and x64). CI currently produces macOS arm64/x64, Linux x64, and Windows x64 bundles; the runtime resolver also supports arm64 Linux and Windows. The app bundle is ~80 MB, not ~1 GB: the SDK dependency trees are no longer embedded.

## Architecture

```
React webview (Tauri)
  │  newline-delimited JSON frames
  ▼
Rust host (runtime resolution, downloads, process lifecycle)
  │  stdin/stdout frames
  ▼
Bun bridge (one per tab)
  │  JSONL RPC
  ▼
omp --mode rpc   or   pi --mode rpc
```

- **`src/`** — React UI, Zustand stores, transcript reducer, plugin host.
- **`sidecar/`** — thin Bun bridge that spawns one CLI in RPC mode and translates its records to the app frame protocol.
- **`packages/protocol/`** — shared frame/snapshot types and runtime frame guards.
- **`src-tauri/`** — Tauri shell, CLI runtime resolution/downloads, sidecar supervision, settings/UI-state persistence, config watcher.
- **`docs/adr/0002-cli-rpc-bridge.md`** — why the SDK sidecars were replaced by CLI RPC.

Frames are small JSON objects. Host → sidecar: `prompt`, `abort`, `set_model`, `set_thinking`, `set_approval_mode`, `fork`, `list_sessions`, `dialog_response`, `composer_text`, `shutdown`. Sidecar → host: `ready`, `response`, `event`, `dialog`, `notify`, `status`, `title`, `composer`, `diff`, `fatal`, `exit`.

Working notes for the next contributor (current state, gotchas, open work) live in
[HANDOFF.md](HANDOFF.md).

## Development

Requirements: [Bun](https://bun.sh) 1.3+, Rust stable, and the platform toolchain:

- macOS 12+ with Xcode command-line tools.
- Windows 10/11 with the MSVC toolchain and WebView2.
- Linux with `webkit2gtk-4.1`, `libappindicator`, `librsvg`, `libssl`, `patchelf`, and a C toolchain.

```sh
bun install
bun run tauri dev
```

The dev shell uses the local Bun binary and `sidecar/src/main.ts`; no staging step is needed. It resolves `omp`/`pi` from `PATH`, then the usual per-user install folders (`~/.local/bin`, `~/.bun/bin`, Homebrew, npm). `bun run dev:web` starts only the Vite frontend for browser work (Tauri calls will report unavailable).

Useful checks:

```sh
bun run typecheck
bun run test
bun run build:web
cargo test --manifest-path src-tauri/Cargo.toml
```

## Testing on real platforms

`docs/vms.md` documents the local Parallels VMs (Debian 13 arm64 and Windows 11 ARM64) used to build and exercise the Linux and Windows paths, including the preseeded Debian ISO and the Windows unattended answer file.

## Packaging

```sh
bun run build:app
```

`build:app` runs the Tauri production build, which first builds the web bundle and stages a self-contained bridge under `src-tauri/resources/sidecar`:

- copies `sidecar/src` and `package.json`;
- installs the small production bridge dependency (`diff`);
- copies the shared `@pi-desktop/protocol` package into the staged `node_modules`;
- gzips the Bun runtime (`process.execPath`) into `sidecar/bun.bin`; the app extracts it to the app support `bin/` folder on first launch.

Platform bundles are:

- macOS: `.app` + `.dmg`
- Windows: NSIS `.exe`
- Linux: `.deb`, `.rpm`, and `.AppImage`

The resulting bundle is about 80 MB (42 MB on disk for the `.app`); it does not bundle omp or pi, which are resolved at runtime. Builds are unsigned; local builds are for development.

On macOS, install the bundle somewhere outside a TCC-protected folder. Running it straight from `~/Documents` or `~/Desktop` makes macOS ask for folder access, which blocks the sidecar while the prompt is unanswered.

The GitHub Actions matrix in `.github/workflows/build.yml` builds macOS arm64/x64, Linux x64, and Windows x64 on native runners and uploads the bundles. Cross-compiling the desktop shell is not supported locally; use the native runner (or a VM) for each OS.

Local verification so far: macOS arm64 (`app` + `dmg`), Debian 13 arm64 (`deb`, `rpm`, `AppImage`), and Windows 11 arm64 (NSIS) — see `docs/vms.md`.

## Configuration

| Path | Purpose |
| --- | --- |
| `~/.pi-desktop/settings.json` | App defaults: backend, approval mode/fallback, theme, restore tabs, update mode/feed |
| `~/.pi-desktop/plugins/` | User plugins, one directory each |
| `~/.pi-desktop/plugins.json` | Plugin enable/disable state |
| `~/.pi-desktop/themes/` | JSON theme packs |
| App support `ui-state.json` | Open tabs and active tab |
| App support `runtimes/` | Optional managed CLI downloads |
| App support `bin/` | Extracted Bun runtime used by the bridge |
| App support `logs/` (Windows/Linux) | Per-tab sidecar stderr logs |

App support locations:

- macOS: `~/Library/Application Support/Pi Desktop`, logs in `~/Library/Logs/Pi Desktop`
- Windows: `%LOCALAPPDATA%\Pi Desktop`, logs in `%LOCALAPPDATA%\Pi Desktop\logs`
- Linux: `$XDG_DATA_HOME/pi-desktop` or `~/.local/share/pi-desktop`, logs in `$XDG_STATE_HOME/pi-desktop/logs` or `~/.local/state/pi-desktop/logs`

Set `PI_DESKTOP_OMP_PATH` or `PI_DESKTOP_PI_PATH` to force a specific CLI binary. Otherwise Pi Desktop searches `PATH`, then `~/.local/bin`, `~/.bun/bin`, Homebrew, `/usr/local/bin`, and the Windows npm/Programs folders.

omp settings remain in `~/.omp`; pi settings and sessions remain in `~/.pi`.

## Approvals

- omp reads `tools.approvalMode` from its config when the app mode is **Follow CLI**.
- pi has no CLI approval policy, so **Follow CLI** uses the app fallback.
- App modes: **Always ask**, **Write** (auto-allow writes, ask for exec), **Yolo**.
- Tool tiers are classified in `sidecar/src/approval.ts`: reads auto-allow; writes/exec prompt depending on mode.
- omp approval prompts arrive as RPC extension UI `select` requests and render in the app.
- pi tool calls are gated by `sidecar/src/extensions/pi-gate.js`, loaded with `--extension`, which asks through the same dialog bridge.
- Changing the omp mode restarts its CLI with the new `--approval-mode`; pi reloads its gate config file.

## Plugins

A plugin is a directory under `~/.pi-desktop/plugins` with a `plugin.json` and optional UI/agent entries. Use **Plugins → Create example** to generate one.

```json
{
  "id": "hello-world",
  "name": "Hello World",
  "version": "0.1.0",
  "description": "Example",
  "ui": "ui.tsx",
  "agent": "agent.ts"
}
```

`ui.tsx` is transpiled by Bun in the sidecar and evaluated in the webview. It exports a function receiving an API with:

- `registerToolRenderer(toolName, component)`
- `registerPanel({ id, title, component, location })`
- `registerCommand({ name, title, run })`
- `registerTheme({ id, name, appearance, tokens })`
- `onSessionEvent(listener)`, `getSession()`, `prompt(text)`
- `React`

`agent.ts` exports a function receiving the pi/omp extension API. Its path is passed to the CLI with `-e` when a sidecar starts, so agent changes apply to new or restarted sessions. UI changes reload immediately.

Plugins are trusted local code. The webview CSP allows `unsafe-eval` specifically to evaluate transpiled plugin UI; do not install untrusted plugins.

## Updates

Pi Desktop can update itself from a signed release feed. Settings → Updates chooses the mode:

- **Off** — never checks automatically.
- **Check and ask** (default) — checks at startup and shows an *Install and restart* banner.
- **Install automatically** — installs the new version at startup and restarts.

The feed URL comes from the settings field, or `PI_DESKTOP_UPDATE_ENDPOINT` when the field is
empty. Releases must be signed with the updater key; the public key is committed in
`src-tauri/tauri.conf.json`. `bun run build:app` signs automatically when
`~/.Secrets/pi-desktop/updater.key` exists and otherwise builds without updater artifacts.
See `docs/updates.md` for the manifest format, CI secrets, and per-platform behaviour. `bun run publish:update` packages, signs, and merges a release into a feed directory.

## Current limitations

- pi and omp use the credentials already configured for their CLIs; without a model the onboarding panel points at provider docs.
- The RPC surface is version-sensitive: Pi Desktop requires omp >= 18.12.0 or pi >= 1.4.0.
- No Apple/Windows code signing or notarization; updates are verified with the updater key, not with platform signing.
- Plugin UI is evaluated in the main webview, not sandboxed in a worker or iframe.
- Linux runtime downloads use the glibc builds; Alpine/musl users should install a compatible CLI themselves.
