import { isRecord, isString } from "./guards";
export { isRecord, isString } from "./guards";

export const BACKENDS = ["omp", "pi"] as const;
export type Backend = (typeof BACKENDS)[number];

export const APPROVAL_MODES = ["follow-cli", "always-ask", "write", "yolo"] as const;
export type ApprovalMode = (typeof APPROVAL_MODES)[number];

export const THINKING_LEVELS = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "auto",
] as const;
export type ThinkingLevel = (typeof THINKING_LEVELS)[number];

export const TOOL_TIERS = ["read", "write", "exec"] as const;
export type ToolTier = (typeof TOOL_TIERS)[number];

export interface ModelInfo {
  provider: string;
  id: string;
  name: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export interface SessionInfo {
  path: string;
  id: string;
  title: string;
  updatedAt: number;
  cwd: string;
}

export interface CommandInfo {
  name: string;
  description?: string;
  source: "app" | "agent" | "plugin";
}

export interface SessionSnapshot {
  backend: Backend;
  cwd: string;
  sessionFile?: string;
  title: string;
  model?: ModelInfo;
  thinkingLevel: ThinkingLevel;
  models: ModelInfo[];
  messages: unknown[];
  commands: CommandInfo[];
  approvalMode: ApprovalMode;
  effectiveApproval: { mode: ApprovalMode; source: "cli" | "app" | "session" };
}

export interface ApprovalGrant {
  scope: "folder" | "target";
  label: string;
  alwaysLabel: string;
}

export interface ApprovalPrompt {
  full: string;
  compact: string;
  session?: string;
  grants?: ApprovalGrant[];
}

export type HostFrame =
  | { type: "prompt"; id: string; text: string; behavior?: "steer" | "follow-up" }
  | { type: "abort"; id: string }
  | { type: "set_model"; id: string; provider: string; modelId: string }
  | { type: "set_thinking"; id: string; level: ThinkingLevel }
  | { type: "set_approval_mode"; id: string; mode: ApprovalMode }
  | { type: "fork"; id: string }
  | { type: "list_sessions"; id: string }
  | {
      type: "dialog_response";
      id: string;
      value?: string;
      confirmed?: boolean;
      cancelled?: boolean;
      answer?: unknown;
    }
  | { type: "composer_text"; text: string }
  | { type: "shutdown" };

export type DialogKind = "select" | "confirm" | "input" | "editor" | "approve";

export type SidecarFrame =
  | { type: "ready"; snapshot: SessionSnapshot }
  | { type: "response"; id: string; ok: true; data?: unknown }
  | { type: "response"; id: string; ok: false; error: string }
  | { type: "event"; event: unknown }
  | {
      type: "dialog";
      id: string;
      kind: DialogKind;
      title?: string;
      message?: string;
      options?: Array<string | { label: string; description?: string }>;
      prompt?: ApprovalPrompt;
      placeholder?: string;
      default?: string;
      timeoutMs?: number;
    }
  | { type: "notify"; level: "info" | "warning" | "error"; message: string }
  | { type: "status"; key: string; text?: string }
  | { type: "title"; title: string }
  | { type: "composer"; mode: "set" | "paste"; text: string }
  | {
      type: "diff";
      toolCallId: string;
      path: string;
      patch: string;
      added: number;
      removed: number;
    }
  | { type: "fatal"; error: string }
  | { type: "exit"; code: number | null; message?: string };

export interface FrameParseSuccess<T> {
  ok: true;
  frame: T;
}

export interface FrameParseFailure {
  ok: false;
  error: string;
}

export type FrameParseResult<T> = FrameParseSuccess<T> | FrameParseFailure;

function hasId(value: Record<string, unknown>): value is Record<string, unknown> & { id: string } {
  return isString(value.id);
}

export function isApprovalMode(value: unknown): value is ApprovalMode {
  return isString(value) && (APPROVAL_MODES as readonly string[]).includes(value);
}

export function isThinkingLevel(value: unknown): value is ThinkingLevel {
  return isString(value) && (THINKING_LEVELS as readonly string[]).includes(value);
}

export function isBackend(value: unknown): value is Backend {
  return isString(value) && (BACKENDS as readonly string[]).includes(value);
}

function parseJson(line: string): FrameParseResult<Record<string, unknown>> {
  const trimmed = line.endsWith("\r") ? line.slice(0, -1) : line;
  if (trimmed.trim().length === 0) {
    return { ok: false, error: "Empty frame" };
  }
  try {
    const parsed: unknown = JSON.parse(trimmed);
    if (!isRecord(parsed)) {
      return { ok: false, error: "Frame must be a JSON object" };
    }
    return { ok: true, frame: parsed };
  } catch (error) {
    return { ok: false, error: `Malformed JSON: ${(error as Error).message}` };
  }
}

export function parseHostFrame(line: string): FrameParseResult<HostFrame> {
  const parsed = parseJson(line);
  if (!parsed.ok) return parsed;
  const frame = parsed.frame;
  const type = frame.type;
  if (!isString(type)) return { ok: false, error: "Frame type is required" };

  switch (type) {
    case "prompt":
      if (!hasId(frame) || !isString(frame.text)) {
        return { ok: false, error: "prompt requires id and text" };
      }
      if (
        frame.behavior !== undefined &&
        frame.behavior !== "steer" &&
        frame.behavior !== "follow-up"
      ) {
        return { ok: false, error: "Invalid prompt behavior" };
      }
      return { ok: true, frame: frame as HostFrame };
    case "abort":
    case "fork":
    case "list_sessions":
      if (!hasId(frame)) return { ok: false, error: `${type} requires id` };
      return { ok: true, frame: frame as HostFrame };
    case "set_model":
      if (!hasId(frame) || !isString(frame.provider) || !isString(frame.modelId)) {
        return { ok: false, error: "set_model requires id, provider, and modelId" };
      }
      return { ok: true, frame: frame as HostFrame };
    case "set_thinking":
      if (!hasId(frame) || !isThinkingLevel(frame.level)) {
        return { ok: false, error: "set_thinking requires id and a valid level" };
      }
      return { ok: true, frame: frame as HostFrame };
    case "set_approval_mode":
      if (!hasId(frame) || !isApprovalMode(frame.mode)) {
        return { ok: false, error: "set_approval_mode requires id and a valid mode" };
      }
      return { ok: true, frame: frame as HostFrame };
    case "dialog_response":
      if (!hasId(frame)) return { ok: false, error: "dialog_response requires id" };
      if (
        frame.cancelled !== undefined &&
        typeof frame.cancelled !== "boolean"
      ) {
        return { ok: false, error: "dialog_response cancelled must be boolean" };
      }
      if (
        frame.confirmed !== undefined &&
        typeof frame.confirmed !== "boolean"
      ) {
        return { ok: false, error: "dialog_response confirmed must be boolean" };
      }
      return { ok: true, frame: frame as HostFrame };
    case "composer_text":
      if (!isString(frame.text)) {
        return { ok: false, error: "composer_text requires text" };
      }
      return { ok: true, frame: frame as HostFrame };
    case "shutdown":
      return { ok: true, frame: { type: "shutdown" } };
    default:
      return { ok: false, error: `Unknown host frame: ${String(type)}` };
  }
}

export function parseSidecarFrame(line: string): FrameParseResult<SidecarFrame> {
  const parsed = parseJson(line);
  if (!parsed.ok) return parsed;
  const frame = parsed.frame;
  const type = frame.type;
  if (!isString(type)) return { ok: false, error: "Frame type is required" };

  switch (type) {
    case "ready":
      if (!isRecord(frame.snapshot)) {
        return { ok: false, error: "ready requires a snapshot" };
      }
      return { ok: true, frame: frame as SidecarFrame };
    case "response":
      if (!hasId(frame) || typeof frame.ok !== "boolean") {
        return { ok: false, error: "response requires id and ok" };
      }
      if (frame.ok && frame.error !== undefined) {
        return { ok: false, error: "successful response cannot carry error" };
      }
      if (!frame.ok && !isString(frame.error)) {
        return { ok: false, error: "failed response requires error" };
      }
      return { ok: true, frame: frame as SidecarFrame };
    case "event":
      if (!("event" in frame)) {
        return { ok: false, error: "event requires event" };
      }
      return { ok: true, frame: frame as SidecarFrame };
    case "dialog":
      if (!hasId(frame) || !isString(frame.kind)) {
        return { ok: false, error: "dialog requires id and kind" };
      }
      if (
        !["select", "confirm", "input", "editor", "approve"].includes(frame.kind)
      ) {
        return { ok: false, error: "Invalid dialog kind" };
      }
      return { ok: true, frame: frame as SidecarFrame };
    case "notify":
      if (
        !isString(frame.message) ||
        !["info", "warning", "error"].includes(String(frame.level))
      ) {
        return { ok: false, error: "notify requires level and message" };
      }
      return { ok: true, frame: frame as SidecarFrame };
    case "status":
      if (!isString(frame.key)) return { ok: false, error: "status requires key" };
      return { ok: true, frame: frame as SidecarFrame };
    case "title":
      if (!isString(frame.title)) return { ok: false, error: "title requires title" };
      return { ok: true, frame: frame as SidecarFrame };
    case "composer":
      if (!isString(frame.text) || !["set", "paste"].includes(String(frame.mode))) {
        return { ok: false, error: "composer requires mode and text" };
      }
      return { ok: true, frame: frame as SidecarFrame };
    case "diff":
      if (
        !isString(frame.toolCallId) ||
        !isString(frame.path) ||
        !isString(frame.patch) ||
        typeof frame.added !== "number" ||
        typeof frame.removed !== "number"
      ) {
        return { ok: false, error: "diff requires toolCallId, path, patch, added, removed" };
      }
      return { ok: true, frame: frame as SidecarFrame };
    case "fatal":
      if (!isString(frame.error)) return { ok: false, error: "fatal requires error" };
      return { ok: true, frame: frame as SidecarFrame };
    case "exit":
      if (frame.code !== null && typeof frame.code !== "number") {
        return { ok: false, error: "exit code must be a number or null" };
      }
      if (frame.message !== undefined && !isString(frame.message)) {
        return { ok: false, error: "exit message must be a string" };
      }
      return { ok: true, frame: frame as SidecarFrame };
    default:
      return { ok: false, error: `Unknown sidecar frame: ${String(type)}` };
  }
}
