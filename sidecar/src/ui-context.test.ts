import { describe, expect, it } from "vitest";
import type { SidecarFrame } from "@pi-desktop/protocol";
import { createUiContext } from "./ui-context";

function harness() {
  const frames: SidecarFrame[] = [];
  const timers = {
    callbacks: [] as Array<() => void>,
    setTimeout(callback: () => void) {
      this.callbacks.push(callback);
      return this.callbacks.length - 1;
    },
    clearTimeout() {},
  };
  const context = createUiContext({ send: (frame) => frames.push(frame), timers });
  return { context, frames, timers };
}

describe("createUiContext", () => {
  it("routes a select and resolves the chosen label", async () => {
    const { context, frames } = harness();
    const promise = context.ui.select("Pick", ["A", "B"]);
    const frame = frames.at(-1)!;
    expect(frame.type).toBe("dialog");
    if (frame.type === "dialog") {
      expect(frame.kind).toBe("select");
      context.handleResponse({
        type: "dialog_response",
        id: frame.id,
        value: "B",
      });
    }
    await expect(promise).resolves.toBe("B");
  });

  it("routes a confirm", async () => {
    const { context, frames } = harness();
    const promise = context.ui.confirm("Continue?", "Sure?");
    const frame = frames.at(-1)!;
    if (frame.type === "dialog") {
      context.handleResponse({
        type: "dialog_response",
        id: frame.id,
        confirmed: true,
      });
    }
    await expect(promise).resolves.toBe(true);
  });

  it("normalizes a malformed approval answer to deny", async () => {
    const { context, frames } = harness();
    const promise = context.ui.approve({ full: "x", compact: "x" });
    const frame = frames.at(-1)!;
    if (frame.type === "dialog") {
      context.handleResponse({
        type: "dialog_response",
        id: frame.id,
        answer: { nope: true },
      });
    }
    await expect(promise).resolves.toBe("deny");
  });

  it("times out to the cancelled value", async () => {
    const { context, frames, timers } = harness();
    const promise = context.ui.input("Name", "type", { timeout: 10 });
    expect(frames.at(-1)?.type).toBe("dialog");
    timers.callbacks[0]();
    await expect(promise).resolves.toBeUndefined();
  });

  it("cancels all pending dialogs", async () => {
    const { context } = harness();
    const first = context.ui.confirm("A", "B");
    const second = context.ui.select("C", ["D"]);
    context.cancelAll();
    await expect(first).resolves.toBe(false);
    await expect(second).resolves.toBeUndefined();
  });

  it("tracks editor text", () => {
    const { context } = harness();
    context.setComposerText("hello");
    expect(context.ui.getEditorText()).toBe("hello");
    context.ui.setEditorText("world");
    expect(context.ui.getEditorText()).toBe("world");
  });
});
