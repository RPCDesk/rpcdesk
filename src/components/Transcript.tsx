import { useEffect, useRef, useState } from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { Brain, ChevronDown, ChevronRight, MessageSquare } from "lucide-react";
import type { Tab } from "../state/tabs";
import { useSettings } from "../state/settings";
import type { TranscriptEntry } from "../state/transcript";
import { Markdown } from "./Markdown";
import { ToolCard } from "./ToolCard";

function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  if (!text.trim()) return null;
  return (
    <div className="mt-2 rounded-lg border border-[var(--border)] bg-[var(--surface)]/60">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left text-[11px] text-[var(--muted)]"
        onClick={() => setOpen((value) => !value)}
      >
        {open ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
        <Brain size={12} />
        Thinking
      </button>
      {open ? (
        <div className="whitespace-pre-wrap border-t border-[var(--border)] px-3 py-2 text-[12px] leading-5 text-[var(--muted)]">
          {text}
        </div>
      ) : null}
    </div>
  );
}

function EntryView({ entry }: { entry: TranscriptEntry }) {
  const showThinking = useSettings((state) => state.settings.showThinking);

  if (entry.kind === "user") {
    return (
      <div className="flex justify-end">
        <div className="max-w-[85%] rounded-2xl bg-[var(--surface-2)] px-4 py-2.5 text-[13px] leading-6">
          {entry.text}
        </div>
      </div>
    );
  }

  if (entry.kind === "assistant") {
    return (
      <div className="max-w-[92%]">
        {entry.text ? <Markdown text={entry.text} /> : null}
        {showThinking && entry.thinking ? <ThinkingBlock text={entry.thinking} /> : null}
        {entry.streaming && !entry.text ? (
          <div className="flex items-center gap-1 py-1 text-[var(--muted)]">
            <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-[var(--accent)]" />
            <span className="text-[11px]">Thinking…</span>
          </div>
        ) : null}
      </div>
    );
  }

  if (entry.kind === "tool") return <ToolCard entry={entry} />;

  const color =
    entry.tone === "error"
      ? "text-[var(--error)]"
      : entry.tone === "warning"
        ? "text-[var(--warning)]"
        : entry.tone === "success"
          ? "text-[var(--success)]"
          : "text-[var(--muted)]";
  return (
    <div className={`px-2 text-center text-[11px] ${color}`}>{entry.text}</div>
  );
}

export function Transcript({ tab }: { tab: Tab }) {
  const parentRef = useRef<HTMLDivElement>(null);
  const [pinned, setPinned] = useState(true);
  const entries = tab.transcript.entries;

  const virtualizer = useVirtualizer({
    count: entries.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 110,
    overscan: 6,
  });

  useEffect(() => {
    if (!pinned || entries.length === 0) return;
    const frame = requestAnimationFrame(() => {
      virtualizer.scrollToIndex(entries.length - 1, { align: "end" });
    });
    return () => cancelAnimationFrame(frame);
  }, [entries, pinned, virtualizer]);

  return (
    <div
      ref={parentRef}
      className="min-h-0 flex-1 overflow-y-auto px-6 py-5"
      onScroll={(event) => {
        const element = event.currentTarget;
        setPinned(
          element.scrollHeight - element.scrollTop - element.clientHeight < 90,
        );
      }}
    >
      {entries.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-[var(--muted)]">
          <MessageSquare size={28} strokeWidth={1.5} />
          <div className="text-[13px]">Send a message to start this session.</div>
          <div className="text-[11px]">
            {tab.backend === "omp" ? "omp" : "pi"} · {tab.cwd}
          </div>
        </div>
      ) : (
        <div
          style={{
            height: virtualizer.getTotalSize(),
            position: "relative",
            width: "100%",
          }}
        >
          {virtualizer.getVirtualItems().map((item) => {
            const entry = entries[item.index];
            return (
              <div
                key={entry.id}
                data-index={item.index}
                ref={virtualizer.measureElement}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  transform: `translateY(${item.start}px)`,
                }}
                className="pb-4"
              >
                <EntryView entry={entry} />
              </div>
            );
          })}
        </div>
      )}

      {!pinned && entries.length > 0 ? (
        <button
          type="button"
          className="sticky bottom-3 left-1/2 -translate-x-1/2 rounded-full border border-[var(--border)] bg-[var(--surface)] px-3 py-1 text-[11px] shadow-sm"
          onClick={() => {
            setPinned(true);
            virtualizer.scrollToIndex(entries.length - 1, { align: "end" });
          }}
        >
          Jump to latest
        </button>
      ) : null}
    </div>
  );
}
