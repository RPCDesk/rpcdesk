---
name: pi-desktop-feature
description: Implement a feature, behavior change, or bug fix in the Pi Desktop app (Tauri host + React UI + Bun sidecar). Use when asked to add or change anything in this repository — a frame, a command, a panel, a store, a backend behavior, or a runtime/update tweak — so the change lands on both sides of the protocol and is verified by running the app, not only by tests.
---

# Editing Pi Desktop

Read `AGENTS.md` and `HANDOFF.md` at the repository root first. This skill is the working
procedure; those files hold the invariants and the current state.

## 1. Locate the seam before writing code

| Symptom of the change | Where it lives |
| --- | --- |
| Something the CLI reports | `sidecar/src/backends/cli.ts` → frame in `sidecar/src/host.ts` |
| Something the UI shows | `src/state/tabs.ts` `applyFrame` or `src/state/transcript.ts` |
| A pure projection (entries, diffs, formatting) | `src/state/*.ts` helper with a test |
| A native capability (files, processes, network) | `src-tauri/src/<module>.rs` + `lib.rs` handler |
| A CLI binary or version | `src-tauri/src/runtime.rs` release table |
| Startup/teardown behavior | `src-tauri/src/sidecar.rs`, `sidecar/src/main.ts` |
| User preference | `src/state/settings.ts` + `SettingsSheet.tsx` |
| Third-party surface | `src/plugins/*`, `sidecar/src/plugins.ts` |

Confirm with `grep`/`lsp` that the symbol you plan to extend has no other callers
(`xd://lsp` references for exported symbols) before changing its shape.

## 2. Change both sides of the protocol

A new or changed frame touches, in order:

1. `packages/protocol/src/index.ts` — add to the `SidecarFrame` union and `parseSidecarFrame`,
   with a rejection case for malformed input.
2. `packages/protocol/src/frames.test.ts` — accept and reject cases.
3. Emitter: `sidecar/src/host.ts` (`send({ type: … })`) or the backend that owns the data.
4. Consumer: `src/state/tabs.ts` `applyFrame`; add a `transcript.test.ts` case when the
   reduction changes.
5. Any Rust relay assumptions (`src-tauri/src/sidecar.rs` passes lines through verbatim; only
   touch it if the transport changes).

Frames must stay JSON-serializable and small: send ids and deltas, not whole transcripts.

## 3. Implement with the existing patterns

- Stores are Zustand slices in `src/state/`; components subscribe with selectors.
- Pure logic goes in plain functions so it is testable without rendering.
- Rust commands return `Result<T, String>`, register in `lib.rs`, and log through `redact()`.
- Reuse `paths.rs` for directories and `src/lib/tauri.ts` for invocations; do not invent a
  second calling convention.
- Keep the app a shell: no model calls, no tool execution, no credential handling.

## 4. Test what can break

Write a test when the change has a boundary, an invariant, a precedence rule, or a failure
path — protocol guards, transcript reduction, path/version parsing, approval decisions,
update-mode policy. Do not write tests that restate wiring.

```sh
bun run typecheck
bun run test                      # protocol, sidecar, UI stores
cargo test --manifest-path src-tauri/Cargo.toml
```

## 5. Run the thing

Tests are not proof. Exercise the changed surface in a real build:

```sh
bun run dev:web        # terminal 1
bun run tauri dev      # terminal 2, uses the dev server
# or
bun run build:app && open "src-tauri/target/release/bundle/macos/Pi Desktop.app"
```

Check the logs when behavior is unclear:

- `~/Library/Logs/Pi Desktop/sidecar-<tab>.log` (CLI stderr per tab)
- `~/Library/Logs/Pi Desktop/updates.log` (update attempts)
- Windows/Linux: the same files inside the app-support `logs` folder.

The test VMs have no provider credentials, so sessions stop at “No default model selected” —
that is the expected CLI behavior, not a regression. Set a dummy `OPENAI_API_KEY` to get past it.

## 6. Close out

- Update `HANDOFF.md` (state, gotchas, open items), `README.md` if user-facing behavior
  changed, and `CONTEXT.md` if vocabulary changed.
- Bump `package.json` **and** `src-tauri/tauri.conf.json` together for a release-worthy change.
- Commit with a message that states the behavior change and the verification performed.
- Report exactly which checks ran; never claim a platform was verified unless it was built and
  launched there.

## Common failure modes

| Symptom | Cause |
| --- | --- |
| Frame rejected, tab shows protocol error | Guard added to the union but not to `parseSidecarFrame` (or vice versa) |
| Sidecar exits during startup | CLI not installed/authenticated — the stderr tail is surfaced in the error panel |
| Sidecar starts then hangs | Two writers on stdin, or a command awaiting a response nobody sends |
| Bundle ships stale sidecar code | Run `bun run stage:sidecar`; the Tauri resource copy is not rebuilt automatically |
| App window blank after launch | Webview blocked (macOS TCC folder prompt, Linux GPU flags) — see `docs/vms.md` |
| Update install fails | Feed must be HTTPS; Windows payloads must be stored zips (`bun run publish:update`) |
