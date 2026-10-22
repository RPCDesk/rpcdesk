import { useState } from "react";
import { FolderOpen, Puzzle, RefreshCw, Sparkles, X } from "lucide-react";
import { usePlugins } from "../plugins/host";
import { useUi } from "../state/ui";
import { call } from "../lib/tauri";

export function PluginManager() {
  const close = useUi((state) => state.closePlugins);
  const pushToast = useUi((state) => state.pushToast);
  const plugins = usePlugins((state) => state.plugins);
  const errors = usePlugins((state) => state.errors);
  const loading = usePlugins((state) => state.loading);
  const reload = usePlugins((state) => state.reload);
  const setEnabled = usePlugins((state) => state.setEnabled);
  const createExample = usePlugins((state) => state.createExample);
  const [busy, setBusy] = useState<string | undefined>();

  const toggle = async (pluginId: string, enabled: boolean) => {
    setBusy(pluginId);
    try {
      await setEnabled(pluginId, enabled);
    } catch (error) {
      pushToast(error instanceof Error ? error.message : String(error), "error");
    } finally {
      setBusy(undefined);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/25 p-6">
      <div className="w-full max-w-[620px] overflow-hidden rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          <Puzzle size={15} />
          <div className="text-[13px] font-medium">Plugins</div>
          <button
            type="button"
            className="ml-auto rounded p-1 text-[var(--muted)] hover:bg-[var(--surface-2)]"
            onClick={close}
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[60vh] overflow-y-auto p-4">
          <div className="mb-3 text-[11px] leading-5 text-[var(--muted)]">
            Plugins live in <code className="font-mono">~/.pi-desktop/plugins</code>{" "}
            and are trusted local code. UI changes reload instantly; agent extensions
            apply to new or restarted sessions.
          </div>

          {plugins.length === 0 ? (
            <div className="rounded-lg border border-dashed border-[var(--border)] p-4 text-center text-[11px] text-[var(--muted)]">
              No plugins installed.
            </div>
          ) : (
            plugins.map((plugin) => (
              <div
                key={plugin.id}
                className="mb-2 rounded-lg border border-[var(--border)] px-3 py-2"
              >
                <div className="flex items-center gap-2">
                  <label className="flex items-center gap-2">
                    <input
                      type="checkbox"
                      checked={plugin.enabled}
                      disabled={Boolean(plugin.error) || busy === plugin.id}
                      onChange={(event) => void toggle(plugin.id, event.target.checked)}
                    />
                    <span className="text-[12px] font-medium">{plugin.name}</span>
                  </label>
                  <span className="font-mono text-[10px] text-[var(--muted)]">
                    v{plugin.version}
                  </span>
                  <span className="ml-auto flex gap-1 text-[9px] uppercase text-[var(--muted)]">
                    {plugin.ui ? <span>ui</span> : null}
                    {plugin.agent ? <span>agent</span> : null}
                  </span>
                </div>
                {plugin.description ? (
                  <div className="mt-1 text-[11px] text-[var(--muted)]">
                    {plugin.description}
                  </div>
                ) : null}
                {plugin.error ? (
                  <div className="mt-1 text-[11px] text-[var(--error)]">{plugin.error}</div>
                ) : null}
                {errors[plugin.id] ? (
                  <div className="mt-1 text-[11px] text-[var(--error)]">
                    {errors[plugin.id]}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center gap-2 border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-[11px]"
            onClick={() => void reload()}
          >
            <RefreshCw size={12} className={loading ? "animate-spin" : ""} /> Reload
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-[11px]"
            onClick={() => {
              void createExample()
                .then((path) =>
                  pushToast(
                    path ? `Created ${path}` : "Example plugin created",
                    "success",
                  ),
                )
                .catch((error: unknown) =>
                  pushToast(
                    error instanceof Error ? error.message : String(error),
                    "error",
                  ),
                );
            }}
          >
            <Sparkles size={12} /> Create example
          </button>
          <button
            type="button"
            className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1.5 text-[11px]"
            onClick={() => {
              void call("open_plugins_folder").catch((error: unknown) =>
                pushToast(
                  error instanceof Error ? error.message : String(error),
                  "error",
                ),
              );
            }}
          >
            <FolderOpen size={12} /> Folder
          </button>
          <button
            type="button"
            className="ml-auto rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-white"
            onClick={close}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
