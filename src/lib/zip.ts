// A minimal, store-only ZIP writer.
//
// A piece is a set of files — six carousel slides, a cover, later an audio track — and browsers
// block a page that fires six downloads in a row. One archive is the only reasonable delivery,
// and the alternative to sixty lines here is a dependency for a format that has not changed
// since 1993.
//
// Store-only means no compression. PNGs are already compressed, so deflate would buy almost
// nothing and cost the entire complexity of the format.

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let index = 0; index < 256; index += 1) {
    let value = index;
    for (let bit = 0; bit < 8; bit += 1) {
      value = value & 1 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
    }
    table[index] = value >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

export interface ZipEntry {
  name: string;
  bytes: Uint8Array;
}

/**
 * File names inside an archive are a real hazard: a name with `..` or a leading slash is how a
 * zip escapes the folder it was extracted into. These names are ours, not a user's, but the
 * rule belongs next to the writer rather than in the memory of whoever calls it.
 */
export function safeEntryName(name: string): string {
  const cleaned = name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^A-Za-z0-9._ -]/g, "-")
    .replace(/\.{2,}/g, ".")
    .replace(/^[.\-\s]+/, "")
    .trim();
  return cleaned || "archivo";
}

function writeUint32(view: DataView, offset: number, value: number) {
  view.setUint32(offset, value >>> 0, true);
}

function writeUint16(view: DataView, offset: number, value: number) {
  view.setUint16(offset, value & 0xffff, true);
}

/**
 * Builds the archive. Deterministic: the same entries always produce the same bytes, because
 * the timestamp fields are fixed rather than taken from the clock. An archive that differs on
 * every build cannot be compared, cached or tested.
 */
export function createZip(entries: ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const prepared = entries.map((entry) => {
    const name = encoder.encode(safeEntryName(entry.name));
    return { name, bytes: entry.bytes, crc: crc32(entry.bytes) };
  });

  const localSize = prepared.reduce((total, entry) => total + 30 + entry.name.length + entry.bytes.length, 0);
  const centralSize = prepared.reduce((total, entry) => total + 46 + entry.name.length, 0);
  const output = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(output.buffer);

  let offset = 0;
  const offsets: number[] = [];

  for (const entry of prepared) {
    offsets.push(offset);
    writeUint32(view, offset, 0x04034b50);
    writeUint16(view, offset + 4, 20);   // version needed
    writeUint16(view, offset + 6, 0);    // flags
    writeUint16(view, offset + 8, 0);    // method: stored
    writeUint16(view, offset + 10, 0);   // time, fixed for determinism
    writeUint16(view, offset + 12, 0x21);// date, fixed: 1980-01-01
    writeUint32(view, offset + 14, entry.crc);
    writeUint32(view, offset + 18, entry.bytes.length);
    writeUint32(view, offset + 22, entry.bytes.length);
    writeUint16(view, offset + 26, entry.name.length);
    writeUint16(view, offset + 28, 0);   // extra field length
    output.set(entry.name, offset + 30);
    output.set(entry.bytes, offset + 30 + entry.name.length);
    offset += 30 + entry.name.length + entry.bytes.length;
  }

  const centralStart = offset;
  for (const [index, entry] of prepared.entries()) {
    writeUint32(view, offset, 0x02014b50);
    writeUint16(view, offset + 4, 20);   // version made by
    writeUint16(view, offset + 6, 20);   // version needed
    writeUint16(view, offset + 8, 0);
    writeUint16(view, offset + 10, 0);
    writeUint16(view, offset + 12, 0);
    writeUint16(view, offset + 14, 0x21);
    writeUint32(view, offset + 16, entry.crc);
    writeUint32(view, offset + 20, entry.bytes.length);
    writeUint32(view, offset + 24, entry.bytes.length);
    writeUint16(view, offset + 28, entry.name.length);
    writeUint16(view, offset + 30, 0);   // extra
    writeUint16(view, offset + 32, 0);   // comment
    writeUint16(view, offset + 34, 0);   // disk
    writeUint16(view, offset + 36, 0);   // internal attrs
    writeUint32(view, offset + 38, 0);   // external attrs
    writeUint32(view, offset + 42, offsets[index]);
    output.set(entry.name, offset + 46);
    offset += 46 + entry.name.length;
  }

  writeUint32(view, offset, 0x06054b50);
  writeUint16(view, offset + 4, 0);
  writeUint16(view, offset + 6, 0);
  writeUint16(view, offset + 8, prepared.length);
  writeUint16(view, offset + 10, prepared.length);
  writeUint32(view, offset + 12, offset - centralStart);
  writeUint32(view, offset + 16, centralStart);
  writeUint16(view, offset + 20, 0);

  return output;
}
