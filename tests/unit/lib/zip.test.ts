import { describe, expect, it } from "vitest";
import { createZip, crc32, safeEntryName } from "@/lib/zip";

const bytes = (text: string) => new TextEncoder().encode(text);
const readUint32 = (zip: Uint8Array, offset: number) => new DataView(zip.buffer).getUint32(offset, true);
const readUint16 = (zip: Uint8Array, offset: number) => new DataView(zip.buffer).getUint16(offset, true);

describe("crc32", () => {
  it("matches the known value for a standard input", () => {
    // The canonical CRC-32 check value. If this drifts, every archive is subtly corrupt.
    expect(crc32(bytes("123456789"))).toBe(0xcbf43926);
  });

  it("is empty-safe", () => {
    expect(crc32(new Uint8Array())).toBe(0);
  });

  it("changes when a single byte changes", () => {
    expect(crc32(bytes("spectro"))).not.toBe(crc32(bytes("spectrp")));
  });
});

describe("entry names", () => {
  it("refuses a path that would escape the extraction folder", () => {
    expect(safeEntryName("../../etc/passwd")).not.toContain("..");
    expect(safeEntryName("/absolute/path.png").startsWith("/")).toBe(false);
  });

  it("strips accents rather than emitting them into a file name", () => {
    expect(safeEntryName("Educación.png")).toBe("Educacion.png");
  });

  it("never returns an empty name", () => {
    expect(safeEntryName("...")).toBeTruthy();
    expect(safeEntryName("")).toBeTruthy();
  });

  it("keeps a normal name readable", () => {
    expect(safeEntryName("instagram-carrusel-01.png")).toBe("instagram-carrusel-01.png");
  });
});

describe("archive", () => {
  const entries = [
    { name: "uno.txt", bytes: bytes("primero") },
    { name: "dos.txt", bytes: bytes("segundo") },
  ];

  it("starts with the local file header signature", () => {
    expect(readUint32(createZip(entries), 0)).toBe(0x04034b50);
  });

  it("records every entry in the central directory", () => {
    const zip = createZip(entries);
    const end = zip.length - 22;
    expect(readUint32(zip, end)).toBe(0x06054b50);
    expect(readUint16(zip, end + 10)).toBe(entries.length);
  });

  it("points the central directory at a real offset inside the archive", () => {
    const zip = createZip(entries);
    const start = readUint32(zip, zip.length - 22 + 16);
    expect(start).toBeLessThan(zip.length);
    expect(readUint32(zip, start)).toBe(0x02014b50);
  });

  it("stores the payload verbatim, since PNGs are already compressed", () => {
    const zip = createZip([{ name: "uno.txt", bytes: bytes("primero") }]);
    expect(readUint16(zip, 8)).toBe(0);
    expect(new TextDecoder().decode(zip.slice(30 + 7, 30 + 7 + 7))).toBe("primero");
  });

  it("records the payload size and checksum the reader will verify", () => {
    const payload = bytes("primero");
    const zip = createZip([{ name: "uno.txt", bytes: payload }]);
    expect(readUint32(zip, 14)).toBe(crc32(payload));
    expect(readUint32(zip, 18)).toBe(payload.length);
    expect(readUint32(zip, 22)).toBe(payload.length);
  });

  it("is deterministic: the same entries always produce the same bytes", () => {
    // Timestamps come from a constant, not the clock, so archives can be compared and cached.
    expect(Array.from(createZip(entries))).toEqual(Array.from(createZip(entries)));
  });

  it("handles an empty archive without producing something unreadable", () => {
    const zip = createZip([]);
    expect(zip.length).toBe(22);
    expect(readUint32(zip, 0)).toBe(0x06054b50);
  });
});
