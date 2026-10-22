type PluginEventListener = (event: unknown) => void;

const listeners = new Set<PluginEventListener>();

export function onPluginEvent(listener: PluginEventListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function clearPluginEventListeners(): void {
  listeners.clear();
}

export function emitPluginEvent(event: unknown): void {
  for (const listener of listeners) {
    try {
      listener(event);
    } catch (error) {
      console.error("Plugin event listener failed", error);
    }
  }
}
