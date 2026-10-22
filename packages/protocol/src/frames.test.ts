import { describe, expect, it } from "vitest";
import { parseHostFrame, parseSidecarFrame } from "./index";

describe("parseHostFrame", () => {
  it("parses a prompt and strips a trailing CR", () => {
    const result = parseHostFrame(
      '{"type":"prompt","id":"p1","text":"hello","behavior":"steer"}\r',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.frame.type).toBe("prompt");
      if (result.frame.type === "prompt") {
        expect(result.frame.behavior).toBe("steer");
      }
    }
  });

  it("rejects malformed JSON", () => {
    expect(parseHostFrame("{").ok).toBe(false);
  });

  it("rejects an unknown frame type", () => {
    expect(parseHostFrame('{"type":"nope","id":"1"}').ok).toBe(false);
  });

  it("rejects a prompt without text", () => {
    expect(parseHostFrame('{"type":"prompt","id":"1"}').ok).toBe(false);
  });

  it("rejects an invalid thinking level", () => {
    expect(
      parseHostFrame('{"type":"set_thinking","id":"1","level":"ultra"}').ok,
    ).toBe(false);
  });

  it("accepts an approval response", () => {
    const result = parseHostFrame(
      '{"type":"dialog_response","id":"d1","answer":"session"}',
    );
    expect(result.ok).toBe(true);
  });

  it("accepts shutdown without an id", () => {
    expect(parseHostFrame('{"type":"shutdown"}').ok).toBe(true);
  });
});

describe("parseSidecarFrame", () => {
  it("parses a ready snapshot", () => {
    const result = parseSidecarFrame(
      JSON.stringify({
        type: "ready",
        snapshot: {
          backend: "omp",
          cwd: "/tmp",
          title: "New session",
          thinkingLevel: "medium",
          models: [],
          messages: [],
          commands: [],
          approvalMode: "follow-cli",
          effectiveApproval: { mode: "write", source: "cli" },
        },
      }),
    );
    expect(result.ok).toBe(true);
  });

  it("rejects a failed response without an error", () => {
    expect(
      parseSidecarFrame('{"type":"response","id":"1","ok":false}').ok,
    ).toBe(false);
  });

  it("rejects an invalid exit code", () => {
    expect(
      parseSidecarFrame('{"type":"exit","code":"zero"}').ok,
    ).toBe(false);
  });

  it("accepts an exit message and rejects a non-string one", () => {
    expect(
      parseSidecarFrame('{"type":"exit","code":1,"message":"no model"}').ok,
    ).toBe(true);
    expect(parseSidecarFrame('{"type":"exit","code":1,"message":2}').ok).toBe(
      false,
    );
  });

  it("accepts an approval dialog", () => {
    const result = parseSidecarFrame(
      JSON.stringify({
        type: "dialog",
        id: "d1",
        kind: "approve",
        prompt: {
          full: "Run bash?",
          compact: "Run bash?",
          session: "Approve bash for this session",
        },
      }),
    );
    expect(result.ok).toBe(true);
  });
});
