# Pi Desktop

Pi Desktop is a macOS, Windows, and Linux front-end for the pi and omp coding-agent harnesses. It renders one persisted agent session per tab and delegates all model, tool, and policy behavior to the selected harness.

## Language

**Harness**:
pi or omp, the agent runtime that owns conversations, models, tools, and policy.
_Avoid_: Agent, engine

**Backend**:
The harness selected for a tab.
_Avoid_: Provider

**Sidecar**:
The per-tab Bun bridge that spawns exactly one CLI in RPC mode and speaks frames to the host.

**Host**:
The Tauri shell plus webview; owns process lifecycle, persistence, and rendering.

**Frame**:
One newline-delimited JSON object exchanged between host and sidecar.

**Runtime**:
The installed or managed `omp`/`pi` CLI executable used by a backend.
_Avoid_: SDK

**Session**:
A persisted conversation stored under `~/.omp/agent/sessions` or `~/.pi/agent/sessions`.
_Avoid_: Conversation, thread

**Tab**:
The UI container bound to one sidecar and one session.

**Workspace**:
The working directory a session runs in.
_Avoid_: Project

**Transcript**:
The ordered UI entries derived from CLI session events.

**Tool card**:
The UI representation of one tool call and its result.

**Tier**:
The capability class of a tool call: `read`, `write`, or `exec`.

**Approval gate**:
The rule set that decides whether a call runs, prompts, or is denied.

**Grant**:
A remembered approval for a tool and target within one session.

**Dialog**:
A prompt requested by a CLI extension UI request and rendered by the host.

**Plugin**:
A user package with an optional UI entry, agent entry, and runtime registrations.

**Slot**:
An extensible UI location: tool renderer, panel, command, or theme.

**Theme**:
A named pack of CSS design tokens.
