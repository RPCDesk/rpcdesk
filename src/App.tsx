import { useEffect, useRef } from "react";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { TabStrip } from "./components/TabStrip";
import { Sidebar } from "./components/Sidebar";
import { StatusBar } from "./components/StatusBar";
import { Transcript } from "./components/Transcript";
import { Composer } from "./components/Composer";
import { Inspector } from "./components/Inspector";
import { Welcome } from "./components/Welcome";
import { Onboarding } from "./components/Onboarding";
import { RuntimeCard } from "./components/RuntimeCard";
import { UpdateBanner } from "./components/UpdateBanner";
import { DialogHost } from "./components/DialogHost";
import { ToastHost } from "./components/ToastHost";
import { SettingsSheet } from "./components/SettingsSheet";
import { PluginManager } from "./components/PluginManager";
import { useTabs } from "./state/tabs";
import { useSettings } from "./state/settings";
import { useThemes, applyTheme } from "./themes";
import { usePlugins } from "./plugins/host";
import { useRuntime, watchRuntimeDownloads } from "./state/runtime";
import { useUpdates, watchUpdateEvents } from "./state/updates";
import { useUi } from "./state/ui";
import { basename } from "./lib/format";
import {
  listenForConfigChanges,
  call,
  pickDirectory,
} from "./lib/tauri";
import { restartTab, startTab, stopTab } from "./lib/host";

interface PersistedState {
  version?: number;
  tabs?: Array<{
    id: string;
    backend: "omp" | "pi";
    cwd: string;
    sessionFile?: string;
    title: string;
  }>;
  activeTabId?: string;
}

function SessionView() {
  const tab = useTabs((state) =>
    state.tabs.find((item) => item.id === state.activeTabId),
  );

  if (!tab) return <Welcome />;

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex h-10 shrink-0 items-center gap-2 border-b border-[var(--border)] px-4">
        <div className="truncate text-[12px] font-medium">{tab.title}</div>
        <div className="truncate font-mono text-[10px] text-[var(--muted)]">
          {basename(tab.cwd)}
        </div>
        {tab.status === "starting" || tab.cold ? (
          <Loader2 size={12} className="animate-spin text-[var(--muted)]" />
        ) : null}
        <div className="ml-auto font-mono text-[10px] text-[var(--muted)]">
          {tab.backend}
        </div>
      </div>

      {tab.status === "error" ? (
        <div className="flex min-h-0 flex-1 flex-col items-center justify-center p-8">
          <RuntimeCard backend={tab.backend} />
          <div className="w-full max-w-md rounded-xl border border-[var(--error)]/40 bg-[var(--error-soft)] p-4">
            <div className="flex items-center gap-2 text-[13px] font-medium text-[var(--error)]">
              <AlertTriangle size={15} /> Session could not start
            </div>
            <div className="mt-2 whitespace-pre-wrap font-mono text-[11px] leading-5 text-[var(--error)]">
              {tab.error}
            </div>
            <button
              type="button"
              className="mt-3 flex items-center gap-1 rounded-md border border-[var(--error)]/40 px-2 py-1 text-[11px] text-[var(--error)]"
              onClick={() => void restartTab(tab.id, { sessionFile: tab.sessionFile })}
            >
              <RefreshCw size={11} /> Retry
            </button>
          </div>
        </div>
      ) : (
        <>
          {tab.status === "starting" && tab.transcript.entries.length === 0 ? (
            <div className="flex min-h-0 flex-1 items-center justify-center gap-2 text-[12px] text-[var(--muted)]">
              <Loader2 size={15} className="animate-spin" />
              Starting {tab.backend}…
            </div>
          ) : (
            <Transcript tab={tab} />
          )}
          {tab.snapshot && tab.snapshot.models.length === 0 ? (
            <Onboarding tab={tab} />
          ) : null}
          <Composer tab={tab} />
        </>
      )}
    </div>
  );
}

export default function App() {
  const sidebarVisible = useUi((state) => state.sidebarVisible);
  const inspectorVisible = useUi((state) => state.inspectorVisible);
  const settingsOpen = useUi((state) => state.settingsOpen);
  const pluginsOpen = useUi((state) => state.pluginsOpen);
  const settings = useSettings((state) => state.settings);
  const themes = useThemes((state) => state.themes);
  const activeTabId = useTabs((state) => state.activeTabId);
  const hydrated = useRef(false);
  const starting = useRef(new Set<string>());
  const saveTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  const ensureStarted = (tabId: string) => {
    const tab = useTabs.getState().tabs.find((item) => item.id === tabId);
    if (!tab || !tab.cold || starting.current.has(tabId)) return;
    starting.current.add(tabId);
    void startTab(tab).finally(() => starting.current.delete(tabId));
  };

  useEffect(() => {
    let cancelled = false;
    const bootstrap = async () => {
      await Promise.all([
        useSettings.getState().load(),
        useThemes.getState().load(),
        usePlugins.getState().load(),
        useRuntime.getState().load(),
        useUpdates.getState().loadVersion(),
      ]);
      void useUpdates.getState().check();
      const current = useSettings.getState().settings;
      if (current.restoreTabs) {
        try {
          const raw = await call<string | null>("load_ui_state");
          if (raw) {
            const parsed = JSON.parse(raw) as PersistedState;
            if (!cancelled && Array.isArray(parsed.tabs) && parsed.tabs.length > 0) {
              useTabs
                .getState()
                .restoreTabs(parsed.tabs, parsed.activeTabId);
            }
          }
        } catch (error) {
          console.error("Failed to restore tabs", error);
        }
      }
      if (cancelled) return;
      hydrated.current = true;
      const activeId = useTabs.getState().activeTabId;
      if (activeId) ensureStarted(activeId);
    };
    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const unsubscribe = useTabs.subscribe((state) => {
      if (!hydrated.current) return;
      if (saveTimer.current) clearTimeout(saveTimer.current);
      saveTimer.current = setTimeout(() => {
        const payload: PersistedState = {
          version: 1,
          tabs: state.tabs.map((tab) => ({
            id: tab.id,
            backend: tab.backend,
            cwd: tab.cwd,
            sessionFile: tab.sessionFile,
            title: tab.title,
          })),
          activeTabId: state.activeTabId,
        };
        void call("save_ui_state", {
          contents: JSON.stringify(payload),
        }).catch((error) => console.error("Failed to save tabs", error));
      }, 500);
    });
    return () => {
      unsubscribe();
      if (saveTimer.current) clearTimeout(saveTimer.current);
    };
  }, []);

  useEffect(() => {
    applyTheme(settings.theme, themes);
  }, [settings.theme, themes]);

  useEffect(() => {
    if (activeTabId) ensureStarted(activeTabId);
  }, [activeTabId]);

  useEffect(() => {
    const dispose = watchRuntimeDownloads();
    return dispose;
  }, []);

  useEffect(() => watchUpdateEvents(), []);

  useEffect(() => {
    let unlisten: (() => void) | undefined;
    let timer: ReturnType<typeof setTimeout> | undefined;
    void listenForConfigChanges(() => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => {
        void usePlugins.getState().reload();
        void useThemes.getState().load();
      }, 400);
    }).then((dispose) => {
      unlisten = dispose;
    });
    return () => {
      if (timer) clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  useEffect(() => {
    const openWorkspace = async () => {
      const cwd = await pickDirectory();
      if (!cwd) return;
      const tab = useTabs.getState().addTab({
        backend: useSettings.getState().settings.defaultBackend,
        cwd,
      });
      await startTab(tab);
    };

    const onKey = (event: KeyboardEvent) => {
      const meta = event.metaKey || event.ctrlKey;
      if (!meta) return;
      if (event.key === "t") {
        event.preventDefault();
        void openWorkspace();
        return;
      }
      if (event.key === "w") {
        event.preventDefault();
        const id = useTabs.getState().activeTabId;
        if (!id) return;
        void stopTab(id);
        useTabs.getState().removeTab(id);
        return;
      }
      if (event.key === ",") {
        event.preventDefault();
        useUi.getState().openSettings();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="flex h-full flex-col">
      <TabStrip />
      <div className="flex min-h-0 flex-1">
        {sidebarVisible ? <Sidebar /> : null}
        <main className="flex min-w-0 flex-1 flex-col">
          <UpdateBanner />
          <SessionView />
        </main>
        {inspectorVisible && activeTabId ? <Inspector /> : null}
      </div>
      <StatusBar />
      <DialogHost />
      <ToastHost />
      {settingsOpen ? <SettingsSheet /> : null}
      {pluginsOpen ? <PluginManager /> : null}
    </div>
  );
}
