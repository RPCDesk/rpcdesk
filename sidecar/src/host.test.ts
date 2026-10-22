import { describe, expect, it } from "vitest";
import type {
  ApprovalMode,
  SessionInfo,
  SessionSnapshot,
  ThinkingLevel,
} from "@pi-desktop/protocol";
import type { AgentBackend } from "./backend";
import { createHost } from "./host";

class FakeBackend implements AgentBackend {
  calls: string[] = [];
  disposed = false;
  listeners = new Set<(event: unknown) => void>();
  snapshot: SessionSnapshot = {
    backend: "omp",
    cwd: "/tmp",
    title: "Test",
    thinkingLevel: "medium",
    models: [],
    messages: [],
    commands: [],
    approvalMode: "follow-cli",
    effectiveApproval: { mode: "write", source: "cli" },
  };
  sessions: SessionInfo[] = [];

  async start() {
    return this.snapshot;
  }
  async prompt(text: string, behavior?: "steer" | "follow-up") {
    this.calls.push(`prompt:${text}:${behavior ?? "none"}`);
  }
  async abort() {
    this.calls.push("abort");
  }
  async setModel(provider: string, id: string) {
    this.calls.push(`model:${provider}/${id}`);
  }
  async setThinking(level: ThinkingLevel) {
    this.calls.push(`thinking:${level}`);
  }
  async setApprovalMode(mode: ApprovalMode) {
    this.calls.push(`approval:${mode}`);
  }
  async fork() {
    return "/tmp/fork.jsonl";
  }
  async listSessions() {
    return this.sessions;
  }
  async dispose() {
    this.disposed = true;
  }
  onEvent(listener: (event: unknown) => void) {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }
  emit(event: unknown) {
    for (const listener of this.listeners) listener(event);
  }
}

function harness() {
  const backend = new FakeBackend();
  const frames: unknown[] = [];
  const dialogs = {
    handled: [] as unknown[],
    cancelled: false,
    composer: "",
    handleResponse(frame: unknown) {
      this.handled.push(frame);
    },
    cancelAll() {
      this.cancelled = true;
    },
    setComposerText(text: string) {
      this.composer = text;
    },
  };
  let shutdown = false;
  const host = createHost({
    backend,
    send: (frame) => frames.push(frame),
    dialogs,
    cwd: "/tmp",
    onShutdown: () => {
      shutdown = true;
    },
  });
  return { backend, frames, dialogs, host, shutdown: () => shutdown };
}

describe("createHost", () => {
  it("emits ready and forwards events", async () => {
    const { backend, frames, host } = harness();
    await host.start();
    expect(frames[0]).toMatchObject({ type: "ready" });
    backend.emit({ type: "agent_start" });
    expect(frames.at(-1)).toEqual({ type: "event", event: { type: "agent_start" } });
  });

  it("acknowledges a prompt and dispatches it", async () => {
    const { backend, frames, host } = harness();
    await host.start();
    await host.handleFrame({
      type: "prompt",
      id: "p1",
      text: "hello",
      behavior: "steer",
    });
    expect(frames.at(-1)).toEqual({ type: "response", id: "p1", ok: true });
    await Promise.resolve();
    expect(backend.calls).toContain("prompt:hello:steer");
  });

  it("routes settings and session listing", async () => {
    const { backend, frames, host } = harness();
    backend.sessions = [
      { path: "/tmp/a.jsonl", id: "a", title: "A", updatedAt: 1, cwd: "/tmp" },
    ];
    await host.start();
    await host.handleFrame({ type: "set_model", id: "m", provider: "p", modelId: "i" });
    await host.handleFrame({ type: "set_thinking", id: "t", level: "high" });
    await host.handleFrame({ type: "set_approval_mode", id: "a", mode: "yolo" });
    await host.handleFrame({ type: "list_sessions", id: "l" });
    expect(backend.calls).toEqual([
      "model:p/i",
      "thinking:high",
      "approval:yolo",
    ]);
    expect(frames.at(-1)).toMatchObject({
      type: "response",
      id: "l",
      ok: true,
      data: { sessions: backend.sessions },
    });
  });

  it("forwards dialog responses and composer text", async () => {
    const { dialogs, host } = harness();
    await host.start();
    await host.handleFrame({
      type: "dialog_response",
      id: "d1",
      value: "ok",
    });
    await host.handleFrame({ type: "composer_text", text: "draft" });
    expect(dialogs.handled).toEqual([
      { type: "dialog_response", id: "d1", value: "ok" },
    ]);
    expect(dialogs.composer).toBe("draft");
  });

  it("disposes the backend on shutdown", async () => {
    const { backend, host, shutdown } = harness();
    await host.start();
    await host.handleFrame({ type: "shutdown" });
    expect(backend.disposed).toBe(true);
    expect(shutdown()).toBe(true);
  });
});
