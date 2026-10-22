import { isRecord } from "@pi-desktop/protocol";

export interface ToolDiff {
  path: string;
  patch: string;
  added: number;
  removed: number;
}

export type TranscriptEntry =
  | { id: string; kind: "user"; text: string }
  | {
      id: string;
      kind: "assistant";
      text: string;
      thinking: string;
      streaming: boolean;
    }
  | {
      id: string;
      kind: "tool";
      toolCallId: string;
      toolName: string;
      args?: unknown;
      result?: unknown;
      status: "running" | "ok" | "error";
      startedAt?: number;
      endedAt?: number;
      error?: string;
      diff?: ToolDiff;
    }
  | {
      id: string;
      kind: "system";
      tone: "info" | "warning" | "error" | "success";
      text: string;
    };

export interface TranscriptState {
  entries: TranscriptEntry[];
  running: boolean;
  queued: { steer: number; followUp: number };
  debug: unknown[];
}

export function initialTranscript(): TranscriptState {
  return { entries: [], running: false, queued: { steer: 0, followUp: 0 }, debug: [] };
}

function blockText(block: unknown): string | undefined {
  if (!isRecord(block)) return undefined;
  if (block.type === "text" && typeof block.text === "string") return block.text;
  return undefined;
}

function blockThinking(block: unknown): string | undefined {
  if (!isRecord(block)) return undefined;
  if (block.type === "thinking") {
    if (typeof block.thinking === "string") return block.thinking;
    if (typeof block.text === "string") return block.text;
  }
  return undefined;
}

function contentText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content.map(blockText).filter((value): value is string => Boolean(value)).join("");
}

function contentThinking(content: unknown): string {
  if (!Array.isArray(content)) return "";
  return content
    .map(blockThinking)
    .filter((value): value is string => Boolean(value))
    .join("");
}

function toolCallFromBlock(block: unknown): {
  toolCallId: string;
  toolName: string;
  args?: unknown;
} | undefined {
  if (!isRecord(block)) return undefined;
  if (block.type !== "toolCall" && block.type !== "tool_use") return undefined;
  const id = block.id ?? block.toolCallId ?? block.tool_call_id;
  const name = block.name ?? block.toolName;
  if (typeof id !== "string" || typeof name !== "string") return undefined;
  return {
    toolCallId: id,
    toolName: name,
    args: block.arguments ?? block.input ?? block.args,
  };
}

function resultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .filter((block) => isRecord(block) && block.type === "text")
    .map((block) => (isRecord(block) && typeof block.text === "string" ? block.text : ""))
    .join("");
}

function toolEntry(entry: Extract<TranscriptEntry, { kind: "tool" }>): TranscriptEntry {
  return entry;
}

function attachToolResult(
  entries: TranscriptEntry[],
  toolCallId: string,
  toolName: string | undefined,
  result: unknown,
  isError: boolean,
): TranscriptEntry[] {
  const index = entries.findIndex(
    (entry) => entry.kind === "tool" && entry.toolCallId === toolCallId,
  );
  if (index >= 0) {
    const current = entries[index];
    if (current.kind !== "tool") return entries;
    const next = [...entries];
    next[index] = {
      ...current,
      toolName: current.toolName || toolName || "tool",
      result,
      status: isError ? "error" : "ok",
      endedAt: Date.now(),
    };
    return next;
  }
  if (!toolName) return entries;
  return [
    ...entries,
    toolEntry({
      id: `tool-${toolCallId}`,
      kind: "tool",
      toolCallId,
      toolName,
      result,
      status: isError ? "error" : "ok",
      endedAt: Date.now(),
    }),
  ];
}

export function seedTranscript(messages: unknown[]): TranscriptState {
  let state = initialTranscript();
  let entries = [...state.entries];

  for (const [index, message] of messages.entries()) {
    if (!isRecord(message)) continue;
    const role = message.role;
    if (role === "user") {
      entries.push({
        id: `user-${index}`,
        kind: "user",
        text: contentText(message.content),
      });
      continue;
    }
    if (role === "assistant") {
      entries.push({
        id: `assistant-${index}`,
        kind: "assistant",
        text: contentText(message.content),
        thinking: contentThinking(message.content),
        streaming: false,
      });
      if (Array.isArray(message.content)) {
        for (const block of message.content) {
          const call = toolCallFromBlock(block);
          if (call) {
            entries.push(
              toolEntry({
                id: `tool-${call.toolCallId}`,
                kind: "tool",
                toolCallId: call.toolCallId,
                toolName: call.toolName,
                args: call.args,
                status: "running",
              }),
            );
          }
        }
      }
      continue;
    }
    if (role === "toolResult" || role === "tool") {
      const toolCallId =
        typeof message.toolCallId === "string"
          ? message.toolCallId
          : typeof message.tool_call_id === "string"
            ? message.tool_call_id
            : undefined;
      if (!toolCallId) continue;
      entries = attachToolResult(
        entries,
        toolCallId,
        typeof message.toolName === "string" ? message.toolName : undefined,
        message.content,
        message.isError === true,
      );
    }
  }

  state = { ...state, entries };
  return state;
}

function streamingAssistantIndex(entries: TranscriptEntry[]): number {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index];
    if (entry.kind === "assistant" && entry.streaming) return index;
  }
  return -1;
}

export function reduceTranscript(
  state: TranscriptState,
  event: unknown,
): TranscriptState {
  if (!isRecord(event) || typeof event.type !== "string") {
    return { ...state, debug: [...state.debug, event].slice(-500) };
  }

  switch (event.type) {
    case "message_start": {
      const message = event.message;
      if (!isRecord(message)) return state;
      if (message.role === "user") {
        const text = contentText(message.content);
        if (!text.trim()) return state;
        return {
          ...state,
          entries: [
            ...state.entries,
            { id: `user-${state.entries.length}`, kind: "user", text },
          ],
        };
      }
      if (message.role !== "assistant") return state;
      return {
        ...state,
        entries: [
          ...state.entries,
          {
            id: `stream-${state.entries.length}`,
            kind: "assistant",
            text: "",
            thinking: "",
            streaming: true,
          },
        ],
      };
    }
    case "message_update": {
      const update = event.assistantMessageEvent;
      if (!isRecord(update) || typeof update.type !== "string") return state;
      if (update.type !== "text_delta" && update.type !== "thinking_delta") {
        return state;
      }
      const delta = typeof update.delta === "string" ? update.delta : "";
      if (delta.length === 0) return state;
      const index = streamingAssistantIndex(state.entries);
      const entries = [...state.entries];
      if (index < 0) {
        entries.push({
          id: `stream-${state.entries.length}`,
          kind: "assistant",
          text: update.type === "text_delta" ? delta : "",
          thinking: update.type === "thinking_delta" ? delta : "",
          streaming: true,
        });
      } else {
        const current = entries[index];
        if (current.kind !== "assistant") return state;
        entries[index] = {
          ...current,
          text: update.type === "text_delta" ? current.text + delta : current.text,
          thinking:
            update.type === "thinking_delta" ? current.thinking + delta : current.thinking,
        };
      }
      return { ...state, entries };
    }
    case "message_end": {
      const message = event.message;
      if (!isRecord(message) || message.role !== "assistant") return state;
      const index = streamingAssistantIndex(state.entries);
      const entry: TranscriptEntry = {
        id:
          index >= 0 && state.entries[index].kind === "assistant"
            ? state.entries[index].id
            : `assistant-${state.entries.length}`,
        kind: "assistant",
        text: contentText(message.content),
        thinking: contentThinking(message.content),
        streaming: false,
      };
      const entries = [...state.entries];
      if (index >= 0) entries[index] = entry;
      else entries.push(entry);
      return { ...state, entries };
    }
    case "tool_execution_start": {
      const toolCallId =
        typeof event.toolCallId === "string" ? event.toolCallId : undefined;
      const toolName =
        typeof event.toolName === "string"
          ? event.toolName
          : isRecord(event.tool) && typeof event.tool.name === "string"
            ? event.tool.name
            : undefined;
      if (!toolCallId || !toolName) return state;
      const existing = state.entries.findIndex(
        (entry) => entry.kind === "tool" && entry.toolCallId === toolCallId,
      );
      if (existing >= 0) return state;
      return {
        ...state,
        entries: [
          ...state.entries,
          {
            id: `tool-${toolCallId}`,
            kind: "tool",
            toolCallId,
            toolName,
            args: event.args ?? event.input,
            status: "running",
            startedAt: Date.now(),
          },
        ],
      };
    }
    case "tool_execution_update": {
      const toolCallId =
        typeof event.toolCallId === "string" ? event.toolCallId : undefined;
      if (!toolCallId) return state;
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.kind === "tool" && entry.toolCallId === toolCallId
            ? { ...entry, result: event.partialResult ?? entry.result }
            : entry,
        ),
      };
    }
    case "tool_execution_end": {
      const toolCallId =
        typeof event.toolCallId === "string" ? event.toolCallId : undefined;
      if (!toolCallId) return state;
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.kind === "tool" && entry.toolCallId === toolCallId
            ? {
                ...entry,
                result: event.result ?? entry.result,
                status: event.isError === true ? "error" : "ok",
                endedAt: Date.now(),
              }
            : entry,
        ),
      };
    }
    case "diff": {
      const toolCallId =
        typeof event.toolCallId === "string" ? event.toolCallId : undefined;
      if (!toolCallId) return state;
      return {
        ...state,
        entries: state.entries.map((entry) =>
          entry.kind === "tool" && entry.toolCallId === toolCallId
            ? {
                ...entry,
                diff: {
                  path: String(event.path ?? ""),
                  patch: String(event.patch ?? ""),
                  added: Number(event.added ?? 0),
                  removed: Number(event.removed ?? 0),
                },
              }
            : entry,
        ),
      };
    }
    case "agent_start":
      return { ...state, running: true };
    case "agent_end": {
      const terminal = event.isTerminal !== false;
      return {
        ...state,
        running: terminal ? false : state.running,
        queued: terminal ? { steer: 0, followUp: 0 } : state.queued,
      };
    }
    case "queue_update": {
      const steering = Array.isArray(event.steering) ? event.steering.length : 0;
      const followUp = Array.isArray(event.followUp) ? event.followUp.length : 0;
      return { ...state, queued: { steer: steering, followUp } };
    }
    case "notice": {
      const message = typeof event.message === "string" ? event.message : "Notice";
      if (message.startsWith("xd://: mounted")) return state;
      const level = event.level;
      const tone =
        level === "error" || level === "warning" || level === "success"
          ? level
          : "info";
      return {
        ...state,
        entries: [
          ...state.entries,
          { id: `notice-${state.entries.length}`, kind: "system", tone, text: message },
        ],
      };
    }
    case "auto_compaction_start":
      return {
        ...state,
        entries: [
          ...state.entries,
          {
            id: `compaction-${state.entries.length}`,
            kind: "system",
            tone: "info",
            text: "Compacting context...",
          },
        ],
      };
    case "auto_retry_start":
      return {
        ...state,
        entries: [
          ...state.entries,
          {
            id: `retry-${state.entries.length}`,
            kind: "system",
            tone: "warning",
            text: "Retrying provider request...",
          },
        ],
      };
    default:
      return { ...state, debug: [...state.debug, event].slice(-500) };
  }
}
