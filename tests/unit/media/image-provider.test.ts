import { describe, expect, it, vi } from "vitest";
import { encodePng } from "@/lib/png";
import { imageRequestSchema, MockImageProvider } from "@/server/media/image-provider";
import { PollinationsProvider, getImageProvider } from "@/server/media/pollinations-provider";
import { MediaProviderError } from "@/server/media/provider";

const request = { prompt: "Escritorio con notas y una laptop", width: 1080, height: 1350, seed: 7 };

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.slice(offset, offset + length));
const uint32 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer).getUint32(offset);

function providerWith(response: Response | Error) {
  const fetchImpl = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch;
  return { provider: new PollinationsProvider({ fetchImpl }), fetchImpl: fetchImpl as unknown as ReturnType<typeof vi.fn> };
}

const png = (bytes = new Uint8Array([1, 2, 3, 4])) =>
  new Response(bytes as unknown as BodyInit, { status: 200, headers: { "content-type": "image/png" } });

describe("png encoding", () => {
  const image = encodePng({ width: 4, height: 3, pixel: () => ({ r: 10, g: 20, b: 30 }) });

  it("writes a container a decoder will actually accept", () => {
    // Placeholder bytes would let storage, download and display all pass against something no
    // decoder opens, and the first real integration would be the first real test of any of it.
    expect(Array.from(image.slice(0, 8))).toEqual([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
    expect(ascii(image, 12, 4)).toBe("IHDR");
  });

  it("declares the size it was asked for", () => {
    expect(uint32(image, 16)).toBe(4);
    expect(uint32(image, 20)).toBe(3);
  });

  it("declares eight-bit truecolour, which is what it writes", () => {
    expect(image[24]).toBe(8);
    expect(image[25]).toBe(2);
  });

  it("ends with the terminating chunk, so the file is complete", () => {
    expect(ascii(image, image.length - 8, 4)).toBe("IEND");
  });

  it("is deterministic", () => {
    const again = encodePng({ width: 4, height: 3, pixel: () => ({ r: 10, g: 20, b: 30 }) });
    expect(Array.from(image)).toEqual(Array.from(again));
  });

  it("refuses a size that cannot make an image", () => {
    expect(() => encodePng({ width: 0, height: 10, pixel: () => ({ r: 0, g: 0, b: 0 }) })).toThrow();
    expect(() => encodePng({ width: 4.5, height: 10, pixel: () => ({ r: 0, g: 0, b: 0 }) })).toThrow();
  });

  it("handles an image large enough to need more than one block", () => {
    // Stored deflate blocks cap at 65535 bytes; a single-block encoder would corrupt anything
    // bigger and only fail on large images.
    const big = encodePng({ width: 200, height: 200, pixel: (x) => ({ r: x, g: 0, b: 0 }) });
    expect(ascii(big, big.length - 8, 4)).toBe("IEND");
    expect(big.length).toBeGreaterThan(65_535);
  });
});

describe("the placeholder provider", () => {
  const provider = new MockImageProvider();

  it("returns a real image, not invented bytes", async () => {
    const result = await provider.generateImage(request);
    expect(Array.from(result.bytes.slice(0, 4))).toEqual([0x89, 0x50, 0x4e, 0x47]);
    expect(result.mimeType).toBe("image/png");
  });

  it("can never be mistaken for a generated picture", async () => {
    expect((await provider.generateImage(request)).generatedBy).toBe("mock");
  });

  it("differs by prompt and repeats for the same one", async () => {
    const a = await provider.generateImage(request);
    const b = await provider.generateImage(request);
    const c = await provider.generateImage({ ...request, prompt: "Otra cosa completamente distinta" });
    expect(Array.from(a.bytes)).toEqual(Array.from(b.bytes));
    expect(Array.from(a.bytes)).not.toEqual(Array.from(c.bytes));
  });

  it("costs nothing and says so", () => {
    expect(provider.charges).toBe(false);
    expect(provider.costPerImageMicros).toBe(0);
  });
});

describe("the free provider", () => {
  it("asks for the size and seed it was given", async () => {
    const { provider, fetchImpl } = providerWith(png());
    await provider.generateImage(request);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("width")).toBe("1080");
    expect(url.searchParams.get("height")).toBe("1350");
    expect(url.searchParams.get("seed")).toBe("7");
  });

  it("keeps drafts out of the service's public feed", async () => {
    // These are unpublished drafts of somebody's brand work.
    const { provider, fetchImpl } = providerWith(png());
    await provider.generateImage(request);
    const url = new URL(fetchImpl.mock.calls[0][0]);
    expect(url.searchParams.get("private")).toBe("true");
    expect(url.searchParams.get("safe")).toBe("true");
  });

  it("does not claim the watermark is gone without a token to justify it", async () => {
    // Asking without one is ignored, and a caller that believed it would ship a watermark.
    const { provider, fetchImpl } = providerWith(png());
    await provider.generateImage(request);
    expect(new URL(fetchImpl.mock.calls[0][0]).searchParams.get("nologo")).toBeNull();

    const withToken = new PollinationsProvider({ token: "t", fetchImpl: providerWith(png()).fetchImpl as unknown as typeof fetch });
    expect(withToken.name).toBe("pollinations");
  });

  it("tells its own rate limit apart from a spending decision", async () => {
    // One is waiting; the other is a decision somebody made about money.
    const { provider } = providerWith(new Response(null, { status: 429 }));
    const error = await provider.generateImage(request).catch((thrown) => thrown);
    expect((error as MediaProviderError).reason).toBe("quota_exceeded");
    expect((error as MediaProviderError).retryable).toBe(true);
    expect((error as MediaProviderError).message).toMatch(/15 segundos/);
  });

  it("refuses a response that is not an image", async () => {
    // A service that answers with a web page has failed in a way the status code did not report,
    // and storing that page as an asset would be the real damage.
    const { provider } = providerWith(new Response("<html>oops</html>", { status: 200, headers: { "content-type": "text/html" } }));
    await expect(provider.generateImage(request)).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("refuses an empty body", async () => {
    const { provider } = providerWith(png(new Uint8Array()));
    await expect(provider.generateImage(request)).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("turns a network failure into a typed error", async () => {
    const { provider } = providerWith(new TypeError("fetch failed"));
    await expect(provider.generateImage(request)).rejects.toBeInstanceOf(MediaProviderError);
  });

  it("reports that it does not charge, which keeps it out of the ledger", () => {
    // A reservation for nothing is a row that makes reconciling against a bill harder, and that
    // is the only thing the ledger is for.
    expect(new PollinationsProvider().charges).toBe(false);
  });
});

describe("choosing an image provider", () => {
  it("uses the offline placeholder in demo", () => {
    expect(getImageProvider({}, true)).toBeInstanceOf(MockImageProvider);
  });

  it("uses the free service otherwise, with no configuration at all", () => {
    // It needs no account, so there is no state in which image generation is unavailable.
    expect(getImageProvider({}, false)).toBeInstanceOf(PollinationsProvider);
  });
});

describe("the request contract", () => {
  it("refuses a size no platform would use", () => {
    expect(imageRequestSchema.safeParse({ ...request, width: 10 }).success).toBe(false);
    expect(imageRequestSchema.safeParse({ ...request, height: 9_000 }).success).toBe(false);
  });

  it("requires something to draw", () => {
    expect(imageRequestSchema.safeParse({ ...request, prompt: "" }).success).toBe(false);
  });

  it("requires a seed, so a regeneration is comparable rather than a lottery", () => {
    expect(imageRequestSchema.safeParse({ prompt: "x", width: 512, height: 512 }).success).toBe(false);
  });
});
