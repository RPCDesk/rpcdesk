import { useTabs } from "../state/tabs";
import { usePlugins } from "../plugins/host";
import { PluginErrorBoundary } from "../plugins/ErrorBoundary";
import { basename } from "../lib/format";

export function Inspector() {
  const tab = useTabs((state) =>
    state.tabs.find((item) => item.id === state.activeTabId),
  );
  const panels = usePlugins((state) => state.panels);

  return (
    <aside className="hidden w-[300px] shrink-0 flex-col border-l border-[var(--border)] bg-[var(--surface)] min-[900px]:flex">
      <div className="border-b border-[var(--border)] px-3 py-2 text-[11px] font-medium text-[var(--muted)]">
        Inspector
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 py-3">
        {panels.map((panel) => {
          const Component = panel.component;
          return (
            <div key={`${panel.pluginId}:${panel.id}`} className="mb-4">
              <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-[var(--muted)]">
                {panel.title}
              </div>
              <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
                <PluginErrorBoundary label={panel.title}>
                  <Component session={tab?.snapshot} lastEvent={undefined} />
                </PluginErrorBoundary>
              </div>
            </div>
          );
        })}

        {tab ? (
          <div className="rounded-lg border border-[var(--border)] bg-[var(--surface)] p-3">
            <div className="mb-2 text-[11px] font-medium">Session</div>
            <dl className="space-y-1.5 text-[11px]">
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Backend</dt>
                <dd>{tab.backend}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Workspace</dt>
                <dd className="truncate" title={tab.cwd}>
                  {basename(tab.cwd)}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Status</dt>
                <dd>{tab.status}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Thinking</dt>
                <dd>{tab.snapshot?.thinkingLevel ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Approval</dt>
                <dd>
                  {tab.snapshot?.effectiveApproval.mode ?? tab.approvalMode}
                </dd>
              </div>
              <div className="flex justify-between gap-2">
                <dt className="text-[var(--muted)]">Events</dt>
                <dd>{tab.transcript.debug.length}</dd>
              </div>
            </dl>
            {tab.sessionFile ? (
              <div className="mt-2 break-all font-mono text-[10px] text-[var(--muted)]">
                {tab.sessionFile}
              </div>
            ) : null}
          </div>
        ) : null}
      </div>
    </aside>
  );
}
