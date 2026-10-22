import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  listAgentExtensionFiles,
  loadAgentExtensions,
  parseManifest,
  resolvePluginEntry,
  validPluginId,
} from "./plugins";

describe("plugin manifests", () => {
  it("validates ids", () => {
    expect(validPluginId("hello-world")).toBe(true);
    expect(validPluginId("../escape")).toBe(false);
    expect(validPluginId("Upper")).toBe(false);
  });

  it("parses a manifest", () => {
    const manifest = parseManifest({
      id: "hello-world",
      name: "Hello",
      version: "0.1.0",
      ui: "ui.tsx",
      agent: "agent.ts",
    });
    expect(manifest.id).toBe("hello-world");
    expect(manifest.ui).toBe("ui.tsx");
  });

  it("rejects an escaping entry", () => {
    const directory = join(tmpdir(), "pi-desktop-plugin-root");
    expect(() => resolvePluginEntry(directory, "../escape.ts")).toThrow(
      "escapes",
    );
  });
});

describe("loadAgentExtensions", () => {
  it("loads an enabled agent plugin and skips a disabled one", async () => {
    const root = await mkdtemp(join(tmpdir(), "pi-desktop-plugins-"));
    const plugins = join(root, "plugins");
    await mkdir(join(plugins, "hello"), { recursive: true });
    await mkdir(join(plugins, "off"), { recursive: true });
    await writeFile(
      join(plugins, "hello", "plugin.json"),
      JSON.stringify({
        id: "hello",
        name: "Hello",
        version: "0.1.0",
        agent: "agent.mjs",
      }),
    );
    await writeFile(
      join(plugins, "hello", "agent.mjs"),
      "export default function (pi) { pi.seen = true; }\n",
    );
    await writeFile(
      join(plugins, "off", "plugin.json"),
      JSON.stringify({
        id: "off",
        name: "Off",
        version: "0.1.0",
        agent: "agent.mjs",
      }),
    );
    await writeFile(join(plugins, "off", "agent.mjs"), "export default () => {}\n");

    const loaded = await loadAgentExtensions({
      pluginsDir: plugins,
      enabled: { hello: true, off: false },
    });
    expect(loaded.map((extension) => extension.id)).toEqual(["hello"]);
    expect(typeof loaded[0]?.factory).toBe("function");

    const files = await listAgentExtensionFiles({
      pluginsDir: plugins,
      enabled: { hello: true, off: false },
    });
    expect(files.map((extension) => extension.id)).toEqual(["hello"]);
    expect(files[0]?.path.endsWith("agent.mjs")).toBe(true);
    await rm(root, { recursive: true, force: true });
  });
});
