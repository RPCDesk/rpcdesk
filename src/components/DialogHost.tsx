import { useEffect, useState } from "react";
import { AlertTriangle, ShieldCheck } from "lucide-react";
import { useTabs } from "../state/tabs";
import { respondDialog } from "../lib/host";

function optionLabel(option: string | { label: string; description?: string }): string {
  return typeof option === "string" ? option : option.label;
}

export function DialogHost() {
  const tab = useTabs((state) =>
    state.tabs.find((item) => item.id === state.activeTabId),
  );
  const dialog = tab?.dialogs[0];
  const [value, setValue] = useState("");
  const [expanded, setExpanded] = useState(false);
  const [always, setAlways] = useState<Record<number, boolean>>({});

  useEffect(() => {
    setValue(dialog?.default ?? "");
    setExpanded(false);
    setAlways({});
  }, [dialog?.id, dialog?.default]);

  useEffect(() => {
    if (!dialog?.timeoutMs || !tab) return;
    const dialogId = dialog.id;
    const tabId = tab.id;
    const timer = setTimeout(() => {
      respondDialog(tabId, dialogId, { cancelled: true });
    }, dialog.timeoutMs);
    return () => clearTimeout(timer);
  }, [dialog?.id, dialog?.timeoutMs, tab?.id]);

  useEffect(() => {
    if (!dialog) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      if (tab) respondDialog(tab.id, dialog.id, { cancelled: true });
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [dialog, tab]);

  if (!tab || !dialog) return null;

  const respond = (response: {
    value?: string;
    confirmed?: boolean;
    cancelled?: boolean;
    answer?: unknown;
  }) => respondDialog(tab.id, dialog.id, response);

  const prompt = dialog.prompt;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-6 backdrop-blur-[2px]">
      <div className="w-full max-w-[560px] overflow-hidden rounded-3xl border border-[var(--border)] bg-[var(--surface)] shadow-[var(--shadow-pop)]">
        <div className="flex items-center gap-2 border-b border-[var(--border)] px-4 py-3">
          {dialog.kind === "approve" ? (
            <ShieldCheck size={15} className="text-[var(--accent)]" />
          ) : (
            <AlertTriangle size={15} className="text-[var(--warning)]" />
          )}
          <div className="text-[13px] font-medium">
            {dialog.title ??
              (dialog.kind === "approve" ? "Permission required" : "Confirm")}
          </div>
          <div className="ml-auto text-[10px] text-[var(--muted)]">
            {tab.dialogs.length > 1 ? `${tab.dialogs.length - 1} waiting` : ""}
          </div>
        </div>

        <div className="max-h-[60vh] overflow-y-auto px-4 py-3">
          {dialog.message ? (
            <div className="mb-2 text-[12px] leading-5 text-[var(--muted)]">
              {dialog.message}
            </div>
          ) : null}

          {dialog.kind === "select" ? (
            <div className="flex flex-col gap-1">
              {(dialog.options ?? []).map((option, index) => (
                <button
                  key={optionLabel(option)}
                  type="button"
                  autoFocus={index === 0}
                  className="rounded-lg border border-[var(--border)] px-3 py-2 text-left hover:bg-[var(--surface-2)]"
                  onClick={() => respond({ value: optionLabel(option) })}
                >
                  <div className="text-[12px]">{optionLabel(option)}</div>
                  {typeof option !== "string" && option.description ? (
                    <div className="text-[11px] text-[var(--muted)]">
                      {option.description}
                    </div>
                  ) : null}
                </button>
              ))}
            </div>
          ) : null}

          {dialog.kind === "confirm" ? (
            <div className="flex justify-end gap-2">
              <button
                type="button"
                className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]"
                onClick={() => respond({ confirmed: false })}
              >
                Cancel
              </button>
              <button
                type="button"
                autoFocus
                className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--on-accent)]"
                onClick={() => respond({ confirmed: true })}
              >
                Allow
              </button>
            </div>
          ) : null}

          {dialog.kind === "input" ? (
            <div>
              <input
                autoFocus
                value={value}
                placeholder={dialog.placeholder}
                onChange={(event) => setValue(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") respond({ value });
                }}
                className="w-full rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 text-[12px] outline-none focus:border-[var(--border-strong)]"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]"
                  onClick={() => respond({ cancelled: true })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--on-accent)]"
                  onClick={() => respond({ value })}
                >
                  Submit
                </button>
              </div>
            </div>
          ) : null}

          {dialog.kind === "editor" ? (
            <div>
              <textarea
                autoFocus
                value={value}
                onChange={(event) => setValue(event.target.value)}
                rows={8}
                className="w-full resize-none rounded-md border border-[var(--border)] bg-[var(--bg)] px-3 py-2 font-mono text-[12px] outline-none focus:border-[var(--border-strong)]"
              />
              <div className="mt-3 flex justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]"
                  onClick={() => respond({ cancelled: true })}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--on-accent)]"
                  onClick={() => respond({ value })}
                >
                  Save
                </button>
              </div>
            </div>
          ) : null}

          {dialog.kind === "approve" && prompt ? (
            <div>
              <pre className="whitespace-pre-wrap rounded-md bg-[var(--surface-2)] p-3 font-mono text-[11px] leading-5">
                {expanded ? prompt.full : prompt.compact}
              </pre>
              {prompt.full !== prompt.compact ? (
                <button
                  type="button"
                  className="mt-1 text-[11px] text-[var(--accent)]"
                  onClick={() => setExpanded((value) => !value)}
                >
                  {expanded ? "Show compact" : "Show full details"}
                </button>
              ) : null}

              {(prompt.grants ?? []).length > 0 ? (
                <div className="mt-3 space-y-1">
                  {(prompt.grants ?? []).map((grant, index) => (
                    <label
                      key={`${grant.scope}-${index}`}
                      className="flex items-center gap-2 text-[11px] text-[var(--muted)]"
                    >
                      <input
                        type="checkbox"
                        checked={always[index] ?? false}
                        onChange={(event) =>
                          setAlways((current) => ({
                            ...current,
                            [index]: event.target.checked,
                          }))
                        }
                      />
                      {grant.alwaysLabel}
                    </label>
                  ))}
                </div>
              ) : null}

              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <button
                  type="button"
                  className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]"
                  onClick={() => respond({ answer: "deny" })}
                >
                  Reject
                </button>
                {(prompt.grants ?? []).map((grant, index) => (
                  <button
                    key={`${grant.scope}-action-${index}`}
                    type="button"
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]"
                    onClick={() =>
                      respond({
                        answer: {
                          grant: grant.scope,
                          always: always[index] ?? false,
                        },
                      })
                    }
                  >
                    {grant.label}
                  </button>
                ))}
                {prompt.session ? (
                  <button
                    type="button"
                    className="rounded-md border border-[var(--border)] px-3 py-1.5 text-[12px]"
                    onClick={() => respond({ answer: "session" })}
                  >
                    {prompt.session}
                  </button>
                ) : null}
                <button
                  type="button"
                  autoFocus
                  className="rounded-md bg-[var(--accent)] px-3 py-1.5 text-[12px] font-medium text-[var(--on-accent)]"
                  onClick={() => respond({ answer: "once" })}
                >
                  Allow once
                </button>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
