import {
  Activity,
  Monitor,
  Moon,
  PanelLeft,
  PanelRight,
  Settings,
  ShieldCheck,
  Sun,
} from "lucide-react";
import type { ApprovalMode, ThinkingLevel } from "@rpcdesk/protocol";
import { useTabs } from "../state/tabs";
import { useUi } from "../state/ui";
import { setApprovalMode, setModel, setThinking } from "../lib/host";
import { useSettings } from "../state/settings";
import { appearanceLabel, nextAppearance } from "../state/appearance";

function AppearanceButton() {
  const theme = useSettings((state) => state.settings.theme);
  const update = useSettings((state) => state.update);
  const current = appearanceLabel(theme);
  const next = nextAppearance(theme);
  const Icon = current === "light" ? Sun : current === "dark" ? Moon : Monitor;
  const label =
    current === "custom"
      ? `Theme: ${theme} (click for system)`
      : `Theme: ${current} (click for ${next})`;

  return (
    <button
      type="button"
      className="rounded-full p-1 hover:bg-[var(--surface-2)]"
      title={label}
      aria-label={label}
      onClick={() => update({ theme: next })}
    >
      <Icon size={13} />
    </button>
  );
}

const APPROVAL_LABELS: Record<ApprovalMode, string> = {
  "follow-cli": "Follow CLI",
  "always-ask": "Always ask",
  write: "Write",
  yolo: "Yolo",
};

const THINKING_LEVELS: ThinkingLevel[] = [
  "off",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "auto",
];

export function StatusBar() {
  const tab = useTabs((state) =>
    state.tabs.find((item) => item.id === state.activeTabId),
  );
  const toggleSidebar = useUi((state) => state.toggleSidebar);
  const toggleInspector = useUi((state) => state.toggleInspector);
  const openSettings = useUi((state) => state.openSettings);
  const snapshot = tab?.snapshot;
  const effective = snapshot?.effectiveApproval;

  return (
    <div className="flex h-9 shrink-0 items-center gap-1.5 border-t border-[var(--border)] bg-[var(--bg)] px-3 text-[10px] text-[var(--muted)]">
      <button
        type="button"
        className="rounded-full p-1 hover:bg-[var(--surface-2)]"
        onClick={toggleSidebar}
        title="Toggle sidebar"
      >
        <PanelLeft size={13} />
      </button>

      {tab ? (
        <>
          <div className="flex items-center gap-1 rounded-full border border-[var(--border)] px-2 py-0.5">
            <ShieldCheck size={11} />
            <select
              value={tab.approvalMode}
              onChange={(event) =>
                setApprovalMode(tab.id, event.target.value as ApprovalMode)
              }
              className="bg-transparent text-[10px] outline-none"
            >
              {(Object.keys(APPROVAL_LABELS) as ApprovalMode[]).map((mode) => (
                <option key={mode} value={mode}>
                  {APPROVAL_LABELS[mode]}
                </option>
              ))}
            </select>
            {effective ? (
              <span className="text-[var(--muted)]">
                · {APPROVAL_LABELS[effective.mode]} ({effective.source})
              </span>
            ) : null}
          </div>

          <select
            value={
              snapshot?.model
                ? `${snapshot.model.provider}/${snapshot.model.id}`
                : ""
            }
            onChange={(event) => {
              const [provider, ...rest] = event.target.value.split("/");
              const modelId = rest.join("/");
              if (provider && modelId) setModel(tab.id, provider, modelId);
            }}
            className="max-w-[240px] rounded border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-[10px] outline-none"
          >
            {!snapshot?.model ? <option value="">No model</option> : null}
            {snapshot?.models.map((model) => (
              <option
                key={`${model.provider}/${model.id}`}
                value={`${model.provider}/${model.id}`}
              >
                {model.name}
              </option>
            ))}
          </select>

          <select
            value={snapshot?.thinkingLevel ?? "medium"}
            onChange={(event) =>
              setThinking(tab.id, event.target.value as ThinkingLevel)
            }
            className="rounded border border-[var(--border)] bg-transparent px-1.5 py-0.5 text-[10px] outline-none"
          >
            {THINKING_LEVELS.map((level) => (
              <option key={level} value={level}>
                {level}
              </option>
            ))}
          </select>
        </>
      ) : (
        <span>No active session</span>
      )}

      <div className="ml-auto flex items-center gap-2">
        {tab?.transcript.running ? (
          <span className="flex items-center gap-1 text-[var(--accent)]">
            <Activity size={11} className="animate-pulse" />
            Running
          </span>
        ) : null}
        {tab && tab.transcript.queued.steer + tab.transcript.queued.followUp > 0 ? (
          <span>
            {tab.transcript.queued.steer} steer · {tab.transcript.queued.followUp} queued
          </span>
        ) : null}
        {tab ? <span>{tab.status}</span> : null}
        <AppearanceButton />
        <button
          type="button"
          className="rounded-full p-1 hover:bg-[var(--surface-2)]"
          onClick={toggleInspector}
          title="Toggle inspector"
        >
          <PanelRight size={13} />
        </button>
        <button
          type="button"
          className="rounded-full p-1 hover:bg-[var(--surface-2)]"
          onClick={openSettings}
          title="Settings"
        >
          <Settings size={13} />
        </button>
      </div>
    </div>
  );
}
