import { create } from "zustand";
import type {
  ApprovalMode,
  Backend,
  SessionInfo,
  SessionSnapshot,
  SidecarFrame,
} from "@rpcdesk/protocol";
import { emitPluginEvent } from "../plugins/runtime";
import { useSettings } from "./settings";
import { useUi } from "./ui";
import {
  initialTranscript,
  reduceTranscript,
  seedTranscript,
  type TranscriptState,
} from "./transcript";

export type TabStatus = "cold" | "starting" | "ready" | "running" | "error";
export type DialogRequest = Extract<SidecarFrame, { type: "dialog" }>;

export interface Tab {
  id: string;
  backend: Backend;
  cwd: string;
  sessionFile?: string;
  title: string;
  status: TabStatus;
  unread: boolean;
  cold: boolean;
  snapshot?: SessionSnapshot;
  transcript: TranscriptState;
  dialogs: DialogRequest[];
  composerMode: "steer" | "follow-up";
  approvalMode: ApprovalMode;
  error?: string;
  sessions: SessionInfo[];
  draft: string;
}

export interface PersistedTab {
  id: string;
  backend: Backend;
  cwd: string;
  sessionFile?: string;
  title: string;
}

interface TabsStore {
  tabs: Tab[];
  activeTabId?: string;
  addTab: (input: {
    backend: Backend;
    cwd: string;
    sessionFile?: string;
    title?: string;
  }) => Tab;
  restoreTabs: (tabs: PersistedTab[], activeTabId?: string) => void;
  removeTab: (id: string) => void;
  activateTab: (id: string) => void;
  updateTab: (id: string, patch: Partial<Tab>) => void;
  resetTab: (id: string, patch: Partial<Tab>) => void;
  applyFrame: (id: string, frame: SidecarFrame) => void;
  pushDialog: (id: string, dialog: DialogRequest) => void;
  dismissDialog: (id: string, dialogId: string) => void;
  setDraft: (id: string, draft: string) => void;
  setComposerMode: (id: string, mode: "steer" | "follow-up") => void;
  setApprovalMode: (id: string, mode: ApprovalMode) => void;
  setSessions: (id: string, sessions: SessionInfo[]) => void;
}

function makeTab(input: {
  id: string;
  backend: Backend;
  cwd: string;
  sessionFile?: string;
  title?: string;
  cold: boolean;
  approvalMode: ApprovalMode;
}): Tab {
  return {
    id: input.id,
    backend: input.backend,
    cwd: input.cwd,
    sessionFile: input.sessionFile,
    title: input.title ?? "New session",
    status: input.cold ? "cold" : "starting",
    unread: false,
    cold: input.cold,
    transcript: initialTranscript(),
    dialogs: [],
    composerMode: "steer",
    approvalMode: input.approvalMode,
    sessions: [],
    draft: "",
  };
}

export const useTabs = create<TabsStore>((set, get) => ({
  tabs: [],
  activeTabId: undefined,
  addTab(input) {
    const tab = makeTab({
      id: crypto.randomUUID(),
      backend: input.backend,
      cwd: input.cwd,
      sessionFile: input.sessionFile,
      title: input.title,
      cold: false,
      approvalMode: useSettings.getState().settings.approvalMode,
    });
    set({ tabs: [...get().tabs, tab], activeTabId: tab.id });
    return tab;
  },
  restoreTabs(tabs, activeTabId) {
    const approvalMode = useSettings.getState().settings.approvalMode;
    const restored = tabs.map((tab) =>
      makeTab({
        ...tab,
        cold: true,
        approvalMode,
      }),
    );
    set({
      tabs: restored,
      activeTabId:
        activeTabId && restored.some((tab) => tab.id === activeTabId)
          ? activeTabId
          : restored[0]?.id,
    });
  },
  removeTab(id) {
    const tabs = get().tabs.filter((tab) => tab.id !== id);
    const activeTabId =
      get().activeTabId === id ? tabs[tabs.length - 1]?.id : get().activeTabId;
    set({ tabs, activeTabId });
  },
  activateTab(id) {
    set({
      activeTabId: id,
      tabs: get().tabs.map((tab) =>
        tab.id === id ? { ...tab, unread: false } : tab,
      ),
    });
  },
  updateTab(id, patch) {
    set({
      tabs: get().tabs.map((tab) => (tab.id === id ? { ...tab, ...patch } : tab)),
    });
  },
  resetTab(id, patch) {
    set({
      tabs: get().tabs.map((tab) =>
        tab.id === id
          ? {
              ...tab,
              ...patch,
              status: "starting",
              cold: false,
              error: undefined,
              snapshot: undefined,
              transcript: initialTranscript(),
              dialogs: [],
            }
          : tab,
      ),
    });
  },
  applyFrame(id, frame) {
    const tab = get().tabs.find((item) => item.id === id);
    if (!tab) return;

    switch (frame.type) {
      case "ready": {
        const snapshot = frame.snapshot;
        set({
          tabs: get().tabs.map((item) =>
            item.id === id
              ? {
                  ...item,
                  snapshot,
                  sessionFile: snapshot.sessionFile ?? item.sessionFile,
                  title: snapshot.title || item.title,
                  status: "ready",
                  cold: false,
                  error: undefined,
                  approvalMode: snapshot.approvalMode,
                  transcript: seedTranscript(snapshot.messages),
                }
              : item,
          ),
        });
        return;
      }
      case "event": {
        emitPluginEvent(frame.event);
        const transcript = reduceTranscript(tab.transcript, frame.event);
        set({
          tabs: get().tabs.map((item) =>
            item.id === id
              ? {
                  ...item,
                  transcript,
                  status: transcript.running ? "running" : "ready",
                }
              : item,
          ),
        });
        return;
      }
      case "dialog":
        get().pushDialog(id, frame);
        return;
      case "notify":
        useUi.getState().pushToast(frame.message, frame.level);
        return;
      case "status":
        useUi.getState().setStatus(`ext:${frame.key}`, frame.text);
        return;
      case "title":
        get().updateTab(id, { title: frame.title });
        return;
      case "composer":
        get().setDraft(id, frame.text);
        return;
      case "diff": {
        const transcript = reduceTranscript(tab.transcript, frame);
        get().updateTab(id, { transcript });
        return;
      }
      case "fatal":
        get().updateTab(id, { status: "error", error: frame.error });
        useUi.getState().pushToast(frame.error, "error");
        return;
      case "exit":
        if (tab.cold) return;
        // A fatal frame already explains the failure; keep that message.
        if (tab.status === "error" && tab.error) return;
        {
          const suffix = frame.code === null ? "" : ` (${frame.code})`;
          const detail = frame.message ? `\n\n${frame.message}` : "";
          get().updateTab(id, {
            status: "error",
            error: `Session process exited${suffix}${detail}`,
          });
        }
        return;
      case "response":
        return;
    }
  },
  pushDialog(id, dialog) {
    set({
      tabs: get().tabs.map((tab) =>
        tab.id === id ? { ...tab, dialogs: [...tab.dialogs, dialog] } : tab,
      ),
    });
  },
  dismissDialog(id, dialogId) {
    set({
      tabs: get().tabs.map((tab) =>
        tab.id === id
          ? { ...tab, dialogs: tab.dialogs.filter((dialog) => dialog.id !== dialogId) }
          : tab,
      ),
    });
  },
  setDraft(id, draft) {
    set({
      tabs: get().tabs.map((tab) => (tab.id === id ? { ...tab, draft } : tab)),
    });
  },
  setComposerMode(id, mode) {
    set({
      tabs: get().tabs.map((tab) =>
        tab.id === id ? { ...tab, composerMode: mode } : tab,
      ),
    });
  },
  setApprovalMode(id, mode) {
    set({
      tabs: get().tabs.map((tab) =>
        tab.id === id ? { ...tab, approvalMode: mode } : tab,
      ),
    });
  },
  setSessions(id, sessions) {
    set({
      tabs: get().tabs.map((tab) => (tab.id === id ? { ...tab, sessions } : tab)),
    });
  },
}));
