import { useEffect } from "react";
import {
  FolderOpen,
  GitFork,
  Plus,
  RefreshCw,
  Settings,
  Puzzle,
  MessageSquare,
} from "lucide-react";
import type { Backend } from "@rpcdesk/protocol";
import { useTabs } from "../state/tabs";
import { useUi } from "../state/ui";
import { useSettings } from "../state/settings";
import { pickDirectory } from "../lib/tauri";
import {
  forkTab,
  listSessions,
  newSession,
  restartTab,
  resumeSession,
  startTab,
} from "../lib/host";
import { basename, relativeTime, truncate } from "../lib/format";

const requested = new Set<string>();

export function Sidebar() {
  const tab = useTabs((state) =>
    state.tabs.find((item) => item.id === state.activeTabId),
  );
  const addTab = useTabs((state) => state.addTab);
  const defaultBackend = useSettings((state) => state.settings.defaultBackend);
  const openSettings = useUi((state) => state.openSettings);
  const openPlugins = useUi((state) => state.openPlugins);

  useEffect(() => {
    if (!tab || tab.status !== "ready") return;
    const key = `${tab.id}:${tab.backend}:${tab.sessionFile ?? ""}`;
    if (requested.has(key)) return;
    requested.add(key);
    void listSessions(tab.id);
  }, [tab]);

  const openWorkspace = async () => {
    const cwd = await pickDirectory();
    if (!cwd) return;
    const created = addTab({ backend: defaultBackend, cwd });
    await startTab(created);
  };

  return (
    <aside className="flex w-[260px] shrink-0 flex-col border-r border-[var(--border)] bg-[var(--surface)] max-[900px]:w-[220px]">
      <div className="flex items-center gap-2 px-4 pb-2 pt-3">
        <div className="flex h-7 w-7 items-center justify-center rounded-xl bg-[var(--fg)] font-mono text-[11px] font-semibold tracking-[-0.05em] text-[var(--bg)]">
          ›_
        </div>
        <div className="text-[13px] font-semibold">rpcdesk</div>
        <button
          type="button"
          className="ml-auto rounded-full p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          onClick={() => void openWorkspace()}
          title="Open workspace"
        >
          <Plus size={14} />
        </button>
      </div>

      {tab ? (
        <>
          <div className="px-4 pb-3">
            <div className="flex items-center gap-1.5 text-[11px] text-[var(--muted)]">
              <FolderOpen size={12} />
              <span className="truncate" title={tab.cwd}>
                {basename(tab.cwd)}
              </span>
            </div>
            <div className="mt-1 truncate font-mono text-[10px] text-[var(--muted)]" title={tab.cwd}>
              {tab.cwd}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <select
                value={tab.backend}
                onChange={(event) =>
                  void restartTab(tab.id, {
                    backend: event.target.value as Backend,
                    sessionFile: undefined,
                    title: "New session",
                  })
                }
                className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-1.5 py-1 text-[11px]"
              >
                <option value="omp">omp</option>
                <option value="pi">pi</option>
              </select>
              <button
                type="button"
                className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2.5 py-1 text-[11px] transition-colors hover:bg-[var(--surface-2)]"
                onClick={() => void newSession(tab.id)}
              >
                <Plus size={11} /> New
              </button>
              <button
                type="button"
                className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-1 text-[11px] transition-colors hover:bg-[var(--surface-2)]"
                onClick={() => void forkTab(tab.id)}
                title="Fork at the latest user message"
              >
                <GitFork size={11} />
              </button>
            </div>
          </div>

          <div className="flex min-h-0 flex-1 flex-col">
            <div className="px-4 pb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
              Sessions
            </div>
            <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
              {tab.sessions.length === 0 ? (
                <div className="px-2 py-3 text-[11px] text-[var(--muted)]">
                  No saved sessions for this workspace yet.
                </div>
              ) : (
                tab.sessions.map((session) => {
                  const active = tab.sessionFile === session.path;
                  return (
                    <button
                      key={session.path}
                      type="button"
                      onClick={() => void resumeSession(tab.id, session.path)}
                      className={`mb-0.5 flex w-full items-start gap-2 rounded-xl px-2.5 py-2 text-left text-[11px] transition-colors ${
                        active
                          ? "bg-[var(--accent-soft)] text-[var(--fg)]"
                          : "text-[var(--muted)] hover:bg-[var(--surface-2)]"
                      }`}
                    >
                      <MessageSquare size={12} className="mt-0.5 shrink-0" />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[var(--fg)]">
                          {truncate(session.title, 46)}
                        </span>
                        <span className="block text-[10px]">
                          {relativeTime(session.updatedAt)}
                        </span>
                      </span>
                    </button>
                  );
                })
              )}
            </div>
          </div>

          {tab.error ? (
            <div className="mx-3 mb-2 rounded-xl border border-[var(--error)]/40 bg-[var(--error-soft)] p-2.5 text-[11px] text-[var(--error)]">
              <div className="mb-1 font-medium">Session error</div>
              <div className="break-words">{tab.error}</div>
              <button
                type="button"
                className="mt-2 flex items-center gap-1 rounded-full border border-[var(--error)]/40 px-2 py-0.5"
                onClick={() => void restartTab(tab.id, { sessionFile: tab.sessionFile })}
              >
                <RefreshCw size={10} /> Retry
              </button>
            </div>
          ) : null}
        </>
      ) : (
        <div className="px-4 py-6 text-[11px] text-[var(--muted)]">
          Open a workspace to start a session.
        </div>
      )}

      <div className="mt-auto flex items-center gap-1 border-t border-[var(--border)] p-2">
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          onClick={openPlugins}
        >
          <Puzzle size={13} /> Plugins
        </button>
        <button
          type="button"
          className="flex flex-1 items-center gap-1.5 rounded-xl px-2 py-1.5 text-[11px] text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
          onClick={openSettings}
        >
          <Settings size={13} /> Settings
        </button>
      </div>
    </aside>
  );
}
