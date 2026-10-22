import { useEffect, useState, type ComponentType } from "react";
import {
  Check,
  ChevronDown,
  ChevronRight,
  FileText,
  Globe2,
  ListTodo,
  Loader2,
  PencilLine,
  Search,
  Terminal,
  Wrench,
  X,
} from "lucide-react";
import type { TranscriptEntry } from "../state/transcript";
import { formatDuration, truncate } from "../lib/format";
import { usePlugins } from "../plugins/host";
import { PluginErrorBoundary } from "../plugins/ErrorBoundary";
import { DiffView } from "./DiffView";

type ToolEntry = Extract<TranscriptEntry, { kind: "tool" }>;

function iconFor(toolName: string) {
  if (toolName === "bash" || toolName === "eval") return Terminal;
  if (toolName === "read") return FileText;
  if (toolName === "write" || toolName === "edit" || toolName === "ast_edit")
    return PencilLine;
  if (toolName === "grep" || toolName === "glob" || toolName === "find") return Search;
  if (toolName === "web_search" || toolName === "browser") return Globe2;
  if (toolName === "todo" || toolName === "task") return ListTodo;
  return Wrench;
}

function argsSummary(toolName: string, args: unknown): string {
  if (!args || typeof args !== "object") return "";
  const record = args as Record<string, unknown>;
  if (toolName === "bash" && typeof record.command === "string") {
    return truncate(record.command, 160);
  }
  if (
    (toolName === "read" || toolName === "write" || toolName === "edit") &&
    typeof (record.path ?? record.file_path) === "string"
  ) {
    return truncate(String(record.path ?? record.file_path), 160);
  }
  if (typeof record.pattern === "string") return truncate(record.pattern, 160);
  if (typeof record.query === "string") return truncate(record.query, 160);
  try {
    return truncate(JSON.stringify(args), 160);
  } catch {
    return "";
  }
}

function resultText(result: unknown): string {
  if (typeof result === "string") return result;
  if (Array.isArray(result)) {
    return result
      .map((block) => {
        if (typeof block === "string") return block;
        if (block && typeof block === "object" && "text" in block) {
          return typeof block.text === "string" ? block.text : "";
        }
        return "";
      })
      .filter(Boolean)
      .join("\n");
  }
  if (result && typeof result === "object" && "content" in result) {
    return resultText(result.content);
  }
  return "";
}

function StatusIcon({ status }: { status: ToolEntry["status"] }) {
  if (status === "running") {
    return <Loader2 size={12} className="animate-spin text-[var(--accent)]" />;
  }
  if (status === "error") return <X size={12} className="text-[var(--error)]" />;
  return <Check size={12} className="text-[var(--success)]" />;
}

export function ToolCard({ entry }: { entry: ToolEntry }) {
  const registered = usePlugins((state) => state.toolRenderers[entry.toolName]);
  const [expanded, setExpanded] = useState(entry.status !== "ok");
  const Icon = iconFor(entry.toolName);
  const summary = argsSummary(entry.toolName, entry.args);
  const output = resultText(entry.result);

  useEffect(() => {
    if (entry.status === "error") setExpanded(true);
  }, [entry.status]);

  if (registered) {
    const Renderer = registered.component as ComponentType<{
      toolName: string;
      args: unknown;
      result?: unknown;
      status: ToolEntry["status"];
      diff?: ToolEntry["diff"];
      session?: unknown;
    }>;
    return (
      <PluginErrorBoundary label={`${registered.pluginId} tool renderer`}>
        <Renderer
          toolName={entry.toolName}
          args={entry.args}
          result={entry.result}
          status={entry.status}
          diff={entry.diff}
        />
      </PluginErrorBoundary>
    );
  }

  return (
    <div className="overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)]">
      <button
        type="button"
        className="flex w-full items-center gap-2 px-3 py-2 text-left"
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="text-[var(--muted)]">
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
        </span>
        <Icon size={14} className="text-[var(--muted)]" />
        <span className="font-medium">{entry.toolName}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-[var(--muted)]">
          {summary}
        </span>
        <span className="flex items-center gap-2 text-[11px] text-[var(--muted)]">
          {entry.status === "running" ? null : (
            <span>{formatDuration(entry.startedAt, entry.endedAt)}</span>
          )}
          <StatusIcon status={entry.status} />
        </span>
      </button>

      {expanded ? (
        <div className="border-t border-[var(--border)] px-3 py-2">
          {entry.args ? (
            <pre className="mb-2 max-h-48 overflow-auto rounded-md bg-[var(--surface-2)] p-2 font-mono text-[11px] leading-5">
              {JSON.stringify(entry.args, null, 2)}
            </pre>
          ) : null}
          {entry.diff ? <DiffView diff={entry.diff} /> : null}
          {output ? (
            <pre className="mt-2 max-h-72 overflow-auto whitespace-pre-wrap rounded-md bg-[var(--surface-2)] p-2 font-mono text-[11px] leading-5">
              {output}
            </pre>
          ) : null}
          {entry.status === "running" && !output ? (
            <div className="text-[11px] text-[var(--muted)]">Running…</div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
