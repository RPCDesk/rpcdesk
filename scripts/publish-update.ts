import { existsSync } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, dirname, join, resolve } from "node:path";
import { createStoredZip } from "./zip-store";

/**
 * Packages and signs one platform artifact, then merges it into a Tauri updater manifest.
 *
 *   bun scripts/publish-update.ts \
 *     --version 0.2.0 --target darwin-aarch64 \
 *     --artifact "src-tauri/target/release/bundle/macos/rpcdesk.app" \
 *     --base-url https://example.com/rpcdesk \
 *     --feed /tmp/pi-update-feed
 */

interface Args {
  version: string;
  target: string;
  artifact: string;
  baseUrl: string;
  feed: string;
  notes?: string;
  key: string;
}

function arg(name: string, required = true): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (!value && required) throw new Error(`Missing --${name}`);
  return value;
}

function parseArgs(): Args {
  const key =
    process.env.RPCDESK_SIGNING_KEY ??
    join(homedir(), ".Secrets/rpcdesk/updater.key");
  return {
    version: arg("version")!,
    target: arg("target")!,
    artifact: resolve(arg("artifact")!),
    baseUrl: arg("base-url")!.replace(/\/$/, ""),
    feed: resolve(arg("feed") ?? "dist-updates"),
    notes: arg("notes", false),
    key,
  };
}

function archiveName(target: string, version: string): string {
  const family = target.split("-")[0];
  if (family === "windows") return `rpcdesk_${version}_${target}.nsis.zip`;
  if (family === "linux") return `rpcdesk_${version}_${target}.AppImage.tar.gz`;
  return `rpcdesk_${version}_${target}.app.tar.gz`;
}

async function run(cmd: string[], cwd: string): Promise<void> {
  const child = Bun.spawn({ cmd, cwd, stdout: "inherit", stderr: "inherit" });
  const code = await child.exited;
  if (code !== 0) throw new Error(`${cmd.join(" ")} failed with ${code}`);
}

async function packageArtifact(args: Args, archive: string, workdir: string): Promise<void> {
  const info = await stat(args.artifact);
  const family = args.target.split("-")[0];

  if (family === "windows") {
    if (!info.isFile()) throw new Error("Windows artifacts must be installer files");
    // The updater's zip reader has no compression codecs, so store the entry as-is.
    const contents = new Uint8Array(await readFile(args.artifact));
    await writeFile(
      archive,
      createStoredZip([{ name: basename(args.artifact), contents }]),
    );
    return;
  }

  // macOS ships the whole .app directory; Linux ships the AppImage file.
  // Stage a canonical member name so archives are self-describing.
  const staged = join(workdir, basename(archive).replace(/\.(app\.)?tar\.gz$/, ""));
  await run(["/bin/cp", "-R", args.artifact, staged], dirname(args.artifact));
  await run(["/usr/bin/tar", "-czf", archive, basename(staged)], workdir);
  await rm(staged, { recursive: true, force: true });
}

async function main(): Promise<void> {
  const args = parseArgs();
  if (!existsSync(args.key)) {
    throw new Error(`Signing key not found: ${args.key}`);
  }

  const workdir = join(args.feed, ".work");
  await rm(workdir, { recursive: true, force: true });
  await mkdir(workdir, { recursive: true });
  await mkdir(args.feed, { recursive: true });

  const name = archiveName(args.target, args.version);
  const archive = join(args.feed, name);
  await packageArtifact(args, archive, workdir);

  await run(
    [
      process.execPath,
      "run",
      "tauri",
      "signer",
      "sign",
      "-f",
      args.key,
      "-p",
      process.env.TAURI_SIGNING_PRIVATE_KEY_PASSWORD ?? "",
      archive,
    ],
    resolve(import.meta.dir, ".."),
  );

  const signature = (await readFile(`${archive}.sig`, "utf8")).trim();
  const manifestPath = join(args.feed, "latest.json");
  const manifest = existsSync(manifestPath)
    ? JSON.parse(await readFile(manifestPath, "utf8"))
    : {
        version: args.version,
        notes: args.notes ?? "",
        pub_date: new Date().toISOString(),
        platforms: {},
      };

  manifest.version = args.version;
  manifest.pub_date = new Date().toISOString();
  if (args.notes) manifest.notes = args.notes;
  manifest.platforms = {
    ...manifest.platforms,
    [args.target]: { signature, url: `${args.baseUrl}/${name}` },
  };

  await writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
  await rm(workdir, { recursive: true, force: true });

  console.log(`Published ${args.target} ${args.version}\n  archive: ${archive}\n  manifest: ${manifestPath}`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
