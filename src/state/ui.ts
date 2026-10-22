import { create } from "zustand";

export interface ToastMessage {
  id: string;
  message: string;
  level: "info" | "warning" | "error" | "success";
}

interface UiStore {
  settingsOpen: boolean;
  pluginsOpen: boolean;
  commandPaletteOpen: boolean;
  sidebarVisible: boolean;
  inspectorVisible: boolean;
  toasts: ToastMessage[];
  status: Record<string, string | undefined>;
  openSettings: () => void;
  closeSettings: () => void;
  openPlugins: () => void;
  closePlugins: () => void;
  setCommandPalette: (open: boolean) => void;
  toggleSidebar: () => void;
  toggleInspector: () => void;
  pushToast: (message: string, level?: ToastMessage["level"]) => void;
  dismissToast: (id: string) => void;
  setStatus: (key: string, text?: string) => void;
}

export const useUi = create<UiStore>((set, get) => ({
  settingsOpen: false,
  pluginsOpen: false,
  commandPaletteOpen: false,
  sidebarVisible: true,
  inspectorVisible: true,
  toasts: [],
  status: {},
  openSettings: () => set({ settingsOpen: true }),
  closeSettings: () => set({ settingsOpen: false }),
  openPlugins: () => set({ pluginsOpen: true }),
  closePlugins: () => set({ pluginsOpen: false }),
  setCommandPalette: (open) => set({ commandPaletteOpen: open }),
  toggleSidebar: () => set({ sidebarVisible: !get().sidebarVisible }),
  toggleInspector: () => set({ inspectorVisible: !get().inspectorVisible }),
  pushToast(message, level = "info") {
    const id = crypto.randomUUID();
    set({ toasts: [...get().toasts, { id, message, level }].slice(-4) });
  },
  dismissToast(id) {
    set({ toasts: get().toasts.filter((toast) => toast.id !== id) });
  },
  setStatus(key, text) {
    const next = { ...get().status };
    if (text === undefined) delete next[key];
    else next[key] = text;
    set({ status: next });
  },
}));
