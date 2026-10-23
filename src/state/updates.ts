import { create } from "zustand";
import { getVersion } from "@tauri-apps/api/app";
import { listen } from "@tauri-apps/api/event";
import { call, isTauri } from "../lib/tauri";
import { useSettings, type UpdateMode } from "./settings";
import { useUi } from "./ui";

export interface UpdateInfo {
  version: string;
  currentVersion: string;
  notes?: string;
  date?: string;
}

export type UpdateStatus =
  | "idle"
  | "checking"
  | "available"
  | "up-to-date"
  | "downloading"
  | "installing"
  | "installed"
  | "error";

export interface UpdateProgress {
  chunk: number;
  total: number | null;
}

interface UpdateStore {
  currentVersion: string;
  feedConfigured: boolean;
  status: UpdateStatus;
  info?: UpdateInfo;
  error?: string;
  progress?: UpdateProgress;
  dismissed: boolean;
  loadVersion: () => Promise<void>;
  check: (options?: { manual?: boolean }) => Promise<void>;
  install: () => Promise<void>;
  dismiss: () => void;
  restart: () => Promise<void>;
  setProgress: (progress: UpdateProgress) => void;
  applyInstalled: (version: string) => void;
}

/** The app only checks when the user enabled checking. */
export function shouldCheckForUpdates(mode: UpdateMode): boolean {
  return mode !== "off";
}

/** Automatic mode installs without asking. */
export function shouldInstallAutomatically(mode: UpdateMode): boolean {
  return mode === "auto";
}

export function formatProgress(progress: UpdateProgress | undefined): string {
  if (!progress) return "Downloading…";
  const downloaded = Math.round(progress.chunk / (1024 * 1024));
  if (!progress.total) return `${downloaded} MB`;
  const total = Math.round(progress.total / (1024 * 1024));
  return `${downloaded} / ${total} MB`;
}

export function updateSummary(
  status: UpdateStatus,
  info: UpdateInfo | undefined,
  progress: UpdateProgress | undefined,
  currentVersion: string,
): string {
  switch (status) {
    case "checking":
      return "Checking for updates…";
    case "available":
      return info
        ? `Version ${info.version} is available (you have ${currentVersion}).`
        : "An update is available.";
    case "up-to-date":
      return `rpcdesk ${currentVersion} is up to date.`;
    case "downloading":
      return `Downloading ${info?.version ?? "update"} — ${formatProgress(progress)}`;
    case "installing":
      return "Installing update…";
    case "installed":
      return `Updated to ${info?.version ?? "the new version"}.`;
    case "error":
      return "Update failed.";
    default:
      return "Not checked yet.";
  }
}

export const useUpdates = create<UpdateStore>((set, get) => ({
  currentVersion: "",
  feedConfigured: false,
  status: "idle",
  dismissed: false,
  async loadVersion() {
    if (!isTauri) return;
    try {
      const [currentVersion, feedConfigured] = await Promise.all([
        getVersion(),
        call<boolean>("update_feed_configured"),
      ]);
      set({ currentVersion, feedConfigured });
    } catch (error) {
      console.error("Failed to read the app version", error);
    }
  },
  async check(options) {
    if (!isTauri) return;
    const manual = options?.manual ?? false;
    const mode = useSettings.getState().settings.updateMode;
    if (!manual && !shouldCheckForUpdates(mode)) return;
    // Nothing to check against yet; the settings field or the environment provides the feed.
    if (!manual && !get().feedConfigured) return;
    if (get().status === "checking" || get().status === "downloading") return;

    const endpoint = useSettings.getState().settings.updateEndpoint.trim();
    set({ status: "checking", error: undefined });
    try {
      const info = await call<UpdateInfo | null>("check_update", {
        endpoint: endpoint || undefined,
      });
      if (!info) {
        set({ status: "up-to-date", info: undefined });
        if (manual) {
          useUi
            .getState()
            .pushToast(`rpcdesk ${get().currentVersion} is up to date`, "success");
        }
        return;
      }
      set({ status: "available", info, dismissed: false });
      if (shouldInstallAutomatically(mode)) {
        await get().install();
        return;
      }
      if (manual) {
        useUi
          .getState()
          .pushToast(`rpcdesk ${info.version} is available`, "info");
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: "error", error: message });
      if (manual) useUi.getState().pushToast(message, "error");
    }
  },
  async install() {
    if (!isTauri) return;
    const endpoint = useSettings.getState().settings.updateEndpoint.trim();
    set({ status: "downloading", error: undefined, progress: undefined });
    try {
      const version = await call<string | null>("install_update", {
        endpoint: endpoint || undefined,
      });
      set({
        status: "installed",
        info: version
          ? { ...(get().info ?? { currentVersion: get().currentVersion }), version }
          : get().info,
        progress: undefined,
      });
      useUi
        .getState()
        .pushToast(`Updated to ${version ?? "the new version"} — restarting`, "success");
      setTimeout(() => {
        void get().restart();
      }, 900);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      set({ status: "error", error: message });
      useUi.getState().pushToast(message, "error");
    }
  },
  dismiss() {
    set({ dismissed: true });
  },
  async restart() {
    if (!isTauri) return;
    try {
      await call("restart_app");
    } catch (error) {
      console.error("Failed to restart the app", error);
    }
  },
  setProgress(progress) {
    set({ progress, status: "downloading" });
  },
  applyInstalled(version) {
    set({ status: "installed", progress: undefined });
    useUi
      .getState()
      .pushToast(`Updated to ${version} — restart to finish`, "success");
  },
}));

export function watchUpdateEvents(): () => void {
  if (!isTauri) return () => {};
  const disposers: Array<() => void> = [];
  void listen<UpdateProgress>("update-progress", (event) => {
    useUpdates.getState().setProgress(event.payload);
  }).then((unlisten) => disposers.push(unlisten));
  void listen<{ version: string }>("update-installed", (event) => {
    useUpdates.getState().applyInstalled(event.payload.version);
  }).then((unlisten) => disposers.push(unlisten));
  return () => {
    for (const dispose of disposers) dispose();
  };
}
