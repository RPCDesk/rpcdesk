import type { ModelInfo } from "@pi-desktop/protocol";

export interface ModelLike {
  provider?: string;
  id?: string;
  name?: string;
  contextWindow?: number;
  reasoning?: boolean;
}

export function modelInfo(model: ModelLike): ModelInfo {
  return {
    provider: String(model.provider ?? "unknown"),
    id: String(model.id ?? "unknown"),
    name: String(model.name ?? model.id ?? "unknown"),
    contextWindow: model.contextWindow,
    reasoning: model.reasoning,
  };
}

export function usableModel(
  model: unknown,
): model is ModelLike & { provider: string; id: string } {
  if (typeof model !== "object" || model === null) return false;
  if (!("provider" in model) || !("id" in model)) return false;
  return (
    typeof model.provider === "string" &&
    typeof model.id === "string" &&
    model.id.length > 0 &&
    model.provider !== "unknown" &&
    model.id !== "unknown"
  );
}
