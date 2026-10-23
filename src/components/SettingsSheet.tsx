import { useEffect } from "react";
import { ExternalLink, X } from "lucide-react";
import type { ApprovalMode, Backend } from "@pi-desktop/protocol";
import { useSettings } from "../state/settings";
import { useRuntime, formatBytes } from "../state/runtime";
import { UpdateSettings } from "./UpdateBanner";
import { ThemePicker } from "./ThemePicker";
import { useThemes } from "../themes";
import { useUi } from "../state/ui";
import { useTabs } from "../state/tabs";
import { openExternal } from "../lib/tauri";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2">
      <div className="text-[12px] text-[var(--muted)]">{label}</div>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-5">
      <h3 className="mb-1.5 px-1 text-[10px] font-medium uppercase tracking-[0.08em] text-[var(--muted)]">
        {title}
      </h3>
      <div className="rounded-2xl border border-[var(--border)] bg-[var(--bg)]/50 px-4 py-1.5">
        {children}
      </div>
    </section>
  );
}

const selectClass =
  "rounded-full border border-[var(--border)] bg-[var(--surface)] px-2.5 py-1 text-[11px] outline-none transition-colors hover:border-[var(--border-strong)]";

export function SettingsSheet() {
  const close = useUi((state) => state.closeSettings);
  const openPlugins = useUi((state) => state.openPlugins);
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const themes = useThemes((state) => state.themes);
  const runtimes = useRuntime((state) => state.statuses);
  const downloading = useRuntime((state) => state.downloading);
  const downloadRuntime = useRuntime((state) => state.download);
  const progress = useRuntime((state) => state.progress);
  const tab = useTabs((state) =>
    state.tabs.find((item) => item.id === state.activeTabId),
  );

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-6 backdrop-blur-[2px]">
      <div className="w-full max-w-[640px] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-5 py-3.5">
          <div className="text-[13px] font-semibold tracking-[-0.01em]">Settings</div>
          <button
            type="button"
            className="ml-auto rounded-full p-1.5 text-[var(--muted)] transition-colors hover:bg-[var(--surface-2)] hover:text-[var(--fg)]"
            onClick={close}
          >
            <X size={14} />
          </button>
        </div>

        <div className="max-h-[68vh] overflow-y-auto px-5 py-4">
          <Section title="General">
            <Row label="Default backend">
              <select
                value={settings.defaultBackend}
                onChange={(event) =>
                  update({ defaultBackend: event.target.value as Backend })
                }
                className={selectClass}
              >
                <option value="omp">omp</option>
                <option value="pi">pi</option>
              </select>
            </Row>
            <Row label="Restore tabs on launch">
              <input
                type="checkbox"
                checked={settings.restoreTabs}
                onChange={(event) => update({ restoreTabs: event.target.checked })}
              />
            </Row>
            <Row label="Show thinking blocks">
              <input
                type="checkbox"
                checked={settings.showThinking}
                onChange={(event) => update({ showThinking: event.target.checked })}
              />
            </Row>
          </Section>

          <Section title="Approvals">
            <Row label="Default mode">
              <select
                value={settings.approvalMode}
                onChange={(event) =>
                  update({ approvalMode: event.target.value as ApprovalMode })
                }
                className={selectClass}
              >
                <option value="follow-cli">Follow CLI config</option>
                <option value="write">Auto write, ask exec</option>
                <option value="always-ask">Always ask for writes and exec</option>
                <option value="yolo">Yolo</option>
              </select>
            </Row>
            <Row label="Fallback when no CLI policy">
              <select
                value={settings.approvalFallback}
                onChange={(event) =>
                  update({ approvalFallback: event.target.value as ApprovalMode })
                }
                className={selectClass}
              >
                <option value="always-ask">Always ask</option>
                <option value="write">Auto write, ask exec</option>
                <option value="yolo">Yolo</option>
              </select>
            </Row>
            <div className="py-1.5 text-[10px] leading-4 text-[var(--muted)]">
              pi has no CLI approval policy, so follow-CLI uses the fallback. The
              active mode is shown in the status bar with its source.
            </div>
          </Section>

          <Section title="Appearance">
            <ThemePicker
              value={settings.theme}
              themes={themes}
              onChange={(theme) => update({ theme })}
            />
          </Section>

          <Section title="Updates">
            <UpdateSettings />
          </Section>

          <Section title="Runtimes">
            {(["omp", "pi"] as Backend[]).map((backend) => {
              const status = runtimes[backend];
              const runtimeProgress = progress[backend];
              return (
                <Row key={backend} label={backend}>
                  <div className="flex flex-col items-end gap-1 py-1">
                    {status ? (
                      <>
                        <div className="font-mono text-[10px] text-[var(--muted)]">
                          {status.installed
                            ? `${status.version} · ${status.source}`
                            : `missing · download ${formatBytes(status.download.size)}`}
                        </div>
                        {status.path ? (
                          <div className="max-w-[300px] break-all text-right font-mono text-[9px] text-[var(--muted)]">
                            {status.path}
                          </div>
                        ) : null}
                        {!status.installed ? (
                          <button
                            type="button"
                            disabled={downloading[backend]}
                            className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] disabled:opacity-50"
                            onClick={() => void downloadRuntime(backend)}
                          >
                            {downloading[backend]
                              ? runtimeProgress
                                ? `${Math.round(
                                    (runtimeProgress.downloaded /
                                      Math.max(1, runtimeProgress.total)) *
                                      100,
                                  )}%`
                                : "Downloading…"
                              : `Download ${status.download.version}`}
                          </button>
                        ) : null}
                      </>
                    ) : (
                      <span className="text-[10px] text-[var(--muted)]">checking…</span>
                    )}
                  </div>
                </Row>
              );
            })}
            <div className="py-1.5 text-[10px] leading-4 text-[var(--muted)]">
              System CLIs are preferred. Managed copies live in the app support
              folder under <code className="font-mono">runtimes/</code> and are
              verified with SHA-256.
            </div>
          </Section>

          <Section title="Plugins">
            <Row label="User plugins">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px]"
                onClick={() => {
                  close();
                  openPlugins();
                }}
              >
                Manage plugins
              </button>
            </Row>
            <div className="py-1.5 text-[10px] leading-4 text-[var(--muted)]">
              Plugins are trusted local code from ~/.pi-desktop/plugins. They can
              register panels, tool renderers, commands, themes, and agent-side tools.
            </div>
          </Section>

          <Section title="Paths">
            <div className="space-y-1 py-1.5 font-mono text-[10px] text-[var(--muted)]">
              <div>omp config: ~/.omp</div>
              <div>pi config: ~/.pi</div>
              <div>app config: ~/.pi-desktop</div>
              <div>logs: macOS ~/Library/Logs/Pi Desktop; Windows/Linux app support/logs</div>
            </div>
            <Row label="Provider docs">
              <div className="flex gap-2">
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] text-[var(--accent)]"
                  onClick={() => void openExternal("https://omp.sh/docs/providers")}
                >
                  omp <ExternalLink size={10} />
                </button>
                <button
                  type="button"
                  className="flex items-center gap-1 text-[11px] text-[var(--accent)]"
                  onClick={() => void openExternal("https://pi.dev/docs/latest")}
                >
                  pi <ExternalLink size={10} />
                </button>
              </div>
            </Row>
          </Section>

          <Section title="Diagnostics">
            <Row label="Version">
              <span className="font-mono text-[11px]">Pi Desktop 0.1.0</span>
            </Row>
            <Row label="Active session">
              <span className="font-mono text-[11px]">
                {tab ? `${tab.backend} · ${tab.status}` : "none"}
              </span>
            </Row>
            <Row label="Protocol events seen">
              <span className="font-mono text-[11px]">
                {tab?.transcript.debug.length ?? 0}
              </span>
            </Row>
          </Section>
        </div>

        <div className="flex justify-end border-t border-[var(--border)] px-4 py-3">
          <button
            type="button"
            className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[11px] font-medium text-[var(--on-accent)]"
            onClick={close}
          >
            Done
          </button>
        </div>
      </div>
    </div>
  );
}
