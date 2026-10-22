import { describe, expect, it } from "vitest";
import { crc32, createStoredZip } from "./zip-store";

function readStoredEntry(archive: Uint8Array, name: string): Uint8Array | undefined {
  const view = new DataView(archive.buffer, archive.byteOffset, archive.byteLength);
  for (let offset = 0; offset + 30 <= archive.length; ) {
    if (view.getUint32(offset, true) !== 0x04034b50) return undefined;
    const method = view.getUint16(offset + 8, true);
    const size = view.getUint32(offset + 18, true);
    const nameLength = view.getUint16(offset + 26, true);
    const extraLength = view.getUint16(offset + 28, true);
    const entryName = new TextDecoder().decode(
      archive.subarray(offset + 30, offset + 30 + nameLength),
    );
    const start = offset + 30 + nameLength + extraLength;
    if (entryName === name) {
      expect(method).toBe(0);
      return archive.subarray(start, start + size);
    }
    offset = start + size;
  }
  return undefined;
}

describe("crc32", () => {
  it("matches known values", () => {
    expect(crc32(new TextEncoder().encode(""))).toBe(0);
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
    expect(crc32(new TextEncoder().encode("pi-desktop"))).toBe(0x137d774c);
  });
});

describe("createStoredZip", () => {
  it("stores entries uncompressed and readable", () => {
    const payload = new TextEncoder().encode("installer bytes");
    const archive = createStoredZip([{ name: "Pi Setup.exe", contents: payload }]);
    const stored = readStoredEntry(archive, "Pi Setup.exe");
    expect(stored).toBeDefined();
    expect(new TextDecoder().decode(stored!)).toBe("installer bytes");
    expect(archive.length).toBeGreaterThan(payload.length);
  });
});
