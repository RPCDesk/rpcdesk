import { cp, mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const source = join(root, "sidecar");
const destination = join(root, "src-tauri/resources/sidecar");
const bunBinary = process.execPath;

async function assertFile(path: string, label: string): Promise<void> {
  const info = await stat(path).catch(() => undefined);
  if (!info?.isFile()) throw new Error(`${label} is missing at ${path}`);
}

async function main(): Promise<void> {
  await assertFile(join(source, "src/main.ts"), "Sidecar entry");
  await assertFile(join(source, "src/build-plugin.ts"), "Plugin builder");
  await assertFile(join(source, "src/extensions/pi-gate.js"), "Pi approval gate");
  await assertFile(join(source, "package.json"), "Sidecar package manifest");
  await assertFile(bunBinary, "Bun runtime");

  await rm(destination, { recursive: true, force: true });
  await mkdir(destination, { recursive: true });

  // Tauri copies resources into target/<profile>/resources and does not clean stale files.
  await rm(join(root, "src-tauri/target/release/resources"), {
    recursive: true,
    force: true,
  });
  await rm(join(root, "src-tauri/target/debug/resources"), {
    recursive: true,
    force: true,
  });
  // AppImage staging is not cleaned by the bundler and leaks previous payloads.
  for (const stage of ["appimage", "appimage_deb"]) {
    await rm(join(root, "src-tauri/target/release/bundle", stage), {
      recursive: true,
      force: true,
    });
  }

  await cp(join(source, "src"), join(destination, "src"), { recursive: true });
  await cp(join(source, "package.json"), join(destination, "package.json"));

  const bunBytes = await readFile(bunBinary);
  const compressed = Bun.gzipSync(bunBytes);
  await writeFile(join(destination, "bun.bin"), compressed);
  if (compressed.length >= bunBytes.length) {
    throw new Error("Bun compression did not reduce the runtime size");
  }

  const install = Bun.spawnSync({
    cmd: [bunBinary, "install", "--production"],
    cwd: destination,
    stdout: "inherit",
    stderr: "inherit",
  });
  if (install.exitCode !== 0) {
    throw new Error(`bun install failed in ${destination}`);
  }

  await rm(join(destination, "node_modules/.bin"), {
    recursive: true,
    force: true,
  });

  const protocolTarget = join(
    destination,
    "node_modules/@rpcdesk/protocol",
  );
  await mkdir(join(destination, "node_modules/@rpcdesk"), {
    recursive: true,
  });
  await cp(join(root, "packages/protocol"), protocolTarget, {
    recursive: true,
  });

  console.log(
    `Staged sidecar at ${destination}\nBun: ${bunBinary}\nBun payload: ${compressed.length} bytes (from ${bunBytes.length}) in bun.bin\nEmbedded packages: diff, @rpcdesk/protocol`,
  );
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
