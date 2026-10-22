import type { ApprovalMode, ToolTier } from "@pi-desktop/protocol";

const READ_TOOLS: Record<string, true> = {
  read: true,
  grep: true,
  glob: true,
  ast_grep: true,
  find: true,
  lsp: true,
  debug: true,
  github: true,
  todo: true,
  web_search: true,
  skill: true,
};

const WRITE_TOOLS: Record<string, true> = {
  write: true,
  edit: true,
  ast_edit: true,
  notebook_edit: true,
  delete: true,
  move: true,
  conflict: true,
};

export function classifyTier(toolName: string): ToolTier {
  if (READ_TOOLS[toolName]) return "read";
  if (WRITE_TOOLS[toolName]) return "write";
  return "exec";
}

export interface GateState {
  mode: ApprovalMode;
  fallback: ApprovalMode;
  grants: Set<string>;
}

export type ApprovalDecision = "allow" | "prompt";

export function effectiveMode(state: Pick<GateState, "mode" | "fallback">): ApprovalMode {
  return state.mode === "follow-cli" ? state.fallback : state.mode;
}

export function decideApproval(input: {
  mode: ApprovalMode;
  fallback: ApprovalMode;
  tier: ToolTier;
  grantKey: string;
  grants: ReadonlySet<string>;
}): ApprovalDecision {
  if (input.tier === "read") return "allow";
  if (input.grants.has(input.grantKey)) return "allow";

  const mode = input.mode === "follow-cli" ? input.fallback : input.mode;
  if (mode === "yolo") return "allow";
  if (mode === "write" && input.tier === "write") return "allow";
  return "prompt";
}

export interface PiGateUIContext {
  select(
    title: string,
    options: string[],
    opts?: unknown,
  ): Promise<string | undefined>;
}

export interface PiGateContext {
  ui?: PiGateUIContext;
}

export interface PiGateEvent {
  toolName: string;
  input?: Record<string, unknown>;
  toolCallId?: string;
}

export interface PiGateApi {
  on(
    event: "tool_call",
    handler: (event: PiGateEvent, context: PiGateContext) => Promise<unknown>,
  ): void;
}

export interface PiGateOptions {
  fallback: ApprovalMode;
  grants?: Set<string>;
  mode?: ApprovalMode;
  onTier?: (tier: ToolTier) => void;
}

export function createPiGate(state: GateState) {
  return (pi: PiGateApi): void => {
    pi.on("tool_call", async (event, context) => {
      const tier = classifyTier(event.toolName);
      const targetValue = event.input?.path ?? event.input?.file_path;
      const target = typeof targetValue === "string" ? targetValue : "*";
      const grantKey = `${event.toolName}:${target}`;
      const decision = decideApproval({
        mode: state.mode,
        fallback: state.fallback,
        tier,
        grantKey,
        grants: state.grants,
      });

      if (decision === "allow") return undefined;

      const ui = context.ui;
      if (!ui || typeof ui.select !== "function") {
        return { block: true, reason: "No approval UI" };
      }

      let choice: string | undefined;
      try {
        choice = await ui.select(`Allow ${event.toolName}?`, [
          "Allow once",
          "Allow for this session",
          "Reject",
        ]);
      } catch {
        choice = undefined;
      }

      if (choice === "Allow once") return undefined;
      if (choice === "Allow for this session") {
        state.grants.add(grantKey);
        return undefined;
      }
      return { block: true, reason: "Rejected in Pi Desktop" };
    });
  };
}
