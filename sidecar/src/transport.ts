export interface LineReader {
  push(chunk: Uint8Array | string): void;
  flush(): void;
}

export function createLineReader(onLine: (line: string) => void): LineReader {
  const decoder = new TextDecoder();
  let buffer = "";

  const emit = (raw: string) => {
    const line = raw.endsWith("\r") ? raw.slice(0, -1) : raw;
    if (line.length > 0) onLine(line);
  };

  return {
    push(chunk) {
      buffer += typeof chunk === "string" ? chunk : decoder.decode(chunk, { stream: true });
      let newline = buffer.indexOf("\n");
      while (newline >= 0) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        emit(line);
        newline = buffer.indexOf("\n");
      }
    },
    flush() {
      if (buffer.length > 0) {
        emit(buffer);
        buffer = "";
      }
      const rest = decoder.decode();
      if (rest.length > 0) emit(rest);
    },
  };
}
