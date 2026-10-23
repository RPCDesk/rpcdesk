import { Plus, X } from "lucide-react";
import { useTabs } from "../state/tabs";
import { useSettings } from "../state/settings";
import { pickDirectory } from "../lib/tauri";
import { startTab, stopTab } from "../lib/host";

function statusColor(status: string): string {
  if (status === "running") return "bg-[var(--accent)]";
  if (status === "error") return "bg-[var(--error)]";
  if (status === "starting" || status === "cold") return "bg-[var(--warning)]";
  return "bg-[var(--success)]";
}

export function TabStrip() {
  const tabs = useTabs((state) => state.tabs);
  const activeId = useTabs((state) => state.activeTabId);
  const activateTab = useTabs((state) => state.activateTab);
  const removeTab = useTabs((state) => state.removeTab);
  const addTab = useTabs((state) => state.addTab);
  const defaultBackend = useSettings((state) => state.settings.defaultBackend);

  const openWorkspace = async () => {
    const cwd = await pickDirectory();
    if (!cwd) return;
    const tab = addTab({ backend: defaultBackend, cwd });
    await startTab(tab);
  };

  return (
    <div className="drag-region flex h-12 shrink-0 items-center gap-2 border-b border-[var(--border)] bg-[var(--bg)] pl-[84px] pr-2">
      <div className="no-drag flex min-w-0 flex-1 items-center gap-1.5 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => activateTab(tab.id)}
            className={`group flex h-8 min-w-[150px] max-w-[240px] items-center gap-2 rounded-full px-3 text-left text-[12px] transition-colors ${
              tab.id === activeId
                ? "border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-sm)]"
                : "border border-transparent text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
            }`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${statusColor(tab.status)}`} />
            <span className="min-w-0 flex-1 truncate">{tab.title}</span>
            <span
              role="button"
              tabIndex={0}
              className="rounded-full p-0.5 opacity-0 hover:bg-[var(--surface-3)] group-hover:opacity-100"
              onClick={(event) => {
                event.stopPropagation();
                void stopTab(tab.id);
                removeTab(tab.id);
              }}
              onKeyDown={(event) => {
                if (event.key === "Enter" || event.key === " ") {
                  event.stopPropagation();
                  void stopTab(tab.id);
                  removeTab(tab.id);
                }
              }}
            >
              <X size={12} />
            </span>
          </button>
        ))}
        <button
          type="button"
          onClick={() => void openWorkspace()}
          className="flex w-9 items-center justify-center text-[var(--muted)] hover:bg-[var(--surface-2)]"
          title="New tab"
        >
          <Plus size={15} />
        </button>
      </div>
      <div className="drag-region w-6" />
    </div>
  );
}
