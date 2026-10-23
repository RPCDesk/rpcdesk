# rpcdesk

**Site:** [rpcdesk.pages.dev](https://rpcdesk.pages.dev) · **Source:** [github.com/RPCDesk/rpcdesk](https://github.com/RPCDesk/rpcdesk) · **Releases:** [latest](https://github.com/RPCDesk/rpcdesk/releases/latest)

[![Build desktop bundles](https://github.com/RPCDesk/rpcdesk/actions/workflows/build.yml/badge.svg)](https://github.com/RPCDesk/rpcdesk/actions/workflows/build.yml)

A macOS, Windows, and Linux desktop front-end for the [pi](https://pi.dev) and [omp](https://omp.sh) coding-agent harnesses. Each tab owns one persisted agent session, rendered as a chat transcript with streaming text, thinking, tool cards, diffs, approvals, and session resume.

rpcdesk is a thin shell around the installed CLIs, not a replacement for them. Models, credentials, tools, sessions, and policy remain owned by pi/omp.

rpcdesk prefers an installed `omp` or `pi` and only offers to download an official standalone build when neither is found. Managed downloads cover omp 18.12.6 and pi 1.4.0 on macOS, Linux, and Windows (arm64 and x64). CI currently produces macOS arm64/x64, Linux x64, and Windows x64 bundles; the runtime resolver also supports arm64 Linux and Windows. The app bundle is ~45 MB on disk (32 MB dmg), not ~1 GB: the SDK dependency trees are no longer embedded.

## Related repositories

| Repository | Purpose |
| --- | --- |
| [RPCDesk/website](https://github.com/RPCDesk/website) | The static site (`rpcdesk.pages.dev`), deployed to Cloudflare Pages on push |
| [RPCDesk/issues](https://github.com/RPCDesk/issues) | Public issue tracker — bugs, feature requests, questions |

Security problems go through this repository's
[Security tab](https://github.com/RPCDesk/rpcdesk/security/advisories/new), never a public issue.

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
[HANDOFF.md](HANDOFF.md). Agents editing this repository should start from [AGENTS.md](AGENTS.md);
built-in project skills live in `.omp/skills/` (`rpcdesk-feature`, `rpcdesk-release`).

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
- copies the shared `@rpcdesk/protocol` package into the staged `node_modules`;
- gzips the Bun runtime (`process.execPath`) into `sidecar/bun.bin`; the app extracts it to the app support `bin/` folder on first launch.

Platform bundles are:

- macOS: `.app` + `.dmg`
- Windows: NSIS `.exe`
- Linux: `.deb`, `.rpm`, and `.AppImage`

The resulting bundle is about 45 MB on disk for the `.app` (32 MB dmg); it does not bundle omp or pi, which are resolved at runtime. Bundles are signed for the updater; Apple/Windows code signing is not configured yet.

On macOS, install the bundle somewhere outside a TCC-protected folder. Running it straight from `~/Documents` or `~/Desktop` makes macOS ask for folder access, which blocks the sidecar while the prompt is unanswered.

The GitHub Actions matrix in `.github/workflows/build.yml` builds macOS arm64/x64, Linux x64, and Windows x64 on native runners and uploads the bundles. Cross-compiling the desktop shell is not supported locally; use the native runner (or a VM) for each OS.

Local verification so far: macOS arm64 (`app` + `dmg`), Debian 13 arm64 (`deb`, `rpm`, `AppImage`), and Windows 11 arm64 (NSIS) — see `docs/vms.md`.

## Themes

Settings → Appearance offers swatch previews for the built-in palette:

| Theme | Look |
| --- | --- |
| System | Follows the OS light/dark preference |
| Light / Dark | The original neutral macOS palette |
| Graphite | Near-black with a violet accent |
| Midnight | Deep navy with a sky-blue accent |
| Aurora | Ink blue with a periwinkle accent |
| Andromeda | Slate blue with a cyan accent |
| Sand | Warm paper with a terracotta accent |
| Mist | Cool gray with a teal accent |

Themes are plain token maps (`src/themes.ts`), so a theme can be validated by the same
contrast rules the built-ins follow (text ≥ 7:1 on background, muted text ≥ 4.5:1, accents
≥ 3:1, and labels ≥ 4.5:1 against their accent). Selecting a theme also sets `color-scheme`, so
native scrollbars, selects, and checkboxes match it. User theme packs in
`~/.rpcdesk/themes/` appear in the same picker.

Light/dark are first-class: the default is System (follow the OS), and the sun/moon button in
the status bar cycles system → light → dark without opening Settings. A named palette returns
to System on the first press (`src/state/appearance.ts`).

### Design system

One radius scale (`6 / 8 / 12 / 16 / 20 / 24 / 28px`) and one shadow scale live in
`src/styles/tokens.css` under `@theme`, so `rounded-md`, `rounded-xl`, `shadow-md` and friends
resolve to the same values everywhere. Surfaces stack in three layers — page (`--bg`), panels
(`--surface`, used by the sidebar and inspector), and insets (`--surface-2/3`, used by section
cards and code blocks) — and the focus ring, scrollbar, and selection colors come from the
accent rather than the browser defaults.

## Configuration

| Path | Purpose |
| --- | --- |
| `~/.rpcdesk/settings.json` | App defaults: backend, approval mode/fallback, theme, restore tabs, update mode/feed |
| `~/.rpcdesk/plugins/` | User plugins, one directory each |
| `~/.rpcdesk/plugins.json` | Plugin enable/disable state |
| `~/.rpcdesk/themes/` | JSON theme packs |
| App support `ui-state.json` | Open tabs and active tab |
| App support `runtimes/` | Optional managed CLI downloads |
| App support `bin/` | Extracted Bun runtime used by the bridge |
| App support `logs/` (Windows/Linux) | Per-tab sidecar stderr logs |

App support locations:

- macOS: `~/Library/Application Support/rpcdesk`, logs in `~/Library/Logs/rpcdesk`
- Windows: `%LOCALAPPDATA%\rpcdesk`, logs in `%LOCALAPPDATA%\rpcdesk\logs`
- Linux: `$XDG_DATA_HOME/rpcdesk` or `~/.local/share/rpcdesk`, logs in `$XDG_STATE_HOME/rpcdesk/logs` or `~/.local/state/rpcdesk/logs`

Set `RPCDESK_OMP_PATH` or `RPCDESK_PI_PATH` to force a specific CLI binary. Otherwise rpcdesk searches `PATH`, then `~/.local/bin`, `~/.bun/bin`, Homebrew, `/usr/local/bin`, and the Windows npm/Programs folders.

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

A plugin is a directory under `~/.rpcdesk/plugins` with a `plugin.json` and optional UI/agent entries. Use **Plugins → Create example** to generate one.

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

rpcdesk can update itself from a signed release feed. Settings → Updates chooses the mode:

- **Off** — never checks automatically.
- **Check and ask** (default) — checks at startup and shows an *Install and restart* banner.
- **Install automatically** — installs the new version at startup and restarts.

The feed URL comes from the settings field, or `RPCDESK_UPDATE_ENDPOINT` when the field is
empty. Releases must be signed with the updater key; the public key is committed in
`src-tauri/tauri.conf.json`. `bun run build:app` signs automatically when
`~/.Secrets/rpcdesk/updater.key` exists and otherwise builds without updater artifacts.
See `docs/updates.md` for the manifest format, CI secrets, and per-platform behaviour. `bun run publish:update` packages, signs, and merges a release into a feed directory.

## Current limitations

- pi and omp use the credentials already configured for their CLIs; without a model the onboarding panel points at provider docs.
- The RPC surface is version-sensitive: rpcdesk requires omp >= 18.12.0 or pi >= 1.4.0.
- No Apple/Windows code signing or notarization; updates are verified with the updater key, not with platform signing.
- Plugin UI is evaluated in the main webview, not sandboxed in a worker or iframe.
- Linux runtime downloads use the glibc builds; Alpine/musl users should install a compatible CLI themselves.
