import { describe, expect, it } from "vitest";
import {
  initialTranscript,
  reduceTranscript,
  seedTranscript,
} from "./transcript";

describe("seedTranscript", () => {
  it("hydrates user, assistant, and tool results", () => {
    const state = seedTranscript([
      { role: "user", content: "hello" },
      {
        role: "assistant",
        content: [
          { type: "text", text: "checking" },
          { type: "toolCall", id: "t1", name: "read", arguments: { path: "a" } },
        ],
      },
      { role: "toolResult", toolCallId: "t1", content: [{ type: "text", text: "done" }] },
    ]);
    expect(state.entries.map((entry) => entry.kind)).toEqual([
      "user",
      "assistant",
      "tool",
    ]);
    const tool = state.entries[2];
    expect(tool.kind).toBe("tool");
    if (tool.kind === "tool") {
      expect(tool.status).toBe("ok");
      expect(tool.result).toBeDefined();
    }
  });
});

describe("reduceTranscript", () => {
  it("streams text and thinking deltas", () => {
    let state = initialTranscript();
    state = reduceTranscript(state, {
      type: "message_start",
      message: { role: "assistant" },
    });
    state = reduceTranscript(state, {
      type: "message_update",
      assistantMessageEvent: { type: "text_delta", delta: "hel" },
    });
    state = reduceTranscript(state, {
      type: "message_update",
      assistantMessageEvent: { type: "thinking_delta", delta: "think" },
    });
    const entry = state.entries[0];
    expect(entry.kind).toBe("assistant");
    if (entry.kind === "assistant") {
      expect(entry.text).toBe("hel");
      expect(entry.thinking).toBe("think");
      expect(entry.streaming).toBe(true);
    }
  });

  it("replaces a streamed message with the authoritative one", () => {
    let state = initialTranscript();
    state = reduceTranscript(state, {
      type: "message_start",
      message: { role: "assistant" },
    });
    state = reduceTranscript(state, {
      type: "message_end",
      message: { role: "assistant", content: [{ type: "text", text: "final" }] },
    });
    const entry = state.entries[0];
    if (entry.kind === "assistant") {
      expect(entry.text).toBe("final");
      expect(entry.streaming).toBe(false);
    }
  });

  it("tracks tool lifecycle and diff", () => {
    let state = initialTranscript();
    state = reduceTranscript(state, {
      type: "tool_execution_start",
      toolCallId: "t1",
      toolName: "edit",
      args: { path: "a" },
    });
    state = reduceTranscript(state, {
      type: "tool_execution_end",
      toolCallId: "t1",
      result: "ok",
    });
    state = reduceTranscript(state, {
      type: "diff",
      toolCallId: "t1",
      path: "a",
      patch: "+new",
      added: 1,
      removed: 0,
    });
    const entry = state.entries[0];
    if (entry.kind === "tool") {
      expect(entry.status).toBe("ok");
      expect(entry.diff?.added).toBe(1);
    }
  });

  it("keeps running when agent_end is non-terminal", () => {
    let state = reduceTranscript(initialTranscript(), { type: "agent_start" });
    state = reduceTranscript(state, { type: "agent_end", isTerminal: false });
    expect(state.running).toBe(true);
    state = reduceTranscript(state, { type: "agent_end", isTerminal: true });
    expect(state.running).toBe(false);
  });

  it("adds a user entry for user message starts", () => {
    const state = reduceTranscript(initialTranscript(), {
      type: "message_start",
      message: {
        role: "user",
        content: [{ type: "text", text: "hello" }],
      },
    });
    expect(state.entries).toEqual([
      expect.objectContaining({ kind: "user", text: "hello" }),
    ]);
  });

  it("adds system notices", () => {
    const state = reduceTranscript(initialTranscript(), {
      type: "notice",
      level: "warning",
      message: "Careful",
    });
    expect(state.entries[0]).toMatchObject({ kind: "system", tone: "warning" });
  });

  it("ignores xdev mount inventory notices", () => {
    const state = reduceTranscript(initialTranscript(), {
      type: "notice",
      level: "info",
      message: "xd://: mounted mcp__cloudflare_docs",
    });
    expect(state.entries).toHaveLength(0);
  });
});
