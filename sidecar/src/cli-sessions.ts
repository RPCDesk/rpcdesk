import { readdir, open, realpath, stat } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, join, resolve } from "node:path";
import type { Backend, SessionInfo } from "@pi-desktop/protocol";

const MAX_SESSION_BYTES = 96 * 1024;
const MAX_SESSIONS = 60;

interface SessionMeta {
  path: string;
  id: string;
  title: string;
  cwd?: string;
  updatedAt: number;
}

function rootFor(backend: Backend): string {
  const home = process.env.HOME ?? homedir();
  return backend === "omp"
    ? join(home, ".omp/agent/sessions")
    : join(home, ".pi/agent/sessions");
}

async function listJsonl(directory: string, depth = 0): Promise<string[]> {
  if (depth > 3) return [];
  let entries;
  try {
    entries = await readdir(directory, { withFileTypes: true });
  } catch {
    return [];
  }
  const files: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      files.push(...(await listJsonl(path, depth + 1)));
    } else if (entry.isFile() && entry.name.endsWith(".jsonl")) {
      files.push(path);
    }
  }
  return files;
}

function textFromContent(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((block) => {
      if (
        typeof block === "object" &&
        block !== null &&
        "type" in block &&
        block.type === "text" &&
        "text" in block &&
        typeof block.text === "string"
      ) {
        return block.text;
      }
      return "";
    })
    .filter(Boolean)
    .join(" ");
}

async function readHead(path: string): Promise<string> {
  const handle = await open(path, "r");
  try {
    const buffer = Buffer.alloc(MAX_SESSION_BYTES);
    const { bytesRead } = await handle.read(buffer, 0, buffer.length, 0);
    return buffer.subarray(0, bytesRead).toString("utf8");
  } finally {
    await handle.close();
  }
}

function parseMeta(path: string, text: string, mtimeMs: number): SessionMeta {
  let id = basename(path).replace(/\.jsonl$/, "");
  let title = "";
  let cwd: string | undefined;
  let firstUser = "";

  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    let record: Record<string, unknown>;
    try {
      record = JSON.parse(line) as Record<string, unknown>;
    } catch {
      continue;
    }
    if (record.type === "session") {
      if (typeof record.id === "string") id = record.id;
      if (typeof record.cwd === "string") cwd = record.cwd;
      continue;
    }
    if (record.type === "title" && typeof record.title === "string") {
      title = record.title;
      continue;
    }
    const message =
      record.type === "message" && typeof record.message === "object"
        ? (record.message as Record<string, unknown>)
        : record;
    if (message.role !== "user") continue;
    const value = textFromContent(message.content).trim();
    if (value && !firstUser) firstUser = value;
  }

  return {
    path,
    id,
    title: (title || firstUser || "New session").slice(0, 120),
    cwd,
    updatedAt: mtimeMs,
  };
}

async function collect(backend: Backend): Promise<SessionMeta[]> {
  const root = rootFor(backend);
  const files = await listJsonl(root);
  const metas: SessionMeta[] = [];
  for (const file of files) {
    try {
      const info = await stat(file);
      const text = await readHead(file);
      metas.push(parseMeta(file, text, info.mtimeMs));
    } catch {
      // skip unreadable sessions
    }
  }
  return metas;
}

async function canonical(path: string): Promise<string> {
  try {
    return await realpath(path);
  } catch {
    return resolve(path);
  }
}

export async function listSessions(
  backend: Backend,
  cwd: string,
): Promise<SessionInfo[]> {
  const wanted = await canonical(cwd);
  const metas = await collect(backend);
  const seen = new Set<string>();
  const result: SessionInfo[] = [];
  for (const meta of metas) {
    if (!meta.cwd) continue;
    if ((await canonical(meta.cwd)) !== wanted) continue;
    if (seen.has(meta.path)) continue;
    seen.add(meta.path);
    result.push({
      path: meta.path,
      id: meta.id,
      title: meta.title,
      updatedAt: meta.updatedAt,
      cwd,
    });
    if (result.length >= MAX_SESSIONS) break;
  }
  return result.sort((left, right) => right.updatedAt - left.updatedAt);
}

export async function findSessionFile(
  backend: Backend,
  sessionId: string | undefined,
  cwd: string,
): Promise<string | undefined> {
  if (!sessionId) return undefined;
  const metas = await collect(backend);
  const wanted = await canonical(cwd);
  for (const meta of metas) {
    if (meta.id !== sessionId && !meta.path.includes(sessionId)) continue;
    if (meta.cwd && (await canonical(meta.cwd)) !== wanted) continue;
    return meta.path;
  }
  return undefined;
}
