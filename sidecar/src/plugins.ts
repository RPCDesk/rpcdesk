import { readdir, readFile, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join, resolve, sep } from "node:path";
import { pathToFileURL } from "node:url";

export interface PluginManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  ui?: string;
  agent?: string;
}

export interface LoadedAgentExtension {
  id: string;
  factory: (pi: unknown) => void;
}

export interface AgentExtensionFile {
  id: string;
  path: string;
}

export function validPluginId(id: string): boolean {
  return (
    id.length > 0 &&
    id.length <= 64 &&
    /^[a-z0-9][a-z0-9._-]*$/.test(id)
  );
}

export function parseManifest(value: unknown): PluginManifest {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new Error("plugin.json must contain an object");
  }
  const record = value as Record<string, unknown>;
  if (typeof record.id !== "string" || !validPluginId(record.id)) {
    throw new Error("plugin.json has an invalid id");
  }
  if (typeof record.name !== "string" || record.name.trim().length === 0) {
    throw new Error("plugin.json has an invalid name");
  }
  if (typeof record.version !== "string") {
    throw new Error("plugin.json has an invalid version");
  }
  if (record.description !== undefined && typeof record.description !== "string") {
    throw new Error("plugin.json has an invalid description");
  }
  if (record.ui !== undefined && typeof record.ui !== "string") {
    throw new Error("plugin.json has an invalid ui entry");
  }
  if (record.agent !== undefined && typeof record.agent !== "string") {
    throw new Error("plugin.json has an invalid agent entry");
  }
  return {
    id: record.id,
    name: record.name,
    version: record.version,
    description: record.description as string | undefined,
    ui: record.ui as string | undefined,
    agent: record.agent as string | undefined,
  };
}

export function resolvePluginEntry(directory: string, entry: string): string {
  const base = resolve(directory);
  const candidate = resolve(base, entry);
  if (candidate !== base && !candidate.startsWith(`${base}${sep}`)) {
    throw new Error("Plugin entry escapes its directory");
  }
  return candidate;
}

async function enabledPlugins(pluginsDirectory: string): Promise<Record<string, boolean>> {
  const statePath = join(dirname(pluginsDirectory), "plugins.json");
  try {
    const contents = await readFile(statePath, "utf8");
    const parsed: unknown = JSON.parse(contents);
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
      return {};
    }
    return parsed as Record<string, boolean>;
  } catch {
    return {};
  }
}

export async function listAgentExtensionFiles({
  pluginsDir = join(process.env.HOME ?? homedir(), ".rpcdesk/plugins"),
  enabled,
}: {
  pluginsDir?: string;
  enabled?: Record<string, boolean>;
} = {}): Promise<AgentExtensionFile[]> {
  const state = enabled ?? (await enabledPlugins(pluginsDir));
  let entries;
  try {
    entries = await readdir(pluginsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const loaded: AgentExtensionFile[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = join(pluginsDir, entry.name);
    let manifest: PluginManifest;
    try {
      manifest = parseManifest(
        JSON.parse(await readFile(join(directory, "plugin.json"), "utf8")),
      );
    } catch {
      continue;
    }
    if (manifest.id !== entry.name) continue;
    if (state[manifest.id] === false) continue;
    if (!manifest.agent) continue;

    try {
      const file = resolvePluginEntry(directory, manifest.agent);
      const info = await stat(file);
      if (!info.isFile()) throw new Error("agent entry is not a file");
      loaded.push({ id: manifest.id, path: file });
    } catch (error) {
      console.error(
        `rpcdesk: failed to resolve agent plugin ${manifest.id}: ${(error as Error).message}`,
      );
    }
  }
  return loaded;
}

export async function loadAgentExtensions({
  pluginsDir = join(process.env.HOME ?? homedir(), ".rpcdesk/plugins"),
  enabled,
}: {
  pluginsDir?: string;
  enabled?: Record<string, boolean>;
} = {}): Promise<LoadedAgentExtension[]> {
  const state = enabled ?? (await enabledPlugins(pluginsDir));
  let entries;
  try {
    entries = await readdir(pluginsDir, { withFileTypes: true });
  } catch {
    return [];
  }

  const loaded: LoadedAgentExtension[] = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const directory = join(pluginsDir, entry.name);
    let manifest: PluginManifest;
    try {
      manifest = parseManifest(
        JSON.parse(await readFile(join(directory, "plugin.json"), "utf8")),
      );
    } catch {
      continue;
    }
    if (manifest.id !== entry.name) continue;
    if (state[manifest.id] === false) continue;
    if (!manifest.agent) continue;

    try {
      const file = resolvePluginEntry(directory, manifest.agent);
      const info = await stat(file);
      const module = await import(
        `${pathToFileURL(file).href}?mtime=${info.mtimeMs}`
      );
      const factory = (module as { default?: unknown }).default ?? module;
      if (typeof factory !== "function") {
        throw new Error("agent entry must export a function");
      }
      loaded.push({
        id: manifest.id,
        factory: factory as (pi: unknown) => void,
      });
    } catch (error) {
      console.error(
        `rpcdesk: failed to load agent plugin ${manifest.id}: ${(error as Error).message}`,
      );
    }
  }
  return loaded;
}
