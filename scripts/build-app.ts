import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");

function signingKey(): string | undefined {
  const explicit = process.env.PI_DESKTOP_SIGNING_KEY;
  if (explicit && existsSync(explicit)) return explicit;
  const candidate = join(homedir(), ".Secrets/pi-desktop/updater.key");
  return existsSync(candidate) ? candidate : undefined;
}

async function main(): Promise<void> {
  const key = signingKey();
  const args = ["bun", "run", "tauri", "build", ...process.argv.slice(2)];
  const env: Record<string, string> = { ...process.env } as Record<string, string>;

  if (key) {
    env.TAURI_SIGNING_PRIVATE_KEY = key;
    if (process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD === undefined) {
      env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD = "";
    }
    console.log(`Signing updater artifacts with ${key}`);
  } else {
    console.log(
      "No signing key found (PI_DESKTOP_SIGNING_KEY or ~/.Secrets/pi-desktop/updater.key); building without updater artifacts.",
    );
    args.push(
      "--config",
      JSON.stringify({ bundle: { createUpdaterArtifacts: false } }),
    );
  }

  const child = Bun.spawn({ cmd: args, cwd: root, env, stdout: "inherit", stderr: "inherit" });
  process.exit(await child.exited);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
