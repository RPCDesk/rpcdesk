# CLI RPC bridge instead of embedded SDKs

Pi Desktop now runs the user's installed `omp` or `pi` CLI as a child process in RPC mode, instead of embedding both SDKs in a Bun sidecar. The per-tab Bun process is a thin translation layer: it spawns `omp --mode rpc` or `pi --mode rpc`, initializes a snapshot through `get_state` / `get_available_models` / `get_available_commands` / `get_messages`, and forwards session events and extension UI requests to the existing frame protocol.

## Why

The embedded-SDK design produced a ~1.1 GB application. Almost all of that was optional SDK dependency trees: `onnxruntime-node` (288 MB), `onnxruntime-web` (141 MB), `@oh-my-pi` (208 MB), and `pi-natives` (97 MB). The SDK gave convenient in-process sessions and UI hooks, but the CLI RPC surface exposes the same essentials:

- `omp --mode rpc` and `pi --mode rpc` are long-lived JSONL protocols.
- Streaming events, tool execution, diffs, models, thinking levels, commands, sessions, and extension UI dialogs are all available.
- omp has a built-in approval mode; pi approval is implemented by a small extension passed with `--extension`.

The bridge keeps the app's existing protocol, transcript reducer, dialogs, plugin pipeline, and UI. Only the SDK-specific adapters were removed.

## Runtime resolution

1. Prefer a compatible system CLI (`PI_DESKTOP_OMP_PATH` / `PI_DESKTOP_PI_PATH`, then `~/.local/bin`, `~/.bun/bin`, Homebrew, `/usr/local/bin`, `/usr/bin`).
2. Otherwise use a managed copy under `~/Library/Application Support/Pi Desktop/runtimes/<backend>/<version>/`.
3. If neither exists, the UI offers an explicit download of the official standalone release. Downloads are pinned to a version and verified against a pinned SHA-256 before execution.

Managed runtimes are never installed silently.

## Consequences

- The application bundle drops from ~1.1 GB to ~80 MB (mostly the Bun runtime, shipped as a gzipped `bun.bin` payload and extracted on first launch).
- Authentication, models, tools, sessions, and policy remain owned by the CLIs.
- The app depends on a stable RPC surface and a minimum CLI version (omp 18.12.0, pi 1.4.0).
- The CLI is the source of truth for provider state; Pi Desktop no longer opens SDK sessions in-process.
- Agent plugin extensions are passed to the CLI with `-e`; UI plugins are still transpiled and evaluated by the webview.
- Runtime downloads are opt-in and cover macOS (arm64/x64), Linux (arm64/x64), and Windows (arm64/x64). Linux downloads use the glibc builds. Windows `pi` is a zip with `pi.exe` at the archive root; macOS/Linux `pi` archives use a `pi/` directory, so installation handles both layouts.
- The desktop shell must be built on its target OS; the CI matrix builds macOS arm64/x64, Linux x64, and Windows x64 on native runners.
