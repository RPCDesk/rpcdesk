import { useState } from "react";
import { FolderOpen, ShieldCheck, Sparkles } from "lucide-react";
import type { Backend } from "@pi-desktop/protocol";
import { pickDirectory, isTauri } from "../lib/tauri";
import { useTabs } from "../state/tabs";
import { useSettings } from "../state/settings";
import { startTab } from "../lib/host";
import { basename } from "../lib/format";

export function Welcome() {
  const [backend, setBackend] = useState<Backend>(
    useSettings.getState().settings.defaultBackend,
  );
  const tabs = useTabs((state) => state.tabs);
  const addTab = useTabs((state) => state.addTab);
  const activateTab = useTabs((state) => state.activateTab);

  const open = async () => {
    const cwd = await pickDirectory();
    if (!cwd) return;
    const tab = addTab({ backend, cwd });
    await startTab(tab);
  };

  const recent = Array.from(new Set(tabs.map((tab) => tab.cwd))).slice(0, 5);

  return (
    <div className="flex h-full flex-col items-center justify-center px-8">
      <div className="mb-5 flex h-14 w-14 items-center justify-center rounded-2xl bg-[var(--fg)] text-2xl font-semibold text-[var(--bg)]">
        π
      </div>
      <h1 className="text-[22px] font-semibold tracking-tight">Pi Desktop</h1>
      <p className="mt-1 max-w-md text-center text-[12px] leading-5 text-[var(--muted)]">
        A hackable front-end for pi and omp. Sessions, approvals, and plugins live
        in your own config directories.
      </p>

      <div className="mt-6 flex items-center gap-1 rounded-lg border border-[var(--border)] bg-[var(--surface)] p-1">
        {(["omp", "pi"] as Backend[]).map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => setBackend(value)}
            className={`rounded-md px-3 py-1.5 text-[12px] ${
              backend === value
                ? "bg-[var(--accent-soft)] text-[var(--fg)]"
                : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
            }`}
          >
            {value}
          </button>
        ))}
      </div>

      <button
        type="button"
        onClick={() => void open()}
        className="mt-4 flex items-center gap-2 rounded-lg bg-[var(--accent)] px-4 py-2 text-[12px] font-medium text-[var(--on-accent)]"
      >
        <FolderOpen size={14} />
        Open a workspace
      </button>

      {recent.length > 0 ? (
        <div className="mt-6 w-full max-w-sm">
          <div className="mb-2 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
            Recent
          </div>
          {recent.map((cwd) => (
            <button
              key={cwd}
              type="button"
              onClick={() => {
                const tab = tabs.find((item) => item.cwd === cwd);
                if (tab) activateTab(tab.id);
                else {
                  const created = addTab({ backend, cwd });
                  void startTab(created);
                }
              }}
              className="mb-1 flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-[11px] text-[var(--muted)] hover:bg-[var(--surface-2)]"
            >
              <FolderOpen size={12} />
              <span className="truncate">{basename(cwd)}</span>
              <span className="ml-auto max-w-[160px] truncate font-mono text-[10px]">
                {cwd}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="mt-8 flex items-center gap-4 text-[10px] text-[var(--muted)]">
        <span className="flex items-center gap-1">
          <ShieldCheck size={11} /> Local credentials
        </span>
        <span className="flex items-center gap-1">
          <Sparkles size={11} /> TS plugins
        </span>
        {!isTauri ? <span>Browser preview — open with Tauri</span> : null}
      </div>
    </div>
  );
}
