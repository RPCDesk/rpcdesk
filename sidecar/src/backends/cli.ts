import { mkdir, rm, writeFile } from "node:fs/promises";
import { existsSync, readFileSync } from "node:fs";
import { homedir, tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  isApprovalMode,
  isRecord,
  isThinkingLevel,
  type ApprovalMode,
  type Backend,
  type CommandInfo,
  type SessionInfo,
  type SessionSnapshot,
  type SidecarFrame,
  type ThinkingLevel,
} from "@pi-desktop/protocol";
import type { AgentBackend } from "../backend";
import { CliProcess } from "../cli-process";
import { findSessionFile, listSessions } from "../cli-sessions";
import { titleFromMessages } from "../messages";
import { modelInfo, usableModel } from "../models";
import type { UiContextHandle } from "../ui-context";

interface PendingRequest {
  resolve: (value: Record<string, unknown> | undefined) => void;
  reject: (error: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

interface ChunkBuffer {
  count: number;
  byteLength: number;
  next: number;
  chunks: Buffer[];
}

export interface CliBackendOptions {
  backend: Backend;
  cliPath: string;
  cwd: string;
  sessionPath?: string;
  approvalMode: ApprovalMode;
  approvalFallback: ApprovalMode;
  ui: UiContextHandle;
  agentExtensions?: string[];
  send: (frame: SidecarFrame) => void;
  onReady?: (snapshot: SessionSnapshot) => void;
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function ompCliApprovalMode(): ApprovalMode {
  try {
    const path = join(process.env.HOME ?? homedir(), ".omp/agent/config.yml");
    const text = readFileSync(path, "utf8");
    const match = text.match(/^\s*approvalMode:\s*["']?([a-z-]+)/m);
    if (match && isApprovalMode(match[1])) return match[1];
  } catch {
    // fall through to the CLI default
  }
  return "yolo";
}

function commandList(value: unknown): CommandInfo[] {
  if (!isRecord(value) || !Array.isArray(value.commands)) return [];
  const commands: CommandInfo[] = [];
  for (const item of value.commands) {
    if (!isRecord(item) || typeof item.name !== "string") continue;
    commands.push({
      name: item.name,
      description: typeof item.description === "string" ? item.description : undefined,
      source: "agent",
    });
  }
  return commands;
}

function modelList(value: unknown): SessionSnapshot["models"] {
  if (!isRecord(value) || !Array.isArray(value.models)) return [];
  return value.models.filter(usableModel).map((model) => modelInfo(model));
}

export async function createCliBackend({
  backend,
  cliPath,
  cwd,
  sessionPath,
  approvalMode,
  approvalFallback,
  ui,
  agentExtensions = [],
  send,
  onReady,
}: CliBackendOptions): Promise<AgentBackend> {
  let cli: CliProcess | undefined;
  let cliExited: number | null | undefined;
  let starting = false;
  let disposed = false;
  let restarting = false;
  let sessionFile = sessionPath;
  let requestedMode = approvalMode;
  let currentCommands: CommandInfo[] = [];
  const listeners = new Set<(event: unknown) => void>();
  const pending = new Map<string, PendingRequest>();
  const readyWaiters = new Set<() => void>();
  const chunks = new Map<string, ChunkBuffer>();
  let requestId = 0;
  let state: Record<string, unknown> = {};
  let models: SessionSnapshot["models"] = [];

  const gateConfigPath = join(
    tmpdir(),
    `pi-desktop-gate-${process.pid}-${Date.now()}-${Math.random().toString(16).slice(2)}.json`,
  );

  const gateExtension = fileURLToPath(
    new URL("../extensions/pi-gate.js", import.meta.url),
  );

  const emit = (event: unknown) => {
    for (const listener of listeners) listener(event);
  };

  const writeGateConfig = async (): Promise<void> => {
    await writeFile(
      gateConfigPath,
      JSON.stringify({
        mode: requestedMode,
        fallback: approvalFallback,
      }),
      "utf8",
    );
  };

  function spawnArgs(resume: string | undefined): string[] {
    if (backend === "omp") {
      const args = ["--mode", "rpc", "--cwd", cwd];
      if (resume) args.push("--resume", resume);
      if (requestedMode !== "follow-cli") {
        args.push("--approval-mode", requestedMode);
      }
      for (const extension of agentExtensions) args.push("-e", extension);
      return args;
    }

    const args = ["--mode", "rpc"];
    if (resume) args.push("--session", resume);
    args.push("--extension", gateExtension);
    for (const extension of agentExtensions) args.push("-e", extension);
    return args;
  }

  function resolveResponse(response: Record<string, unknown>): void {
    const id = typeof response.id === "string" ? response.id : undefined;
    if (!id) return;
    const entry = pending.get(id);
    if (!entry) return;
    pending.delete(id);
    clearTimeout(entry.timer);
    if (response.success === false) {
      entry.reject(new Error(String(response.error ?? "CLI command failed")));
      return;
    }
    entry.resolve(isRecord(response.data) ? response.data : {});
  }

  function handleChunk(record: Record<string, unknown>): void {
    const chunkId = typeof record.chunkId === "string" ? record.chunkId : "";
    const index = typeof record.index === "number" ? record.index : -1;
    const count = typeof record.count === "number" ? record.count : 0;
    const byteLength = typeof record.byteLength === "number" ? record.byteLength : 0;
    if (!chunkId || index < 0 || count < 1 || index >= count) {
      throw new Error("Invalid RPC chunk");
    }
    let buffer = chunks.get(chunkId);
    if (!buffer) {
      buffer = { count, byteLength, next: 0, chunks: [] };
      chunks.set(chunkId, buffer);
    }
    if (buffer.count !== count || index !== buffer.next) {
      throw new Error("RPC chunk sequence interrupted");
    }
    const data = typeof record.data === "string" ? record.data : "";
    buffer.chunks.push(Buffer.from(data, "base64"));
    buffer.next += 1;
    if (buffer.next < buffer.count) return;
    chunks.delete(chunkId);
    const bytes = Buffer.concat(buffer.chunks, buffer.byteLength);
    const parsed: unknown = JSON.parse(bytes.toString("utf8"));
    if (!isRecord(parsed)) throw new Error("RPC chunk did not contain an object");
    handleRecord(parsed);
  }

  async function handleUiRequest(record: Record<string, unknown>): Promise<void> {
    const id = typeof record.id === "string" ? record.id : undefined;
    const method = typeof record.method === "string" ? record.method : "";
    if (!id || !method) return;
    const title = typeof record.title === "string" ? record.title : undefined;
    const timeout = typeof record.timeout === "number" ? { timeout: record.timeout } : undefined;

    const respond = (value: Record<string, unknown>) => {
      cli?.send({ type: "extension_ui_response", id, ...value });
    };

    try {
      switch (method) {
        case "select": {
          const options = Array.isArray(record.options)
            ? (record.options as Array<string | { label: string; description?: string }>)
            : [];
          const value = await ui.ui.select(title ?? "Select", options, timeout);
          respond(value === undefined ? { cancelled: true } : { value });
          return;
        }
        case "confirm": {
          const confirmed = await ui.ui.confirm(
            title ?? "Confirm",
            typeof record.message === "string" ? record.message : "",
            timeout,
          );
          respond({ confirmed });
          return;
        }
        case "input": {
          const value = await ui.ui.input(
            title ?? "Input",
            typeof record.placeholder === "string" ? record.placeholder : undefined,
            timeout,
          );
          respond(value === undefined ? { cancelled: true } : { value });
          return;
        }
        case "editor": {
          const value = await ui.ui.editor(
            title ?? "Edit",
            typeof record.prefill === "string" ? record.prefill : undefined,
            timeout,
          );
          respond(value === undefined ? { cancelled: true } : { value });
          return;
        }
        case "notify": {
          const level =
            record.notifyType === "error" || record.notifyType === "warning"
              ? record.notifyType
              : "info";
          ui.ui.notify(
            typeof record.message === "string" ? record.message : "Notice",
            level,
          );
          return;
        }
        case "setStatus":
          if (record.statusKey === "ticker") return;
          ui.ui.setStatus(
            typeof record.statusKey === "string" ? record.statusKey : "ext",
            typeof record.statusText === "string" ? record.statusText : undefined,
          );
          return;
        case "setTitle":
          if (typeof record.title === "string") ui.ui.setTitle(record.title);
          return;
        case "set_editor_text":
          if (typeof record.text === "string") ui.ui.setEditorText(record.text);
          return;
        default:
          return;
      }
    } catch (error) {
      if (["select", "confirm", "input", "editor"].includes(method)) {
        respond({ cancelled: true });
      }
      console.error(`CLI UI request failed: ${errorMessage(error)}`);
    }
  }

  function handleRecord(record: Record<string, unknown>): void {
    const type = record.type;
    if (type === "rpc_chunk") {
      handleChunk(record);
      return;
    }
    if (type === "ready") {
      for (const waiter of readyWaiters) waiter();
      readyWaiters.clear();
      return;
    }
    if (type === "response") {
      resolveResponse(record);
      return;
    }
    if (type === "extension_ui_request") {
      void handleUiRequest(record);
      return;
    }
    if (type === "available_commands_update" && Array.isArray(record.commands)) {
      currentCommands = commandList(record);
      return;
    }
    emit(record);
  }

  function handleLine(line: string): void {
    let record: Record<string, unknown>;
    try {
      const parsed: unknown = JSON.parse(line);
      if (!isRecord(parsed)) return;
      record = parsed;
    } catch (error) {
      console.error(`CLI emitted invalid JSON: ${errorMessage(error)}`);
      return;
    }
    try {
      handleRecord(record);
    } catch (error) {
      console.error(`CLI frame failed: ${errorMessage(error)}`);
    }
  }

  function waitReady(): Promise<void> {
    if (backend !== "omp") return Promise.resolve();
    return new Promise((resolve) => {
      const timer = setTimeout(() => {
        readyWaiters.delete(done);
        resolve();
      }, 5000);
      const done = () => {
        clearTimeout(timer);
        resolve();
      };
      readyWaiters.add(done);
    });
  }

  function request(
    command: Record<string, unknown>,
    timeoutMs = 20000,
  ): Promise<Record<string, unknown> | undefined> {
    if (!cli) return Promise.reject(new Error("CLI process is not running"));
    const id = `r${++requestId}`;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error(`CLI command timed out: ${String(command.type)}`));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      try {
        cli!.send({ id, ...command });
      } catch (error) {
        clearTimeout(timer);
        pending.delete(id);
        reject(error instanceof Error ? error : new Error(String(error)));
      }
    });
  }

  async function safeRequest(
    command: Record<string, unknown>,
  ): Promise<Record<string, unknown> | undefined> {
    try {
      return await request(command);
    } catch {
      return undefined;
    }
  }

  async function startProcess(resume: string | undefined): Promise<void> {
    await mkdir(tmpdir(), { recursive: true });
    if (backend === "pi") await writeGateConfig();
    cliExited = undefined;
    starting = true;
    cli = new CliProcess({
      command: cliPath,
      args: spawnArgs(resume),
      cwd,
      env: backend === "pi" ? { PI_DESKTOP_GATE_CONFIG: gateConfigPath } : undefined,
      onLine: handleLine,
      onExit: (code) => {
        cliExited = code;
        if (starting || disposed || restarting) return;
        send({ type: "exit", code, message: cli?.stderrTail() });
      },
    });
    await waitReady();
    await delay(backend === "omp" ? 20 : 60);
    starting = false;
    if (cliExited !== undefined) {
      const tail = cli?.stderrTail();
      throw new Error(
        `${backend} CLI exited during startup${cliExited === null ? "" : ` (${cliExited})`}${tail ? `\n\n${tail}` : ""}`,
      );
    }
  }

  async function initialize(): Promise<void> {
    const [stateData, modelData, levelData, commandData, messageData, statsData] =
      await Promise.all([
        safeRequest({ type: "get_state" }),
        safeRequest({ type: "get_available_models" }),
        safeRequest({ type: "get_available_thinking_levels" }),
        safeRequest({ type: "get_available_commands" }),
        safeRequest({ type: "get_messages" }),
        safeRequest({ type: "get_session_stats" }),
      ]);

    state = stateData ?? {};
    models = modelList(modelData);
    currentCommands = commandList(commandData);
    if (!state.thinkingLevel && levelData && Array.isArray(levelData.levels)) {
      const first = levelData.levels.find(isThinkingLevel);
      if (first) state = { ...state, thinkingLevel: first };
    }

    const sessionId = typeof state.sessionId === "string" ? state.sessionId : undefined;
    const statsFile =
      isRecord(statsData) && typeof statsData.sessionFile === "string"
        ? statsData.sessionFile
        : undefined;
    if (statsFile) sessionFile = statsFile;
    if (!sessionFile) {
      sessionFile = await findSessionFile(backend, sessionId, cwd);
    }

    if (!Array.isArray(messageData?.messages)) {
      state = { ...state, messages: [] };
    } else {
      state = { ...state, messages: messageData.messages };
    }
  }

  function snapshot(): SessionSnapshot {
    const rawModel = state.model;
    const thinkingRaw = state.thinkingLevel;
    const thinkingLevel: ThinkingLevel = isThinkingLevel(thinkingRaw)
      ? thinkingRaw
      : "medium";
    const messages = Array.isArray(state.messages) ? state.messages : [];
    const effectiveMode =
      requestedMode === "follow-cli"
        ? backend === "omp"
          ? ompCliApprovalMode()
          : approvalFallback
        : requestedMode;

    return {
      backend,
      cwd,
      sessionFile,
      title: titleFromMessages(messages) || "New session",
      model: usableModel(rawModel) ? modelInfo(rawModel) : undefined,
      thinkingLevel,
      models,
      messages,
      commands: currentCommands,
      approvalMode: requestedMode,
      effectiveApproval: {
        mode: effectiveMode,
        source:
          requestedMode === "follow-cli"
            ? backend === "omp"
              ? "cli"
              : "app"
            : "session",
      },
    };
  }

  async function currentSessionFile(): Promise<string | undefined> {
    if (sessionFile) return sessionFile;
    const stateData = await safeRequest({ type: "get_state" });
    if (stateData) {
      state = { ...state, ...stateData };
      const sessionId =
        typeof stateData.sessionId === "string" ? stateData.sessionId : undefined;
      sessionFile = await findSessionFile(backend, sessionId, cwd);
    }
    return sessionFile;
  }

  async function restart(): Promise<void> {
    if (restarting || !cli) return;
    restarting = true;
    const resume = await currentSessionFile();
    try {
      await cli.stop();
      cli = undefined;
      for (const entry of pending.values()) {
        clearTimeout(entry.timer);
        entry.reject(new Error("CLI restarted"));
      }
      pending.clear();
      await startProcess(resume && existsSync(resume) ? resume : undefined);
      await initialize();
      sessionFile = (await currentSessionFile()) ?? sessionFile;
      onReady?.(snapshot());
    } finally {
      restarting = false;
    }
  }

  return {
    async start() {
      const resume =
        sessionFile && existsSync(sessionFile) ? sessionFile : undefined;
      sessionFile = resume;
      await startProcess(resume);
      await initialize();
      return snapshot();
    },
    async prompt(text, behavior) {
      await request({
        type: "prompt",
        message: text,
        ...(behavior
          ? { streamingBehavior: behavior === "steer" ? "steer" : "followUp" }
          : {}),
      });
    },
    async abort() {
      await request({ type: "abort" }, 30000);
    },
    async setModel(provider, id) {
      await request({ type: "set_model", provider, modelId: id });
      state = {
        ...state,
        model: models.find((model) => model.provider === provider && model.id === id),
      };
    },
    async setThinking(level) {
      await request({ type: "set_thinking_level", level });
      state = { ...state, thinkingLevel: level };
    },
    async setApprovalMode(mode) {
      requestedMode = mode;
      if (backend === "pi") {
        await writeGateConfig();
        return;
      }
      await restart();
    },
    async fork() {
      const source = await safeRequest({
        type: backend === "omp" ? "get_branch_messages" : "get_fork_messages",
      });
      const messages = source && Array.isArray(source.messages) ? source.messages : [];
      const last = messages.at(-1);
      const entryId =
        isRecord(last) && typeof last.entryId === "string" ? last.entryId : undefined;
      if (!entryId) return undefined;
      const result = await request({ type: "fork", entryId });
      if (!result || result.cancelled === true) return undefined;
      const stats = await safeRequest({ type: "get_session_stats" });
      if (isRecord(stats) && typeof stats.sessionFile === "string") {
        sessionFile = stats.sessionFile;
      } else {
        const stateData = await safeRequest({ type: "get_state" });
        const sessionId =
          stateData && typeof stateData.sessionId === "string"
            ? stateData.sessionId
            : undefined;
        sessionFile = await findSessionFile(backend, sessionId, cwd);
      }
      return sessionFile;
    },
    async listSessions(): Promise<SessionInfo[]> {
      return listSessions(backend, cwd);
    },
    async dispose() {
      if (disposed) return;
      disposed = true;
      ui.cancelAll();
      try {
        await cli?.stop();
      } finally {
        await rm(gateConfigPath, { force: true });
      }
    },
    onEvent(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    handleDialogResponse(frame) {
      ui.handleResponse(frame);
    },
    setComposerText(text) {
      ui.setComposerText(text);
    },
  };
}
