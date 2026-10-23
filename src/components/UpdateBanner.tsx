import { Download, RefreshCw } from "lucide-react";
import { useSettings } from "../state/settings";
import { useUpdates, updateSummary, formatProgress } from "../state/updates";

export function UpdateBanner() {
  const mode = useSettings((state) => state.settings.updateMode);
  const status = useUpdates((state) => state.status);
  const info = useUpdates((state) => state.info);
  const progress = useUpdates((state) => state.progress);
  const currentVersion = useUpdates((state) => state.currentVersion);
  const dismissed = useUpdates((state) => state.dismissed);
  const install = useUpdates((state) => state.install);
  const dismiss = useUpdates((state) => state.dismiss);

  if (mode === "off") return null;
  if (dismissed) return null;
  if (status !== "available" && status !== "downloading") return null;

  const downloading = status === "downloading";

  return (
    <div className="flex items-center gap-3 border-b border-[var(--border)] bg-[var(--accent-soft)] px-4 py-2 text-[12px]">
      <Download size={13} className="shrink-0 text-[var(--accent)]" />
      <div className="min-w-0">
        <span className="font-medium">
          {downloading
            ? `Installing Pi Desktop ${info?.version ?? ""}`
            : `Pi Desktop ${info?.version ?? "update"} is available`}
        </span>
        <span className="ml-2 text-[var(--muted)]">
          {downloading
            ? formatProgress(progress)
            : `you have ${currentVersion}`}
        </span>
      </div>
      <div className="ml-auto flex shrink-0 items-center gap-2">
        <button
          type="button"
          disabled={downloading}
          className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-[var(--on-accent)] disabled:opacity-60"
          onClick={() => void install()}
        >
          {downloading ? "Installing…" : "Install and restart"}
        </button>
        <button
          type="button"
          disabled={downloading}
          className="rounded-md border border-[var(--border)] px-2.5 py-1 text-[11px] disabled:opacity-60"
          onClick={dismiss}
        >
          Later
        </button>
      </div>
    </div>
  );
}

export function UpdateSettings() {
  const settings = useSettings((state) => state.settings);
  const update = useSettings((state) => state.update);
  const status = useUpdates((state) => state.status);
  const info = useUpdates((state) => state.info);
  const progress = useUpdates((state) => state.progress);
  const error = useUpdates((state) => state.error);
  const currentVersion = useUpdates((state) => state.currentVersion);
  const check = useUpdates((state) => state.check);
  const install = useUpdates((state) => state.install);

  const busy = status === "checking" || status === "downloading" || status === "installing";

  return (
    <div className="space-y-2 py-2">
      <div className="flex items-center justify-between gap-4">
        <div className="text-[12px] text-[var(--muted)]">Updates</div>
        <select
          value={settings.updateMode}
          onChange={(event) =>
            update({ updateMode: event.target.value as typeof settings.updateMode })
          }
          className="rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] outline-none"
        >
          <option value="off">Off</option>
          <option value="notify">Check and ask</option>
          <option value="auto">Install automatically</option>
        </select>
      </div>

      <div className="flex items-center justify-between gap-4">
        <div className="text-[12px] text-[var(--muted)]">Update feed URL</div>
        <input
          type="text"
          spellCheck={false}
          placeholder="https://example.com/pi-desktop/latest.json"
          value={settings.updateEndpoint}
          onChange={(event) => update({ updateEndpoint: event.target.value })}
          className="w-[320px] rounded-md border border-[var(--border)] bg-[var(--surface)] px-2 py-1 font-mono text-[10px] outline-none"
        />
      </div>

      <div className="flex items-start justify-between gap-4">
        <div className="text-[12px] text-[var(--muted)]">
          Pi Desktop {currentVersion || "…"}
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy}
              className="flex items-center gap-1 rounded-md border border-[var(--border)] px-2 py-1 text-[11px] disabled:opacity-50"
              onClick={() => void check({ manual: true })}
            >
              <RefreshCw size={11} className={status === "checking" ? "animate-spin" : ""} />
              Check now
            </button>
            {status === "available" ? (
              <button
                type="button"
                className="rounded-md bg-[var(--accent)] px-2 py-1 text-[11px] font-medium text-[var(--on-accent)]"
                onClick={() => void install()}
              >
                Install {info?.version}
              </button>
            ) : null}
          </div>
          <div className="text-right text-[10px] text-[var(--muted)]">
            {updateSummary(status, info, progress, currentVersion)}
          </div>
          {error ? (
            <div className="max-w-[360px] whitespace-pre-wrap text-right font-mono text-[10px] text-[var(--error)]">
              {error}
            </div>
          ) : null}
        </div>
      </div>

      <div className="text-[10px] leading-4 text-[var(--muted)]">
        Checks use the feed URL, or <code className="font-mono">PI_DESKTOP_UPDATE_ENDPOINT</code>{" "}
        when the field is empty. Updates must be signed with the release key; macOS and
        Windows install in place, Linux only supports AppImage.
      </div>
    </div>
  );
}
