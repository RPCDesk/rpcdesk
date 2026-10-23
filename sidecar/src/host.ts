import type { HostFrame, SidecarFrame } from "@rpcdesk/protocol";
import type { AgentBackend } from "./backend";
import { createDiffTracker } from "./diff";

type DialogResponse = Extract<HostFrame, { type: "dialog_response" }>;

export interface DialogBridge {
  handleResponse(frame: DialogResponse): void;
  cancelAll(): void;
  setComposerText(text: string): void;
}

export interface HostOptions {
  backend: AgentBackend;
  send: (frame: SidecarFrame) => void;
  dialogs: DialogBridge;
  cwd: string;
  onShutdown?: () => void;
}

export interface Host {
  start(): Promise<void>;
  handleFrame(frame: HostFrame): Promise<void>;
  dispose(): Promise<void>;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function createHost({
  backend,
  send,
  dialogs,
  cwd,
  onShutdown,
}: HostOptions): Host {
  const diff = createDiffTracker(send, cwd);
  const unsubscribe = backend.onEvent((event) => {
    diff.onEvent(event);
    send({ type: "event", event });
  });
  let disposed = false;

  const respond = (id: string, data?: unknown) => {
    send({ type: "response", id, ok: true, ...(data === undefined ? {} : { data }) });
  };
  const fail = (id: string, error: unknown) => {
    send({ type: "response", id, ok: false, error: errorMessage(error) });
  };

  async function start(): Promise<void> {
    const snapshot = await backend.start();
    send({ type: "ready", snapshot });
  }

  async function handleFrame(frame: HostFrame): Promise<void> {
    if (disposed) return;

    switch (frame.type) {
      case "prompt": {
        let running: Promise<void>;
        try {
          running = backend.prompt(frame.text, frame.behavior);
        } catch (error) {
          fail(frame.id, error);
          return;
        }
        respond(frame.id);
        void running.catch((error) => {
          send({ type: "notify", level: "error", message: errorMessage(error) });
        });
        return;
      }
      case "abort":
        try {
          await backend.abort();
          respond(frame.id);
        } catch (error) {
          fail(frame.id, error);
        }
        return;
      case "set_model":
        try {
          await backend.setModel(frame.provider, frame.modelId);
          respond(frame.id);
        } catch (error) {
          fail(frame.id, error);
        }
        return;
      case "set_thinking":
        try {
          await backend.setThinking(frame.level);
          respond(frame.id);
        } catch (error) {
          fail(frame.id, error);
        }
        return;
      case "set_approval_mode":
        try {
          await backend.setApprovalMode(frame.mode);
          respond(frame.id);
        } catch (error) {
          fail(frame.id, error);
        }
        return;
      case "fork":
        try {
          const sessionFile = await backend.fork();
          if (!sessionFile) {
            fail(frame.id, new Error("Nothing to fork"));
          } else {
            respond(frame.id, { sessionFile });
          }
        } catch (error) {
          fail(frame.id, error);
        }
        return;
      case "list_sessions":
        try {
          respond(frame.id, { sessions: await backend.listSessions() });
        } catch (error) {
          fail(frame.id, error);
        }
        return;
      case "dialog_response":
        if (backend.handleDialogResponse) backend.handleDialogResponse(frame);
        else dialogs.handleResponse(frame);
        return;
      case "composer_text":
        if (backend.setComposerText) backend.setComposerText(frame.text);
        else dialogs.setComposerText(frame.text);
        return;
      case "shutdown":
        await dispose();
        return;
    }
  }

  async function dispose(): Promise<void> {
    if (disposed) return;
    disposed = true;
    unsubscribe();
    dialogs.cancelAll();
    try {
      await backend.dispose();
    } finally {
      onShutdown?.();
    }
  }

  return { start, handleFrame, dispose };
}
