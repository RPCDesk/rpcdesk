import { describe, expect, it } from "vitest";
import { createLineReader } from "./transport";

describe("createLineReader", () => {
  it("splits LF and CRLF frames and strips the CR", () => {
    const lines: string[] = [];
    const reader = createLineReader((line) => lines.push(line));
    reader.push('{"a":1}\n{"b":2}\r\n');
    expect(lines).toEqual(['{"a":1}', '{"b":2}']);
  });

  it("does not split on Unicode line separators", () => {
    const lines: string[] = [];
    const reader = createLineReader((line) => lines.push(line));
    reader.push('{"text":"a\u2028b"}\n');
    expect(lines).toEqual(['{"text":"a\u2028b"}']);
  });

  it("emits the final partial line on flush", () => {
    const lines: string[] = [];
    const reader = createLineReader((line) => lines.push(line));
    reader.push('{"partial":true}');
    expect(lines).toEqual([]);
    reader.flush();
    expect(lines).toEqual(['{"partial":true}']);
  });
});
