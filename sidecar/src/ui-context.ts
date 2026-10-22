import type {
  ApprovalPrompt,
  DialogKind,
  HostFrame,
  SidecarFrame,
} from "@pi-desktop/protocol";

export interface Timers {
  setTimeout(callback: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

type DialogResponse = Extract<HostFrame, { type: "dialog_response" }>;
type DialogValue = {
  value?: string;
  confirmed?: boolean;
  cancelled?: boolean;
  answer?: unknown;
};

interface PendingDialog {
  kind: DialogKind;
  resolve: (value: DialogValue) => void;
  timer?: unknown;
}

export interface UiApi {
  hasUI: boolean;
  select(
    title: string,
    options: Array<string | { label: string; description?: string }>,
    opts?: unknown,
  ): Promise<string | undefined>;
  confirm(title: string, message: string, opts?: unknown): Promise<boolean>;
  input(title: string, placeholder?: string, opts?: unknown): Promise<string | undefined>;
  editor(title: string, prefill?: string, opts?: unknown): Promise<string | undefined>;
  approve(prompt: ApprovalPrompt, opts?: unknown): Promise<unknown>;
  notify(message: string, level?: "info" | "warning" | "error"): void;
  setStatus(key: string, text?: string): void;
  setWidget(...args: unknown[]): void;
  setFooter(...args: unknown[]): void;
  setHeader(...args: unknown[]): void;
  setTitle(title: string): void;
  custom<T>(...args: unknown[]): Promise<T>;
  pasteToEditor(text: string): void;
  setEditorText(text: string): void;
  getEditorText(): string;
  addAutocompleteProvider(...args: unknown[]): void;
  onTerminalInput(...args: unknown[]): () => void;
  setWorkingMessage(...args: unknown[]): void;
  setWorkingVisible(...args: unknown[]): void;
  setWorkingIndicator(...args: unknown[]): void;
  setHiddenThinkingLabel(...args: unknown[]): void;
  setEditorComponent(...args: unknown[]): void;
  getEditorComponent(): unknown;
  theme: unknown;
  getAllThemes(): Array<{ name: string; path?: string }>;
  getTheme(name: string): unknown;
  setTheme(theme: unknown): { success: boolean; error?: string };
  getToolsExpanded(): boolean;
  setToolsExpanded(expanded: boolean): void;
}

export interface UiContextHandle {
  ui: UiApi;
  handleResponse(frame: DialogResponse): void;
  cancelAll(): void;
  setComposerText(text: string): void;
}

function timeoutFrom(opts: unknown): number | undefined {
  if (typeof opts !== "object" || opts === null) return undefined;
  if (!("timeout" in opts)) return undefined;
  const value = opts.timeout;
  return typeof value === "number" && Number.isFinite(value) && value > 0
    ? value
    : undefined;
}

function normalizeApprovalAnswer(answer: unknown): unknown {
  if (answer === "once" || answer === "session" || answer === "deny") {
    return answer;
  }
  if (typeof answer === "object" && answer !== null) {
    const record = answer as { grant?: unknown; always?: unknown };
    if (
      (record.grant === "folder" || record.grant === "target") &&
      typeof record.always === "boolean"
    ) {
      return { grant: record.grant, always: record.always };
    }
  }
  return "deny";
}

function cancelValue(kind: DialogKind): DialogValue {
  if (kind === "confirm") return { confirmed: false, cancelled: true };
  if (kind === "approve") return { answer: "deny", cancelled: true };
  return { cancelled: true };
}

export function createUiContext({
  send,
  timers = globalThis,
}: {
  send: (frame: SidecarFrame) => void;
  timers?: Timers;
}): UiContextHandle {
  const pending = new Map<string, PendingDialog>();
  const theme = new Proxy(
    {},
    {
      get: () => (value: string) => value,
    },
  );
  let composerText = "";

  const request = (
    kind: DialogKind,
    payload: Record<string, unknown>,
    opts: unknown,
  ): Promise<DialogValue> => {
    const id = crypto.randomUUID();
    const timeoutMs = timeoutFrom(opts);
    const { promise, resolve } = Promise.withResolvers<DialogValue>();
    const timer =
      timeoutMs === undefined
        ? undefined
        : timers.setTimeout(() => {
            pending.delete(id);
            resolve(cancelValue(kind));
          }, timeoutMs);
    pending.set(id, { kind, resolve, timer });
    send({
      type: "dialog",
      id,
      kind,
      ...payload,
      ...(timeoutMs === undefined ? {} : { timeoutMs }),
    } as SidecarFrame);
    return promise;
  };

  const api: UiApi = {
    hasUI: true,
    async select(title, options, opts) {
      const normalized = options.map((option) =>
        typeof option === "string"
          ? { label: option }
          : { label: option.label, description: option.description },
      );
      const result = await request("select", { title, options: normalized }, opts);
      return result.cancelled ? undefined : result.value;
    },
    async confirm(title, message, opts) {
      const result = await request("confirm", { title, message }, opts);
      return result.cancelled ? false : result.confirmed === true;
    },
    async input(title, placeholder, opts) {
      const result = await request("input", { title, placeholder }, opts);
      return result.cancelled ? undefined : result.value;
    },
    async editor(title, prefill, opts) {
      const result = await request("editor", { title, default: prefill }, opts);
      return result.cancelled ? undefined : result.value;
    },
    async approve(prompt, opts) {
      const result = await request("approve", { prompt }, opts);
      return result.cancelled ? "deny" : normalizeApprovalAnswer(result.answer);
    },
    notify(message, level = "info") {
      send({ type: "notify", level, message });
    },
    setStatus(key, text) {
      send({ type: "status", key, text });
    },
    setWidget() {},
    setFooter() {},
    setHeader() {},
    setTitle(title) {
      send({ type: "title", title });
    },
    custom<T>(): Promise<T> {
      return Promise.reject(
        new Error("Custom TUI components are not supported in Pi Desktop"),
      );
    },
    pasteToEditor(text) {
      composerText = text;
      send({ type: "composer", mode: "paste", text });
    },
    setEditorText(text) {
      composerText = text;
      send({ type: "composer", mode: "set", text });
    },
    getEditorText() {
      return composerText;
    },
    addAutocompleteProvider() {},
    onTerminalInput() {
      return () => {};
    },
    setWorkingMessage() {},
    setWorkingVisible() {},
    setWorkingIndicator() {},
    setHiddenThinkingLabel() {},
    setEditorComponent() {},
    getEditorComponent() {
      return undefined;
    },
    theme,
    getAllThemes() {
      return [];
    },
    getTheme() {
      return undefined;
    },
    setTheme() {
      return { success: false, error: "Pi Desktop manages themes" };
    },
    getToolsExpanded() {
      return false;
    },
    setToolsExpanded() {},
  };

  return {
    ui: api,
    handleResponse(frame) {
      const entry = pending.get(frame.id);
      if (!entry) return;
      pending.delete(frame.id);
      if (entry.timer !== undefined) timers.clearTimeout(entry.timer);

      if (frame.cancelled) {
        entry.resolve(cancelValue(entry.kind));
        return;
      }
      if (entry.kind === "approve") {
        entry.resolve({ answer: normalizeApprovalAnswer(frame.answer) });
        return;
      }
      if (entry.kind === "confirm") {
        entry.resolve({ confirmed: frame.confirmed === true });
        return;
      }
      entry.resolve({
        value: typeof frame.value === "string" ? frame.value : undefined,
      });
    },
    cancelAll() {
      for (const [id, entry] of pending) {
        pending.delete(id);
        if (entry.timer !== undefined) timers.clearTimeout(entry.timer);
        entry.resolve(cancelValue(entry.kind));
      }
    },
    setComposerText(text) {
      composerText = text;
    },
  };
}
