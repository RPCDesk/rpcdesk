import { Channel } from "@tauri-apps/api/core";
import {
  parseSidecarFrame,
  type HostFrame,
  type SidecarFrame,
  type ThinkingLevel,
} from "@rpcdesk/protocol";
import { call } from "./tauri";
import { useSettings } from "../state/settings";
import { useRuntime } from "../state/runtime";
import { useTabs, type Tab } from "../state/tabs";
import { useUi } from "../state/ui";

type ResponseFrame = Extract<SidecarFrame, { type: "response" }>;

const channels = new Map<string, Channel<string>>();
const pending = new Map<
  string,
  {
    resolve: (frame: ResponseFrame) => void;
    timer: ReturnType<typeof setTimeout>;
  }
>();

function pendingKey(tabId: string, id: string): string {
  return `${tabId}:${id}`;
}

function clearPending(tabId: string): void {
  for (const [key, value] of pending) {
    if (!key.startsWith(`${tabId}:`)) continue;
    clearTimeout(value.timer);
    pending.delete(key);
  }
}

function handleLine(tabId: string, line: string): void {
  const parsed = parseSidecarFrame(line);
  if (!parsed.ok) {
    useUi.getState().pushToast(`Sidecar protocol error: ${parsed.error}`, "error");
    return;
  }
  const frame = parsed.frame;
  if (frame.type === "response") {
    const entry = pending.get(pendingKey(tabId, frame.id));
    if (entry) {
      clearTimeout(entry.timer);
      pending.delete(pendingKey(tabId, frame.id));
      entry.resolve(frame);
      return;
    }
  }
  if (frame.type === "exit") {
    channels.delete(tabId);
  }
  useTabs.getState().applyFrame(tabId, frame);
}

export async function startTab(tab: Tab): Promise<void> {
  const settings = useSettings.getState().settings;
  const runtime = useRuntime.getState().statuses[tab.backend];
  if (runtime && !runtime.installed) {
    const message = `${tab.backend} CLI not found. Install it or download a managed copy.`;
    useTabs.getState().updateTab(tab.id, { status: "error", error: message });
    return;
  }
  const channel = new Channel<string>();
  channel.onmessage = (line) => {
    if (channels.get(tab.id) !== channel) return;
    handleLine(tab.id, line);
  };
  channels.set(tab.id, channel);

  useTabs.getState().updateTab(tab.id, {
    status: "starting",
    cold: false,
    error: undefined,
  });

  try {
    await call("start_session", {
      tabId: tab.id,
      options: {
        backend: tab.backend,
        cwd: tab.cwd,
        session: tab.sessionFile,
        approvalMode: tab.approvalMode,
        approvalFallback: settings.approvalFallback,
      },
      channel,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    channels.delete(tab.id);
    useTabs.getState().updateTab(tab.id, { status: "error", error: message });
    useUi.getState().pushToast(message, "error");
  }
}

export async function stopTab(tabId: string): Promise<void> {
  channels.delete(tabId);
  clearPending(tabId);
  try {
    await call("stop_session", { tabId });
  } catch (error) {
    console.error("Failed to stop session", error);
  }
}

export async function sendFrame(
  tabId: string,
  frame: HostFrame,
): Promise<void> {
  if (!channels.has(tabId)) {
    useUi.getState().pushToast("Session is not running", "warning");
    return;
  }
  try {
    await call("send_frame", {
      tabId,
      frame: JSON.stringify(frame),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useUi.getState().pushToast(message, "error");
  }
}

export function requestFrame(
  tabId: string,
  frame: HostFrame & { id: string },
  timeoutMs = 15000,
): Promise<ResponseFrame> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      pending.delete(pendingKey(tabId, frame.id));
      reject(new Error("Sidecar request timed out"));
    }, timeoutMs);
    pending.set(pendingKey(tabId, frame.id), { resolve, timer });
    void sendFrame(tabId, frame);
  });
}

export async function listSessions(tabId: string): Promise<void> {
  try {
    const response = await requestFrame(tabId, {
      type: "list_sessions",
      id: crypto.randomUUID(),
    });
    if (!response.ok) {
      useUi.getState().pushToast(response.error, "error");
      return;
    }
    const data = response.data;
    if (
      data &&
      typeof data === "object" &&
      "sessions" in data &&
      Array.isArray(data.sessions)
    ) {
      useTabs.getState().setSessions(tabId, data.sessions);
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useUi.getState().pushToast(message, "error");
  }
}

export async function restartTab(
  tabId: string,
  patch: Partial<Tab>,
): Promise<void> {
  const current = useTabs.getState().tabs.find((tab) => tab.id === tabId);
  if (!current) return;
  await stopTab(tabId);
  useTabs.getState().resetTab(tabId, patch);
  const next = useTabs.getState().tabs.find((tab) => tab.id === tabId);
  if (next) await startTab(next);
}

export async function newSession(tabId: string): Promise<void> {
  await restartTab(tabId, { sessionFile: undefined, title: "New session" });
}

export async function resumeSession(
  tabId: string,
  sessionFile: string,
): Promise<void> {
  await restartTab(tabId, { sessionFile });
}

export async function forkTab(tabId: string): Promise<void> {
  try {
    const response = await requestFrame(tabId, {
      type: "fork",
      id: crypto.randomUUID(),
    });
    if (!response.ok) {
      useUi.getState().pushToast(response.error, "error");
      return;
    }
    const data = response.data;
    if (
      data &&
      typeof data === "object" &&
      "sessionFile" in data &&
      typeof data.sessionFile === "string"
    ) {
      await resumeSession(tabId, data.sessionFile);
    } else {
      useUi.getState().pushToast("Fork did not produce a session", "warning");
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    useUi.getState().pushToast(message, "error");
  }
}

export function sendPrompt(
  tabId: string,
  text: string,
  behavior?: "steer" | "follow-up",
): void {
  void sendFrame(tabId, {
    type: "prompt",
    id: crypto.randomUUID(),
    text,
    ...(behavior ? { behavior } : {}),
  });
}

export function abortTab(tabId: string): void {
  void sendFrame(tabId, { type: "abort", id: crypto.randomUUID() });
}

export function setModel(
  tabId: string,
  provider: string,
  modelId: string,
): void {
  void requestFrame(tabId, {
    type: "set_model",
    id: crypto.randomUUID(),
    provider,
    modelId,
  })
    .then((response) => {
      if (!response.ok) {
        useUi.getState().pushToast(response.error, "error");
        return;
      }
      const tab = useTabs.getState().tabs.find((item) => item.id === tabId);
      const model = tab?.snapshot?.models.find(
        (item) => item.provider === provider && item.id === modelId,
      );
      if (tab?.snapshot && model) {
        useTabs.getState().updateTab(tabId, {
          snapshot: { ...tab.snapshot, model },
        });
      }
    })
    .catch((error: unknown) => {
      useUi
        .getState()
        .pushToast(error instanceof Error ? error.message : String(error), "error");
    });
}

export function setThinking(tabId: string, level: ThinkingLevel): void {
  void requestFrame(tabId, {
    type: "set_thinking",
    id: crypto.randomUUID(),
    level,
  })
    .then((response) => {
      if (!response.ok) {
        useUi.getState().pushToast(response.error, "error");
        return;
      }
      const tab = useTabs.getState().tabs.find((item) => item.id === tabId);
      if (tab?.snapshot) {
        useTabs.getState().updateTab(tabId, {
          snapshot: { ...tab.snapshot, thinkingLevel: level },
        });
      }
    })
    .catch((error: unknown) => {
      useUi
        .getState()
        .pushToast(error instanceof Error ? error.message : String(error), "error");
    });
}

export function setApprovalMode(
  tabId: string,
  mode: Tab["approvalMode"],
): void {
  useTabs.getState().setApprovalMode(tabId, mode);
  void requestFrame(tabId, {
    type: "set_approval_mode",
    id: crypto.randomUUID(),
    mode,
  })
    .then((response) => {
      if (!response.ok) {
        useUi.getState().pushToast(response.error, "error");
        return;
      }
      const tab = useTabs.getState().tabs.find((item) => item.id === tabId);
      if (!tab?.snapshot) return;
      const fallback = useSettings.getState().settings.approvalFallback;
      const effective =
        mode === "follow-cli"
          ? {
              mode:
                tab.backend === "omp"
                  ? tab.snapshot.effectiveApproval.mode
                  : fallback,
              source: tab.backend === "omp" ? ("cli" as const) : ("app" as const),
            }
          : { mode, source: "session" as const };
      useTabs.getState().updateTab(tabId, {
        snapshot: { ...tab.snapshot, approvalMode: mode, effectiveApproval: effective },
      });
    })
    .catch((error: unknown) => {
      useUi
        .getState()
        .pushToast(error instanceof Error ? error.message : String(error), "error");
    });
}

export function respondDialog(
  tabId: string,
  dialogId: string,
  response: {
    value?: string;
    confirmed?: boolean;
    cancelled?: boolean;
    answer?: unknown;
  },
): void {
  useTabs.getState().dismissDialog(tabId, dialogId);
  void sendFrame(tabId, {
    type: "dialog_response",
    id: dialogId,
    ...response,
  });
}

export function sendComposerText(tabId: string, text: string): void {
  void sendFrame(tabId, { type: "composer_text", text });
}

export function isTabRunning(tabId: string): boolean {
  return channels.has(tabId);
}
