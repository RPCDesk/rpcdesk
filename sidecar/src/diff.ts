import { createTwoFilesPatch } from "diff";
import { readFileSync, statSync } from "node:fs";
import { relative, resolve } from "node:path";
import type { SidecarFrame } from "@rpcdesk/protocol";

const MAX_DIFF_BYTES = 2 * 1024 * 1024;

export interface DiffResult {
  patch: string;
  added: number;
  removed: number;
}

export function computeDiff(path: string, before: string, after: string): DiffResult {
  const patch = createTwoFilesPatch(path, path, before, after, "", "", { context: 3 });
  let added = 0;
  let removed = 0;
  for (const line of patch.split("\n")) {
    if (line.startsWith("+") && !line.startsWith("+++")) added += 1;
    else if (line.startsWith("-") && !line.startsWith("---")) removed += 1;
  }
  return { patch, added, removed };
}

function readText(path: string): string | null {
  try {
    const info = statSync(path);
    if (!info.isFile() || info.size > MAX_DIFF_BYTES) return null;
    const bytes = readFileSync(path);
    if (bytes.includes(0)) return null;
    return bytes.toString("utf8");
  } catch {
    return null;
  }
}

interface ToolEvent {
  type?: string;
  toolName?: string;
  toolCallId?: string;
  args?: Record<string, unknown>;
  input?: Record<string, unknown>;
}

function isToolEvent(event: unknown): event is ToolEvent {
  return typeof event === "object" && event !== null;
}

export function createDiffTracker(
  send: (frame: SidecarFrame) => void,
  cwd: string,
) {
  const snapshots = new Map<string, { path: string; displayPath: string; before: string }>();

  return {
    onEvent(event: unknown): void {
      if (!isToolEvent(event)) return;
      if (event.type === "tool_execution_start") {
        const toolName = event.toolName;
        const toolCallId = event.toolCallId;
        if (!toolName || !toolCallId) return;
        if (toolName !== "write" && toolName !== "edit") return;
        const args = event.args ?? event.input;
        if (!args) return;
        const rawPath = args.path ?? args.file_path;
        if (typeof rawPath !== "string") return;
        const absolute = resolve(cwd, rawPath);
        snapshots.set(toolCallId, {
          path: absolute,
          displayPath: relative(cwd, absolute) || rawPath,
          before: readText(absolute) ?? "",
        });
        return;
      }

      if (event.type === "tool_execution_end") {
        const toolCallId = event.toolCallId;
        if (!toolCallId) return;
        const snapshot = snapshots.get(toolCallId);
        if (!snapshot) return;
        snapshots.delete(toolCallId);
        const value = computeDiff(snapshot.displayPath, snapshot.before, readText(snapshot.path) ?? "");
        if (value.patch.trim().length === 0) return;
        send({
          type: "diff",
          toolCallId,
          path: snapshot.displayPath,
          patch: value.patch,
          added: value.added,
          removed: value.removed,
        });
      }
    },
  };
}
