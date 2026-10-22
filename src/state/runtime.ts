import { create } from "zustand";
import { listen } from "@tauri-apps/api/event";
import type { Backend } from "@pi-desktop/protocol";
import { call, isTauri } from "../lib/tauri";
import { useUi } from "./ui";

export interface RuntimeDownloadInfo {
  version: string;
  url: string;
  size: number;
  checksum: string;
}

export interface RuntimeStatus {
  backend: Backend;
  installed: boolean;
  path?: string;
  version?: string;
  source: "system" | "managed" | "missing";
  download: RuntimeDownloadInfo;
}

export interface DownloadProgress {
  backend: Backend;
  downloaded: number;
  total: number;
}

interface RuntimeStore {
  statuses: Partial<Record<Backend, RuntimeStatus>>;
  progress: Partial<Record<Backend, DownloadProgress>>;
  downloading: Partial<Record<Backend, boolean>>;
  load: () => Promise<void>;
  download: (backend: Backend) => Promise<void>;
  setProgress: (progress: DownloadProgress) => void;
}

async function fetchStatus(backend: Backend): Promise<RuntimeStatus | undefined> {
  try {
    return await call<RuntimeStatus>("runtime_status", { backend });
  } catch (error) {
    console.error(`Failed to inspect ${backend} runtime`, error);
    return undefined;
  }
}

export const useRuntime = create<RuntimeStore>((set, get) => ({
  statuses: {},
  progress: {},
  downloading: {},
  async load() {
    const [omp, pi] = await Promise.all([fetchStatus("omp"), fetchStatus("pi")]);
    set({
      statuses: {
        ...(omp ? { omp } : {}),
        ...(pi ? { pi } : {}),
      },
    });
  },
  async download(backend) {
    if (get().downloading[backend]) return;
    set({ downloading: { ...get().downloading, [backend]: true } });
    try {
      const status = await call<RuntimeStatus>("download_runtime", { backend });
      set({
        statuses: { ...get().statuses, [backend]: status },
        progress: { ...get().progress, [backend]: undefined },
      });
      useUi.getState().pushToast(
        `${backend} ${status.version ?? ""} installed`,
        "success",
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      useUi.getState().pushToast(message, "error");
    } finally {
      set({ downloading: { ...get().downloading, [backend]: false } });
    }
  },
  setProgress(progress) {
    set({ progress: { ...get().progress, [progress.backend]: progress } });
  },
}));

export function watchRuntimeDownloads(): () => void {
  if (!isTauri) return () => {};
  let dispose: (() => void) | undefined;
  void listen<DownloadProgress>("runtime-download", (event) => {
    useRuntime.getState().setProgress(event.payload);
  }).then((unlisten) => {
    dispose = unlisten;
  });
  return () => dispose?.();
}

export function formatBytes(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes <= 0) return "unknown size";
  if (bytes >= 1024 * 1024 * 1024) {
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  }
  return `${Math.round(bytes / (1024 * 1024))} MB`;
}
