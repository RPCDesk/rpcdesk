import { useState } from "react";
import { Copy, ExternalLink, RefreshCw } from "lucide-react";
import type { Tab } from "../state/tabs";
import { openExternal } from "../lib/tauri";
import { restartTab } from "../lib/host";
import { useUi } from "../state/ui";

export function Onboarding({ tab }: { tab: Tab }) {
  const [copied, setCopied] = useState(false);
  const omp = tab.backend === "omp";
  const commands = omp
    ? ["omp", "/login"]
    : ["pi", "/login"];

  const copy = async () => {
    await navigator.clipboard.writeText(commands.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="mx-6 mb-3 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] p-3">
      <div className="text-[12px] font-medium">Connect a model provider</div>
      <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
        {omp
          ? "omp has no authenticated models yet. Run omp in a terminal and use /login."
          : "pi has no authenticated models yet. Run pi in a terminal and use /login, or set a provider API key."}
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <code className="rounded bg-[var(--surface)] px-2 py-1 font-mono text-[11px]">
          {commands.join("  ·  ")}
        </code>
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px]"
          onClick={() => void copy()}
        >
          <Copy size={11} /> {copied ? "Copied" : "Copy"}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px]"
          onClick={() =>
            void openExternal(omp ? "https://omp.sh/docs/providers" : "https://pi.dev/docs/latest")
          }
        >
          <ExternalLink size={11} /> Docs
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px]"
          onClick={() => {
            useUi.getState().pushToast("Restarting session…", "info");
            void restartTab(tab.id, { sessionFile: tab.sessionFile });
          }}
        >
          <RefreshCw size={11} /> Retry
        </button>
      </div>
    </div>
  );
}
