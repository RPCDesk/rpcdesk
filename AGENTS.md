# AGENTS.md — editing Pi Desktop

Instructions for AI agents working in this repository. Read `CONTEXT.md` (vocabulary) and
`HANDOFF.md` (current state, open work) first; they outrank memory and guesswork.

## Non-negotiables

- The app is a **shell**: models, credentials, tools, sessions, and policy belong to the
  `omp`/`pi` CLIs. Never add provider SDKs, model calls, or tool execution to this codebase
  (see `docs/adr/0002-cli-rpc-bridge.md`; embedding SDKs previously produced a 1.1 GB app).
- One tab owns exactly one sidecar process and one session. Do not share process state
  between tabs; per-tab isolation is what makes resume and crash recovery work.
- Host ↔ sidecar traffic is newline-delimited JSON. Any new frame goes into
  `packages/protocol/src/index.ts` (type union **and** `parseSidecarFrame` guard) with a
  matching test; a frame without a guard is a rejected frame at runtime.
- Platform directories come from `src-tauri/src/paths.rs`. No `$HOME` string concatenation.
- Version lives in both `package.json` and `src-tauri/tauri.conf.json`; bump both together.
- Never commit secrets. The updater private key stays in `~/.Secrets/pi-desktop/updater.key`;
  the public key in `src-tauri/tauri.conf.json` is public by design.

## Verify, don't assume

A change is not done until the affected path ran for real:

| Change | Required evidence |
| --- | --- |
| UI / state | `bun run typecheck`, `bun run test`, then launch the app and exercise the surface (screenshot or log) |
| Sidecar / protocol | `bun run test` (protocol + sidecar suites), then a real session start against `omp` |
| Rust host | `cargo test --manifest-path src-tauri/Cargo.toml`, then `bun run build:app` and launch the bundle |
| Runtime/updater | Run the built bundle; check the app-support `logs/` folder (`sidecar-<tab>.log`, `updates.log`) |
| Packaging | Build on the target OS (`docs/vms.md` for the Linux/Windows VMs); a cross-build proves nothing |

Rust builds are slow relative to JS: run the JS checks first, and batch Rust rebuilds.

## Architecture in one screen

```
React UI (src/)  ──invoke──▶  Rust host (src-tauri/src/)  ──spawn──▶  Bun sidecar (sidecar/)
      ▲                              │  sidecar.rs                    │
      └────── frames (protocol) ─────┘                                ▼
                                                          omp/pi CLI in RPC mode
```

- `sidecar/src/backends/cli.ts` — CLI process lifecycle, RPC handshake, record → frame mapping.
- `sidecar/src/host.ts` — the frame emitters (`send({ type: … })`) and command dispatch.
- `sidecar/src/cli-process.ts` — child process, stderr tail, shutdown.
- `src/state/tabs.ts` — `applyFrame`, the single place frames mutate tab state.
- `src/state/transcript.ts` — frame → UI entry reduction (pure, unit-tested).
- `src-tauri/src/sidecar.rs` — process supervision, stdio relay, generation-based restart.
- `src-tauri/src/runtime.rs` — CLI discovery and managed downloads (release table + checksums).
- `src-tauri/src/updates.rs` — self-update commands and the `updates.log` trail.

## Recipes

**New frame end to end:** protocol type → guard → test; emit from `sidecar/src/host.ts` (or a
backend); consume in `src/state/tabs.ts` `applyFrame` (or `transcript.ts` if it is transcript
content); add a `transcript.test.ts` case when reduction changes.

**New Rust command:** implement in the owning module (`sidecar`, `runtime`, `updates`,
`user_files`), register in `src-tauri/src/lib.rs` `generate_handler!`, call it through
`src/lib/tauri.ts`; add a Rust unit test for any non-trivial logic (path building, parsing).

**New backend:** add to `BACKENDS` in the protocol package, implement `sidecar/src/backend.ts`,
extend `sidecar/src/backends/`, add the runtime row in `src-tauri/src/runtime.rs`, and teach
`src/state/runtime.ts` about it. Update `CONTEXT.md` if vocabulary changes.

**Plugin surface:** host API types in `src/plugins/api.ts`, registration in
`src/plugins/host.ts`, user plugins in `~/.pi-desktop/plugins` (never project-level). Plugin UI
runs unsandboxed — treat third-party plugin code as trusted only.

**Settings:** add the field to `AppSettings` + `DEFAULT_SETTINGS` in `src/state/settings.ts`
(defaults are merged, so old files keep working), then surface it in `SettingsSheet.tsx`.

## Code conventions

- TypeScript: strict; no `any` in new code; prefer the existing store patterns (Zustand) and
  pure helpers that can be unit-tested without React.
- Rust: `Result<_, String>` at the command boundary, `redact()` for anything logged from the
  CLI, no `.unwrap()` on IO.
- Logs are user-facing: write the failure and how to act on it, not stack traces alone.
- UI text is terse and lowercase-neutral, matching the existing components.

## Docs to keep in sync

`HANDOFF.md` (state + gotchas), `README.md` (user-facing behavior), `docs/updates.md` (update
flow), `docs/vms.md` (VM commands), `CONTEXT.md` (vocabulary). A behavior change without its
doc update is incomplete.

## Skills in this repo

Project skills live in `.omp/skills/` and are discovered automatically when the agent runs
inside this repository:

- `pi-desktop-feature` — implement a feature or bug fix safely.
- `pi-desktop-release` — build, sign, publish, and verify a release.
