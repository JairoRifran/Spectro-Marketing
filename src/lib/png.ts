import { crc32 } from "./zip";

// A minimal PNG encoder.
//
// The mock image provider needs to return a file that decoders actually accept, for the same
// reason the mock voice returns a real WAV: placeholder bytes would let storage, download and
// display all pass tests against something no decoder opens, and the first real integration
// would be the first time any of it ran.
//
// Deflate is used in its "stored" mode — no compression at all. Implementing real compression to
// make a placeholder smaller would be a lot of code to save bytes nobody is counting, and stored
// blocks are part of the same format spec, so the output is a completely ordinary PNG.

const SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

function chunk(type: string, data: Uint8Array): Uint8Array {
  const out = new Uint8Array(12 + data.length);
  const view = new DataView(out.buffer);
  view.setUint32(0, data.length);
  for (let index = 0; index < 4; index += 1) out[4 + index] = type.charCodeAt(index);
  out.set(data, 8);
  // The checksum covers the type and the data, not the length.
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)));
  return out;
}

/** Adler-32, which is what zlib appends rather than the CRC the PNG chunks use. */
function adler32(bytes: Uint8Array): number {
  let a = 1;
  let b = 0;
  for (const byte of bytes) {
    a = (a + byte) % 65_521;
    b = (b + a) % 65_521;
  }
  return ((b << 16) | a) >>> 0;
}

/** Wraps raw bytes in a zlib stream made of stored deflate blocks. */
function zlibStored(raw: Uint8Array): Uint8Array {
  const MAX = 65_535;
  const blocks = Math.max(1, Math.ceil(raw.length / MAX));
  const out = new Uint8Array(2 + blocks * 5 + raw.length + 4);
  const view = new DataView(out.buffer);

  out[0] = 0x78; // deflate, 32k window
  out[1] = 0x01; // no preset dictionary, fastest
  let offset = 2;

  for (let index = 0; index < blocks; index += 1) {
    const start = index * MAX;
    const size = Math.min(MAX, raw.length - start);
    out[offset] = index === blocks - 1 ? 1 : 0; // final flag, stored block
    view.setUint16(offset + 1, size, true);
    view.setUint16(offset + 3, ~size & 0xffff, true);
    out.set(raw.subarray(start, start + size), offset + 5);
    offset += 5 + size;
  }

  view.setUint32(offset, adler32(raw));
  return out;
}

export interface PngInput {
  width: number;
  height: number;
  /** Returns the colour of one pixel. Called once per pixel, so keep it cheap. */
  pixel: (x: number, y: number) => { r: number; g: number; b: number };
}

export function encodePng({ width, height, pixel }: PngInput): Uint8Array {
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 1 || height < 1) {
    throw new Error("png_invalid_size");
  }

  // Every scanline is prefixed with its filter type. Zero means "no filter", which is honest for
  // generated pixels and keeps the encoder to one page.
  const raw = new Uint8Array(height * (1 + width * 3));
  let cursor = 0;
  for (let y = 0; y < height; y += 1) {
    raw[cursor++] = 0;
    for (let x = 0; x < width; x += 1) {
      const { r, g, b } = pixel(x, y);
      raw[cursor++] = r & 0xff;
      raw[cursor++] = g & 0xff;
      raw[cursor++] = b & 0xff;
    }
  }

  const header = new Uint8Array(13);
  const headerView = new DataView(header.buffer);
  headerView.setUint32(0, width);
  headerView.setUint32(4, height);
  header[8] = 8;  // bit depth
  header[9] = 2;  // colour type: truecolour
  header[10] = 0; // deflate
  header[11] = 0; // adaptive filtering
  header[12] = 0; // no interlace

  const parts = [
    new Uint8Array(SIGNATURE),
    chunk("IHDR", header),
    chunk("IDAT", zlibStored(raw)),
    chunk("IEND", new Uint8Array()),
  ];

  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const png = new Uint8Array(total);
  let at = 0;
  for (const part of parts) {
    png.set(part, at);
    at += part.length;
  }
  return png;
}
