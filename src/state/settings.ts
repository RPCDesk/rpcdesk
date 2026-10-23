import { create } from "zustand";
import type { ApprovalMode, Backend } from "@rpcdesk/protocol";
import { call } from "../lib/tauri";

export type UpdateMode = "off" | "notify" | "auto";

export interface AppSettings {
  version: 1;
  defaultBackend: Backend;
  approvalMode: ApprovalMode;
  approvalFallback: ApprovalMode;
  theme: string;
  showThinking: boolean;
  restoreTabs: boolean;
  fontScale: number;
  updateMode: UpdateMode;
  updateEndpoint: string;
}

export const DEFAULT_SETTINGS: AppSettings = {
  version: 1,
  defaultBackend: "omp",
  approvalMode: "follow-cli",
  approvalFallback: "write",
  theme: "system",
  showThinking: true,
  restoreTabs: true,
  fontScale: 1,
  updateMode: "notify",
  updateEndpoint: "",
};

interface SettingsStore {
  settings: AppSettings;
  loaded: boolean;
  load: () => Promise<void>;
  update: (patch: Partial<AppSettings>) => void;
}

async function persist(settings: AppSettings): Promise<void> {
  try {
    await call("save_settings", {
      contents: JSON.stringify(settings, null, 2),
    });
  } catch (error) {
    console.error("Failed to save settings", error);
  }
}

export const useSettings = create<SettingsStore>((set, get) => ({
  settings: DEFAULT_SETTINGS,
  loaded: false,
  async load() {
    try {
      const contents = await call<string | null>("load_settings");
      if (!contents) {
        set({ loaded: true });
        return;
      }
      const parsed = JSON.parse(contents) as Partial<AppSettings>;
      set({
        settings: { ...DEFAULT_SETTINGS, ...parsed, version: 1 },
        loaded: true,
      });
    } catch (error) {
      console.error("Failed to load settings", error);
      set({ loaded: true });
    }
  },
  update(patch) {
    const next = { ...get().settings, ...patch, version: 1 as const };
    set({ settings: next });
    void persist(next);
  },
}));
