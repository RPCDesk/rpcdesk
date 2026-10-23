import { readFileSync } from "node:fs";

const READ_TOOLS = new Set([
  "read",
  "grep",
  "glob",
  "ast_grep",
  "find",
  "lsp",
  "debug",
  "github",
  "todo",
  "web_search",
  "skill",
]);

const WRITE_TOOLS = new Set([
  "write",
  "edit",
  "ast_edit",
  "notebook_edit",
  "delete",
  "move",
  "conflict",
]);

function gateConfig() {
  try {
    const value = JSON.parse(
      readFileSync(process.env.RPCDESK_GATE_CONFIG ?? "", "utf8"),
    );
    return {
      mode: typeof value.mode === "string" ? value.mode : "follow-cli",
      fallback: typeof value.fallback === "string" ? value.fallback : "write",
    };
  } catch {
    return { mode: "follow-cli", fallback: "write" };
  }
}

export default function piDesktopGate(pi) {
  const grants = new Set();

  pi.on("tool_call", async (event, context) => {
    const config = gateConfig();
    const mode = config.mode === "follow-cli" ? config.fallback : config.mode;
    const tier = READ_TOOLS.has(event.toolName)
      ? "read"
      : WRITE_TOOLS.has(event.toolName)
        ? "write"
        : "exec";

    if (tier === "read" || mode === "yolo") return undefined;
    if (mode === "write" && tier === "write") return undefined;

    const targetValue = event.input?.path ?? event.input?.file_path;
    const target = typeof targetValue === "string" ? targetValue : "*";
    const grantKey = `${event.toolName}:${target}`;
    if (grants.has(grantKey)) return undefined;

    if (!context.ui || typeof context.ui.select !== "function") {
      return { block: true, reason: "No approval UI" };
    }

    let choice;
    try {
      choice = await context.ui.select(`Allow ${event.toolName}?`, [
        "Allow once",
        "Allow for this session",
        "Reject",
      ]);
    } catch {
      choice = undefined;
    }

    if (choice === "Allow once") return undefined;
    if (choice === "Allow for this session") {
      grants.add(grantKey);
      return undefined;
    }
    return { block: true, reason: "Rejected in rpcdesk" };
  });
}
