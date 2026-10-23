import { describe, expect, it } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildUiPlugin } from "./build-plugin";

describe("buildUiPlugin", () => {
  it("transpiles classic JSX to React.createElement", async () => {
    const root = await mkdtemp(join(tmpdir(), "rpcdesk-build-"));
    await writeFile(
      join(root, "plugin.json"),
      JSON.stringify({ id: "hello", name: "Hello", version: "0.1.0", ui: "ui.tsx" }),
    );
    await writeFile(
      join(root, "ui.tsx"),
      'module.exports = () => <div className="x">hi</div>;\n',
    );
    const output = buildUiPlugin(join(root, "plugin.json"));
    expect(output.code).toContain("React.createElement");
    expect(output.mtime).toBeGreaterThan(0);
    await rm(root, { recursive: true, force: true });
  });

  it("rejects ESM entries", async () => {
    const root = await mkdtemp(join(tmpdir(), "rpcdesk-build-"));
    await writeFile(
      join(root, "plugin.json"),
      JSON.stringify({ id: "hello", name: "Hello", version: "0.1.0", ui: "ui.tsx" }),
    );
    await writeFile(join(root, "ui.tsx"), 'export default () => null;\n');
    expect(() => buildUiPlugin(join(root, "plugin.json"))).toThrow("module.exports");
    await rm(root, { recursive: true, force: true });
  });
});
