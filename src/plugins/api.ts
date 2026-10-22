import type { ComponentType, MouseEventHandler } from "react";
import type { SessionSnapshot } from "@pi-desktop/protocol";
import type { ToolDiff } from "../state/transcript";

export interface ToolRendererProps {
  toolName: string;
  args: unknown;
  result?: unknown;
  status: "running" | "ok" | "error";
  diff?: ToolDiff;
  session?: SessionSnapshot;
}

export interface PanelProps {
  session: SessionSnapshot | undefined;
  lastEvent: unknown;
}

export interface PluginCommandContext {
  prompt(text: string): void;
  notify(message: string): void;
  openPanel(id: string): void;
  session: SessionSnapshot | undefined;
}

export interface PluginTheme {
  id: string;
  name: string;
  appearance: "light" | "dark";
  tokens: Record<string, string>;
}

export interface UiPluginApi {
  version: 1;
  React: typeof import("react");
  registerToolRenderer(
    toolName: string,
    component: ComponentType<ToolRendererProps>,
  ): void;
  registerPanel(panel: {
    id: string;
    title: string;
    component: ComponentType<PanelProps>;
    location?: "right" | "left";
  }): void;
  registerCommand(command: {
    name: string;
    title: string;
    run(context: PluginCommandContext): void | Promise<void>;
  }): void;
  registerTheme(theme: PluginTheme): void;
  onSessionEvent(listener: (event: unknown) => void): () => void;
  getSession(): SessionSnapshot | undefined;
  prompt(text: string): void;
}

export type PluginButtonHandler = MouseEventHandler<HTMLButtonElement>;
