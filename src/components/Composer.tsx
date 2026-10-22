import { useEffect, useRef, useState, type KeyboardEvent } from "react";
import { ArrowUp, CornerDownLeft, Square, TerminalSquare } from "lucide-react";
import type { Tab } from "../state/tabs";
import { useTabs } from "../state/tabs";
import { usePlugins } from "../plugins/host";
import {
  abortTab,
  forkTab,
  newSession,
  sendComposerText,
  sendPrompt,
} from "../lib/host";
import { useUi } from "../state/ui";
import type { PluginCommandContext } from "../plugins/api";

interface Command {
  id: string;
  title: string;
  source: "app" | "plugin";
  run: () => void | Promise<void>;
}

const BUILTIN_COMMANDS: Command[] = [
  {
    id: "new",
    title: "New session",
    source: "app",
    run: () => {
      const id = useTabs.getState().activeTabId;
      if (id) void newSession(id);
    },
  },
  {
    id: "fork",
    title: "Fork at the latest user message",
    source: "app",
    run: () => {
      const id = useTabs.getState().activeTabId;
      if (id) void forkTab(id);
    },
  },
  {
    id: "abort",
    title: "Abort the active run",
    source: "app",
    run: () => {
      const id = useTabs.getState().activeTabId;
      if (id) abortTab(id);
    },
  },
  {
    id: "settings",
    title: "Open settings",
    source: "app",
    run: () => useUi.getState().openSettings(),
  },
  {
    id: "plugins",
    title: "Open plugins",
    source: "app",
    run: () => useUi.getState().openPlugins(),
  },
];

export function Composer({ tab }: { tab: Tab }) {
  const [text, setText] = useState(tab.draft);
  const [selected, setSelected] = useState(0);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const pluginCommands = usePlugins((state) => state.commands);
  const running = tab.transcript.running;
  const disabled = tab.status === "starting" || tab.status === "error" || tab.cold;

  useEffect(() => {
    setText(tab.draft);
  }, [tab.id, tab.draft]);

  useEffect(() => {
    const element = textareaRef.current;
    if (!element) return;
    element.style.height = "0px";
    element.style.height = `${Math.min(220, element.scrollHeight)}px`;
  }, [text]);

  useEffect(() => {
    const timer = setTimeout(() => sendComposerText(tab.id, text), 150);
    return () => clearTimeout(timer);
  }, [tab.id, text]);

  const commands: Command[] = [
    ...BUILTIN_COMMANDS,
    ...pluginCommands.map((command) => ({
      id: command.id,
      title: command.title,
      source: "plugin" as const,
      run: () => {
        const context: PluginCommandContext = {
          prompt: (value) => sendPrompt(tab.id, value),
          notify: (message) => useUi.getState().pushToast(message),
          openPanel: (panelId) =>
            useUi.getState().pushToast(`Panel: ${panelId}`),
          session: tab.snapshot,
        };
        return command.run(context);
      },
    })),
  ];

  const query = text.startsWith("/") ? text.slice(1).toLowerCase() : "";
  const paletteOpen = text.startsWith("/") && !text.includes("\n");
  const filtered = paletteOpen
    ? commands.filter((command) => command.id.toLowerCase().startsWith(query))
    : [];

  const submit = (behavior?: "steer" | "follow-up") => {
    const value = text.trim();
    if (!value || disabled) return;
    sendPrompt(tab.id, value, running ? behavior ?? tab.composerMode : undefined);
    setText("");
    useTabs.getState().setDraft(tab.id, "");
  };

  const runCommand = (command: Command) => {
    setText("");
    useTabs.getState().setDraft(tab.id, "");
    void command.run();
  };

  const onKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (paletteOpen && filtered.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSelected((value) => (value + 1) % filtered.length);
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSelected((value) => (value - 1 + filtered.length) % filtered.length);
        return;
      }
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        runCommand(filtered[Math.min(selected, filtered.length - 1)]);
        return;
      }
      if (event.key === "Escape") {
        setText("");
        return;
      }
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      submit();
    }
  };

  return (
    <div className="relative border-t border-[var(--border)] bg-[var(--bg)] px-6 py-3">
      {paletteOpen && filtered.length > 0 ? (
        <div className="absolute bottom-full left-6 right-6 mb-2 overflow-hidden rounded-lg border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-pop)]">
          {filtered.slice(0, 8).map((command, index) => (
            <button
              key={command.id}
              type="button"
              className={`flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] ${
                index === selected ? "bg-[var(--accent-soft)]" : ""
              }`}
              onMouseEnter={() => setSelected(index)}
              onClick={() => runCommand(command)}
            >
              <TerminalSquare size={13} className="text-[var(--muted)]" />
              <span className="font-mono">/{command.id}</span>
              <span className="truncate text-[var(--muted)]">{command.title}</span>
              <span className="ml-auto text-[10px] uppercase text-[var(--muted)]">
                {command.source}
              </span>
            </button>
          ))}
        </div>
      ) : null}

      <div className="rounded-xl border border-[var(--border)] bg-[var(--surface)] shadow-sm focus-within:border-[var(--border-strong)]">
        <textarea
          ref={textareaRef}
          value={text}
          onChange={(event) => {
            setText(event.target.value);
            setSelected(0);
            useTabs.getState().setDraft(tab.id, event.target.value);
          }}
          onKeyDown={onKeyDown}
          disabled={disabled}
          rows={1}
          placeholder={
            disabled
              ? "Waiting for the session…"
              : "Ask for a change, a review, or an investigation…"
          }
          className="max-h-[220px] min-h-[44px] w-full resize-none bg-transparent px-3.5 pt-3 text-[13px] leading-6 outline-none placeholder:text-[var(--muted)] disabled:opacity-50"
        />
        <div className="flex items-center gap-2 px-2.5 pb-2">
          <div className="text-[10px] text-[var(--muted)]">
            {tab.backend === "omp" ? "omp" : "pi"}
          </div>
          <div className="ml-auto flex items-center gap-1.5">
            {running ? (
              <>
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--surface-2)]"
                  onClick={() => submit("steer")}
                  title="Insert into the active run"
                >
                  <CornerDownLeft size={12} className="mr-1 inline" />
                  Steer
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-2 py-1 text-[11px] hover:bg-[var(--surface-2)]"
                  onClick={() => submit("follow-up")}
                  title="Queue after the active run"
                >
                  Queue
                </button>
                <button
                  type="button"
                  className="rounded-md border border-[var(--error)] px-2 py-1 text-[11px] text-[var(--error)] hover:bg-[var(--error-soft)]"
                  onClick={() => abortTab(tab.id)}
                >
                  <Square size={11} className="mr-1 inline" />
                  Stop
                </button>
              </>
            ) : (
              <button
                type="button"
                disabled={!text.trim() || disabled}
                className="rounded-md bg-[var(--accent)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40"
                onClick={() => submit()}
              >
                <ArrowUp size={12} className="mr-1 inline" />
                Send
              </button>
            )}
          </div>
        </div>
      </div>
      <div className="mt-1.5 flex items-center gap-2 text-[10px] text-[var(--muted)]">
        <span>Enter sends · Shift+Enter newline · / commands</span>
        {tab.transcript.queued.steer + tab.transcript.queued.followUp > 0 ? (
          <span>
            · {tab.transcript.queued.steer} steering,{" "}
            {tab.transcript.queued.followUp} queued
          </span>
        ) : null}
      </div>
    </div>
  );
}
