import { describe, expect, it, vi } from "vitest";
import { ElevenLabsProvider } from "@/server/media/elevenlabs-provider";
import { MockMediaProvider } from "@/server/media/mock-provider";
import { MediaProviderError } from "@/server/media/provider";
import { getMediaProvider, isRealMediaProviderConfigured } from "@/server/media/providers";

const KEY = "clave-secreta-de-prueba";
const request = { text: "Antes de automatizar, describí la tarea.", voiceId: "voz-1", language: "es-UY" };

function providerWith(response: Response | Error) {
  const fetchImpl = vi.fn(async () => {
    if (response instanceof Error) throw response;
    return response;
  }) as unknown as typeof fetch;
  return {
    provider: new ElevenLabsProvider({ apiKey: KEY, fetchImpl }),
    fetchImpl: fetchImpl as unknown as ReturnType<typeof vi.fn>,
  };
}

const audio = (bytes = new Uint8Array([1, 2, 3, 4]), init: ResponseInit = {}) =>
  new Response(bytes as unknown as BodyInit, { status: 200, headers: { "content-type": "audio/mpeg" }, ...init });

describe("the request it sends", () => {
  it("posts to the endpoint for the voice the request carries, not a fixed one", async () => {
    const { provider, fetchImpl } = providerWith(audio());
    await provider.synthesizeSpeech(request);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe("https://api.elevenlabs.io/v1/text-to-speech/voz-1");
    expect(init.method).toBe("POST");
  });

  it("authenticates with the header the vendor documents", async () => {
    const { provider, fetchImpl } = providerWith(audio());
    await provider.synthesizeSpeech(request);
    expect(fetchImpl.mock.calls[0][1].headers["xi-api-key"]).toBe(KEY);
  });

  it("sends the exact text it will be billed for", async () => {
    const { provider, fetchImpl } = providerWith(audio());
    await provider.synthesizeSpeech(request);
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body);
    expect(body.text).toBe(request.text);
    expect(provider.billedCharacters(request)).toBe([...request.text].length);
  });

  it("gives up rather than holding a function open on a hung vendor", async () => {
    const { provider, fetchImpl } = providerWith(audio());
    await provider.synthesizeSpeech(request);
    expect(fetchImpl.mock.calls[0][1].signal).toBeInstanceOf(AbortSignal);
  });
});

describe("what it reports back", () => {
  it("marks the output as real provider output", async () => {
    const { provider } = providerWith(audio());
    expect((await provider.synthesizeSpeech(request)).generatedBy).toBe("provider");
  });

  it("reports no cost, because the vendor publishes no usage header", async () => {
    // Settling with an invented number would put a fiction in a ledger meant to match an invoice.
    const { provider } = providerWith(audio());
    expect((await provider.synthesizeSpeech(request)).costMicros).toBeUndefined();
  });

  it("reports no duration rather than guessing at compressed audio", async () => {
    const { provider } = providerWith(audio());
    expect((await provider.synthesizeSpeech(request)).durationSeconds).toBeUndefined();
  });

  it("treats an empty body as a failure, not as silent audio", async () => {
    const { provider } = providerWith(audio(new Uint8Array()));
    await expect(provider.synthesizeSpeech(request)).rejects.toMatchObject({ reason: "unavailable" });
  });
});

describe("how failures are classified", () => {
  const cases: Array<[number, string, boolean]> = [
    [429, "quota_exceeded", true],
    [401, "rejected", false],
    [403, "rejected", false],
    [422, "rejected", false],
    [400, "rejected", false],
    [500, "unavailable", true],
    [503, "unavailable", true],
  ];

  for (const [status, reason, retryable] of cases) {
    it(`maps ${status} to ${reason}`, async () => {
      const { provider } = providerWith(new Response(null, { status }));
      const error = await provider.synthesizeSpeech(request).catch((thrown) => thrown);
      expect(error).toBeInstanceOf(MediaProviderError);
      expect((error as MediaProviderError).reason).toBe(reason);
      expect((error as MediaProviderError).retryable).toBe(retryable);
    });
  }

  it("treats an unrecognised status as retryable rather than fatal", async () => {
    // Getting this backwards either retries what can never succeed, or abandons what would have.
    const { provider } = providerWith(new Response(null, { status: 418 }));
    const error = await provider.synthesizeSpeech(request).catch((thrown) => thrown);
    expect((error as MediaProviderError).retryable).toBe(true);
  });

  it("turns a network failure into a typed error", async () => {
    const { provider } = providerWith(new TypeError("fetch failed"));
    await expect(provider.synthesizeSpeech(request)).rejects.toBeInstanceOf(MediaProviderError);
  });
});

describe("the credential never leaks", () => {
  it("keeps the key out of a network failure", async () => {
    // The caught error can carry the request, and the request carries the key.
    const { provider } = providerWith(new TypeError(`fetch failed for key ${KEY}`));
    const error = await provider.synthesizeSpeech(request).catch((thrown) => thrown);
    expect(JSON.stringify({ message: error.message, stack: error.stack })).not.toContain(KEY);
  });

  it("keeps the key and the script out of a vendor rejection", async () => {
    const { provider } = providerWith(new Response("bad key", { status: 401 }));
    const error = await provider.synthesizeSpeech(request).catch((thrown) => thrown);
    expect(error.message).not.toContain(KEY);
    expect(error.message).not.toContain(request.text);
  });

  it("refuses to construct without a key, instead of calling with an empty credential", () => {
    expect(() => new ElevenLabsProvider({ apiKey: "" })).toThrow(MediaProviderError);
  });
});

describe("choosing a provider", () => {
  it("uses the mock when nothing is configured", () => {
    expect(getMediaProvider({})).toBeInstanceOf(MockMediaProvider);
  });

  it("is not fooled by whitespace standing in for a key", () => {
    expect(isRealMediaProviderConfigured({ ELEVENLABS_API_KEY: "  " })).toBe(false);
    expect(getMediaProvider({ ELEVENLABS_API_KEY: "  " })).toBeInstanceOf(MockMediaProvider);
  });

  it("uses the real provider once the key is set", () => {
    // The voice is not part of this decision: it belongs to the brand and travels per request.
    const provider = getMediaProvider({ ELEVENLABS_API_KEY: KEY });
    expect(provider).toBeInstanceOf(ElevenLabsProvider);
    expect(provider.name).toBe("elevenlabs");
  });
});
