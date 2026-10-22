import { readFileSync, statSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";

export interface PluginBuildOutput {
  code: string;
  mtime: number;
}

export function buildUiPlugin(manifestPath: string): PluginBuildOutput {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8")) as {
    ui?: string;
  };
  if (typeof manifest.ui !== "string" || manifest.ui.length === 0) {
    throw new Error("Plugin has no UI entry");
  }

  const directory = dirname(manifestPath);
  const entry = resolve(directory, manifest.ui);
  if (entry !== resolve(directory) && !entry.startsWith(`${resolve(directory)}${sep}`)) {
    throw new Error("Plugin UI entry escapes its directory");
  }

  const source = readFileSync(entry, "utf8");
  if (/^\s*(?:import|export)\s/m.test(source)) {
    throw new Error(
      "UI plugins must use module.exports; top-level import/export is not supported",
    );
  }

  const transpiler = new Bun.Transpiler({
    loader: "tsx",
    tsconfig: JSON.stringify({
      compilerOptions: {
        jsx: "react",
        jsxFactory: "React.createElement",
        jsxFragmentFactory: "React.Fragment",
      },
    }),
  });

  return {
    code: transpiler.transformSync(source),
    mtime: statSync(entry).mtimeMs,
  };
}

if (import.meta.main) {
  try {
    const manifestPath = process.argv[2];
    if (!manifestPath) throw new Error("Manifest path is required");
    process.stdout.write(JSON.stringify(buildUiPlugin(manifestPath)));
  } catch (error) {
    console.error((error as Error).message);
    process.exit(1);
  }
}
