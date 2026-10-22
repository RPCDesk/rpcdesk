import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { open } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";

export const isTauri =
  typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;

export async function call<T>(
  command: string,
  args?: Record<string, unknown>,
): Promise<T> {
  if (!isTauri) throw new Error("Tauri is not available in this preview");
  return invoke<T>(command, args);
}

export async function pickDirectory(): Promise<string | null> {
  if (!isTauri) return null;
  const result = await open({ directory: true, multiple: false });
  return typeof result === "string" ? result : null;
}

export async function openExternal(url: string): Promise<void> {
  if (!isTauri) {
    window.open(url, "_blank", "noopener");
    return;
  }
  await openUrl(url);
}

export async function listenForConfigChanges(
  callback: (path: string) => void,
): Promise<() => void> {
  if (!isTauri) return () => {};
  const unlisten = await listen<string>("user-config-changed", (event) => {
    callback(String(event.payload));
  });
  return unlisten;
}
