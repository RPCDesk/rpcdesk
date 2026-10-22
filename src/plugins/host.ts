import * as React from "react";
import { create } from "zustand";
import type { ComponentType } from "react";
import type { SessionSnapshot } from "@pi-desktop/protocol";
import { call } from "../lib/tauri";
import { sendPrompt } from "../lib/host";
import { useThemes, type ThemeDefinition } from "../themes";
import { useTabs } from "../state/tabs";
import { useUi } from "../state/ui";
import { onPluginEvent, clearPluginEventListeners } from "./runtime";
import type {
  PanelProps,
  PluginCommandContext,
  ToolRendererProps,
  UiPluginApi,
} from "./api";

export interface PluginInfo {
  id: string;
  name: string;
  version: string;
  description?: string;
  enabled: boolean;
  ui: boolean;
  agent: boolean;
  error?: string;
}

export interface RegisteredToolRenderer {
  pluginId: string;
  component: ComponentType<ToolRendererProps>;
}

export interface RegisteredPanel {
  pluginId: string;
  id: string;
  title: string;
  component: ComponentType<PanelProps>;
  location: "right" | "left";
}

export interface RegisteredCommand {
  pluginId: string;
  id: string;
  name: string;
  title: string;
  run: (context: PluginCommandContext) => void | Promise<void>;
}

interface PluginStore {
  plugins: PluginInfo[];
  toolRenderers: Record<string, RegisteredToolRenderer>;
  panels: RegisteredPanel[];
  commands: RegisteredCommand[];
  errors: Record<string, string>;
  loading: boolean;
  load: () => Promise<void>;
  reload: () => Promise<void>;
  setEnabled: (pluginId: string, enabled: boolean) => Promise<void>;
  createExample: () => Promise<string | undefined>;
}

function sessionSnapshot(): SessionSnapshot | undefined {
  const activeId = useTabs.getState().activeTabId;
  if (!activeId) return undefined;
  return useTabs.getState().tabs.find((tab) => tab.id === activeId)?.snapshot;
}

function activeTabId(): string | undefined {
  return useTabs.getState().activeTabId;
}

function evaluatePlugin(
  pluginId: string,
  code: string,
  toolRenderers: Record<string, RegisteredToolRenderer>,
  panels: RegisteredPanel[],
  commands: RegisteredCommand[],
): void {
  const api: UiPluginApi = {
    version: 1,
    React,
    registerToolRenderer(toolName, component) {
      toolRenderers[toolName] = { pluginId, component };
    },
    registerPanel(panel) {
      panels.push({
        pluginId,
        id: panel.id,
        title: panel.title,
        component: panel.component,
        location: panel.location ?? "right",
      });
    },
    registerCommand(command) {
      commands.push({
        pluginId,
        id: `${pluginId}:${command.name}`,
        name: command.name,
        title: command.title,
        run: command.run,
      });
    },
    registerTheme(theme) {
      const definition: ThemeDefinition = {
        ...theme,
        source: "user",
      };
      useThemes.getState().register(definition);
    },
    onSessionEvent: onPluginEvent,
    getSession: sessionSnapshot,
    prompt(text) {
      const tab = activeTabId();
      if (tab) sendPrompt(tab, text);
    },
  };

  const module = { exports: {} as unknown };
  const factory = new Function(
    "React",
    "api",
    "module",
    "exports",
    `${code}\nreturn module.exports;`,
  );
  const entry = factory(React, api, module, module.exports);
  const exported =
    entry && typeof entry === "object" && "default" in entry
      ? (entry as { default: unknown }).default
      : entry;
  if (typeof exported === "function") {
    (exported as (api: UiPluginApi) => void)(api);
  }
}

export const usePlugins = create<PluginStore>((set, get) => ({
  plugins: [],
  toolRenderers: {},
  panels: [],
  commands: [],
  errors: {},
  loading: false,
  async load() {
    set({ loading: true });
    try {
      const plugins = await call<PluginInfo[]>("list_plugins");
      const toolRenderers: Record<string, RegisteredToolRenderer> = {};
      const panels: RegisteredPanel[] = [];
      const commands: RegisteredCommand[] = [];
      const errors: Record<string, string> = {};
      clearPluginEventListeners();

      for (const plugin of plugins) {
        if (!plugin.enabled || !plugin.ui || plugin.error) continue;
        try {
          const build = await call<{ code: string; mtime: number }>(
            "build_ui_plugin",
            { pluginId: plugin.id },
          );
          evaluatePlugin(plugin.id, build.code, toolRenderers, panels, commands);
        } catch (error) {
          errors[plugin.id] = error instanceof Error ? error.message : String(error);
        }
      }

      set({ plugins, toolRenderers, panels, commands, errors, loading: false });
    } catch (error) {
      set({
        loading: false,
        errors: {
          ...get().errors,
          registry: error instanceof Error ? error.message : String(error),
        },
      });
    }
  },
  async reload() {
    await get().load();
  },
  async setEnabled(pluginId, enabled) {
    await call("set_plugin_enabled", { pluginId, enabled });
    await get().load();
  },
  async createExample() {
    const path = await call<string>("create_example_plugin");
    await get().load();
    return path;
  },
}));

export function openPluginPanel(id: string): void {
  useUi.getState().toggleInspector();
  useUi.getState().pushToast(`Panel: ${id}`, "info");
}
