import { CornerDownRight, Plus, Minus } from "lucide-react";
import type { ToolDiff } from "../state/transcript";

export function DiffView({ diff }: { diff: ToolDiff }) {
  const lines = diff.patch
    .split("\n")
    .filter(
      (line) =>
        !line.startsWith("Index:") &&
        !line.startsWith("===") &&
        !line.startsWith("---") &&
        !line.startsWith("+++"),
    );

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <div className="flex items-center gap-2 border-b border-[var(--border)] px-3 py-2 text-[11px] text-[var(--muted)]">
        <CornerDownRight size={12} />
        <span className="truncate font-mono">{diff.path}</span>
        <span className="ml-auto text-[var(--success)]">+{diff.added}</span>
        <span className="text-[var(--error)]">-{diff.removed}</span>
      </div>
      <div className="max-h-80 overflow-auto py-1 font-mono text-[11px] leading-5">
        {lines.map((line, index) => {
          const added = line.startsWith("+");
          const removed = line.startsWith("-");
          const hunk = line.startsWith("@@");
          return (
            <div
              key={`${index}-${line.slice(0, 12)}`}
              className={
                hunk
                  ? "px-3 py-1 text-[var(--muted)]"
                  : added
                    ? "bg-[var(--success-soft)] px-3 text-[var(--success)]"
                    : removed
                      ? "bg-[var(--error-soft)] px-3 text-[var(--error)]"
                      : "px-3 text-[var(--fg)]"
              }
            >
              <span className="mr-2 inline-block w-3 opacity-60">
                {added ? <Plus size={10} /> : removed ? <Minus size={10} /> : null}
              </span>
              <span className="whitespace-pre-wrap">{line || " "}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
