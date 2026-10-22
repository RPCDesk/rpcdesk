import { describe, expect, it } from "vitest";
import {
  classifyTier,
  createPiGate,
  decideApproval,
  type GateState,
  type PiGateApi,
  type PiGateEvent,
} from "./approval";

describe("classifyTier", () => {
  it("maps known read, write, and exec tools", () => {
    expect(classifyTier("read")).toBe("read");
    expect(classifyTier("grep")).toBe("read");
    expect(classifyTier("write")).toBe("write");
    expect(classifyTier("edit")).toBe("write");
    expect(classifyTier("bash")).toBe("exec");
    expect(classifyTier("mcp__unknown")).toBe("exec");
  });
});

describe("decideApproval", () => {
  const base = { grantKey: "bash:*", grants: new Set<string>() };

  it("allows everything in yolo", () => {
    expect(decideApproval({ ...base, mode: "yolo", fallback: "write", tier: "exec" })).toBe(
      "allow",
    );
  });

  it("allows writes but prompts exec in write mode", () => {
    expect(decideApproval({ ...base, mode: "write", fallback: "write", tier: "write" })).toBe(
      "allow",
    );
    expect(decideApproval({ ...base, mode: "write", fallback: "write", tier: "exec" })).toBe(
      "prompt",
    );
  });

  it("prompts writes and exec in always-ask", () => {
    expect(
      decideApproval({ ...base, mode: "always-ask", fallback: "write", tier: "write" }),
    ).toBe("prompt");
    expect(
      decideApproval({ ...base, mode: "always-ask", fallback: "write", tier: "exec" }),
    ).toBe("prompt");
  });

  it("uses the fallback for follow-cli", () => {
    expect(
      decideApproval({ ...base, mode: "follow-cli", fallback: "write", tier: "write" }),
    ).toBe("allow");
    expect(
      decideApproval({ ...base, mode: "follow-cli", fallback: "write", tier: "exec" }),
    ).toBe("prompt");
  });

  it("allows a granted exec call", () => {
    expect(
      decideApproval({
        ...base,
        grants: new Set(["bash:*"]),
        mode: "write",
        fallback: "write",
        tier: "exec",
      }),
    ).toBe("allow");
  });
});

describe("createPiGate", () => {
  function harness(state: GateState, choice: string | undefined) {
    let handler:
      | ((event: PiGateEvent, context: { ui?: { select: () => Promise<string | undefined> } }) => Promise<unknown>)
      | undefined;
    const pi: PiGateApi = {
      on(_event, callback) {
        handler = callback as never;
      },
    };
    createPiGate(state)(pi);
    const context = {
      ui: { select: async () => choice },
    };
    return async (event: PiGateEvent) => handler!(event, context);
  }

  it("prompts once, then remembers the session grant", async () => {
    const state: GateState = { mode: "write", fallback: "write", grants: new Set() };
    const run = harness(state, "Allow for this session");
    expect(await run({ toolName: "bash", input: {} })).toBeUndefined();
    expect(await run({ toolName: "bash", input: {} })).toBeUndefined();
    expect(state.grants.has("bash:*")).toBe(true);
  });

  it("blocks on reject", async () => {
    const state: GateState = { mode: "write", fallback: "write", grants: new Set() };
    const run = harness(state, "Reject");
    expect(await run({ toolName: "bash", input: {} })).toEqual({
      block: true,
      reason: "Rejected in Pi Desktop",
    });
  });

  it("fails closed without a UI", async () => {
    let handler: ((event: PiGateEvent, context: object) => Promise<unknown>) | undefined;
    createPiGate({ mode: "write", fallback: "write", grants: new Set() })({
      on(_event, callback) {
        handler = callback as never;
      },
    });
    expect(await handler!({ toolName: "bash", input: {} }, {})).toEqual({
      block: true,
      reason: "No approval UI",
    });
  });
});
