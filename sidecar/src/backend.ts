import type {
  ApprovalMode,
  HostFrame,
  SessionInfo,
  SessionSnapshot,
  ThinkingLevel,
} from "@rpcdesk/protocol";

export interface AgentBackend {
  start(): Promise<SessionSnapshot>;
  prompt(text: string, behavior?: "steer" | "follow-up"): Promise<void>;
  abort(): Promise<void>;
  setModel(provider: string, id: string): Promise<void>;
  setThinking(level: ThinkingLevel): Promise<void>;
  setApprovalMode(mode: ApprovalMode): Promise<void>;
  fork(): Promise<string | undefined>;
  listSessions(): Promise<SessionInfo[]>;
  dispose(): Promise<void>;
  onEvent(listener: (event: unknown) => void): () => void;
  handleDialogResponse?(frame: Extract<HostFrame, { type: "dialog_response" }>): void;
  setComposerText?(text: string): void;
}
