import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { SidecarFrame } from "@pi-desktop/protocol";
import { computeDiff, createDiffTracker } from "./diff";

describe("computeDiff", () => {
  it("counts added and removed lines", () => {
    const result = computeDiff("a.txt", "one\ntwo\n", "one\nthree\n");
    expect(result.added).toBe(1);
    expect(result.removed).toBe(1);
    expect(result.patch).toContain("-two");
    expect(result.patch).toContain("+three");
  });

  it("handles a new file", () => {
    const result = computeDiff("new.txt", "", "hello\n");
    expect(result.added).toBe(1);
    expect(result.removed).toBe(0);
  });
});

describe("createDiffTracker", () => {
  it("emits a diff after a tracked write", async () => {
    const directory = await mkdtemp(join(tmpdir(), "pi-desktop-diff-"));
    const file = join(directory, "a.txt");
    await writeFile(file, "old\n");

    let resolveFrame: ((frame: SidecarFrame) => void) | undefined;
    const framePromise = new Promise<SidecarFrame>((resolve) => {
      resolveFrame = resolve;
    });
    const tracker = createDiffTracker((frame) => resolveFrame?.(frame), directory);

    tracker.onEvent({
      type: "tool_execution_start",
      toolName: "write",
      toolCallId: "call-1",
      args: { path: "a.txt" },
    });
    await writeFile(file, "new\n");
    tracker.onEvent({ type: "tool_execution_end", toolCallId: "call-1" });

    const frame = await framePromise;
    expect(frame.type).toBe("diff");
    if (frame.type === "diff") {
      expect(frame.path).toBe("a.txt");
      expect(frame.added).toBe(1);
      expect(frame.removed).toBe(1);
    }
    await rm(directory, { recursive: true, force: true });
  });
});
