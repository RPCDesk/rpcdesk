import { useEffect } from "react";
import { Download, HardDrive, RefreshCw } from "lucide-react";
import type { Backend } from "@pi-desktop/protocol";
import { useRuntime, formatBytes } from "../state/runtime";

export function RuntimeCard({ backend }: { backend: Backend }) {
  const status = useRuntime((state) => state.statuses[backend]);
  const progress = useRuntime((state) => state.progress[backend]);
  const downloading = useRuntime((state) => state.downloading[backend]);
  const download = useRuntime((state) => state.download);
  const load = useRuntime((state) => state.load);

  useEffect(() => {
    if (!status) void load();
  }, [status, load]);

  if (!status) {
    return (
      <div className="mx-6 mb-3 flex items-center gap-2 rounded-xl border border-[var(--border)] bg-[var(--surface)] p-3 text-[11px] text-[var(--muted)]">
        <RefreshCw size={12} className="animate-spin" />
        Checking {backend} runtime…
      </div>
    );
  }

  if (status.installed) return null;

  const percent = progress?.total
    ? Math.min(100, Math.round((progress.downloaded / progress.total) * 100))
    : 0;

  return (
    <div className="mx-6 mb-3 rounded-xl border border-[var(--warning)]/40 bg-[var(--warning-soft)] p-3">
      <div className="flex items-center gap-2 text-[12px] font-medium">
        <HardDrive size={13} />
        {backend} CLI not found
      </div>
      <div className="mt-1 text-[11px] leading-5 text-[var(--muted)]">
        Pi Desktop runs your installed {backend} CLI. Install it, or download the
        official standalone build ({formatBytes(status.download.size)}) into the app
        support folder. The download is verified with SHA-256.
      </div>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={downloading}
          className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px] disabled:opacity-50"
          onClick={() => void download(backend)}
        >
          <Download size={11} />
          {downloading ? "Downloading…" : `Download ${backend} ${status.download.version}`}
        </button>
        <button
          type="button"
          className="flex items-center gap-1 rounded border border-[var(--border)] bg-[var(--surface)] px-2 py-1 text-[11px]"
          onClick={() => void load()}
        >
          <RefreshCw size={11} /> Recheck
        </button>
        <span className="font-mono text-[10px] text-[var(--muted)]">
          {status.download.url}
        </span>
      </div>
      {downloading ? (
        <div className="mt-2">
          <div className="h-1 overflow-hidden rounded bg-[var(--border)]">
            <div
              className="h-full bg-[var(--accent)] transition-[width]"
              style={{ width: `${percent}%` }}
            />
          </div>
          <div className="mt-1 text-[10px] text-[var(--muted)]">
            {progress
              ? `${formatBytes(progress.downloaded)} / ${formatBytes(progress.total)}`
              : "Starting download…"}
          </div>
        </div>
      ) : null}
    </div>
  );
}
