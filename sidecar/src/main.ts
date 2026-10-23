import { parseHostFrame } from "@rpcdesk/protocol";
import type {
  ApprovalMode,
  Backend,
  SessionSnapshot,
  SidecarFrame,
} from "@rpcdesk/protocol";
import { createCliBackend } from "./backends/cli";
import { createHost } from "./host";
import { listAgentExtensionFiles } from "./plugins";
import { createLineReader } from "./transport";
import { createUiContext } from "./ui-context";

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

function backendName(): Backend {
  const value = arg("backend");
  if (value !== "omp" && value !== "pi") {
    throw new Error(`Unknown backend: ${value ?? "(missing)"}`);
  }
  return value;
}

function approvalMode(): ApprovalMode {
  const value = arg("approval-mode") ?? "follow-cli";
  if (
    value !== "follow-cli" &&
    value !== "always-ask" &&
    value !== "write" &&
    value !== "yolo"
  ) {
    throw new Error(`Unknown approval mode: ${value}`);
  }
  return value;
}

function approvalFallback(): ApprovalMode {
  const value = arg("approval-fallback") ?? "write";
  if (value !== "always-ask" && value !== "write" && value !== "yolo") {
    return "write";
  }
  return value;
}

for (const level of ["log", "info", "debug"] as const) {
  console[level] = (...args: unknown[]) => console.error(...args);
}

let writeChain: Promise<void> = Promise.resolve();
function send(frame: SidecarFrame): void {
  const line = `${JSON.stringify(frame, (_key, value) =>
    typeof value === "bigint" ? value.toString() : value,
  )}\n`;
  writeChain = writeChain
    .then(
      () =>
        new Promise<void>((resolve) => {
          process.stdout.write(line, () => resolve());
        }),
    )
    .catch((error) => {
      console.error("Failed to write sidecar frame", error);
    });
}

async function main(): Promise<void> {
  const backend = backendName();
  const cwd = arg("cwd") ?? process.cwd();
  process.chdir(cwd);

  const cliPath = arg("cli");
  if (!cliPath) throw new Error("CLI path is required");
  const mode = approvalMode();
  const fallback = approvalFallback();
  const sessionPath = arg("session");
  const extensionFiles = await listAgentExtensionFiles();
  const uiHandle = createUiContext({ send });

  const agent = await createCliBackend({
    backend,
    cliPath,
    cwd,
    sessionPath,
    approvalMode: mode,
    approvalFallback: fallback,
    ui: uiHandle,
    agentExtensions: extensionFiles.map((extension) => extension.path),
    send,
    onReady: (snapshot: SessionSnapshot) => {
      send({ type: "ready", snapshot });
    },
  });

  let shuttingDown = false;
  async function shutdown(code = 0): Promise<void> {
    if (shuttingDown) return;
    shuttingDown = true;
    try {
      await host.dispose();
    } finally {
      await writeChain.catch(() => {});
      process.exit(code);
    }
  }

  const host = createHost({
    backend: agent,
    send,
    dialogs: {
      handleResponse: uiHandle.handleResponse,
      cancelAll: uiHandle.cancelAll,
      setComposerText: uiHandle.setComposerText,
    },
    cwd,
    onShutdown: () => {
      void shutdown(0);
    },
  });

  await host.start();

  const reader = createLineReader((line) => {
    const parsed = parseHostFrame(line);
    if (!parsed.ok) {
      send({ type: "notify", level: "error", message: parsed.error });
      return;
    }
    void host.handleFrame(parsed.frame);
  });

  process.on("SIGTERM", () => {
    void shutdown(0);
  });
  process.on("SIGINT", () => {
    void shutdown(0);
  });

  const stdin = Bun.stdin.stream().getReader();
  while (true) {
    const { done, value } = await stdin.read();
    if (done) break;
    if (value) reader.push(value);
  }
  reader.flush();
  await shutdown(0);
}

main().catch((error) => {
  send({ type: "fatal", error: (error as Error).message });
  console.error(error);
  setTimeout(() => process.exit(1), 20);
});
