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
    const body = JSON.stringify({ detail: `rejected key ${KEY} for text ${request.text}` });
    const { provider } = providerWith(new Response(body, { status: 401 }));
    const error = await provider.synthesizeSpeech(request).catch((thrown) => thrown);
    expect(error.message).not.toContain(KEY);
    expect(error.message).not.toContain(request.text);
    expect(error.message).toContain("[oculto]");
  });

  it("still says why the vendor refused, so it can be acted on", async () => {
    // "Responded 400" cannot be acted on. Whether the key is wrong or merely lacks permission to
    // read voices is exactly what the person fixing it needs to know.
    const body = JSON.stringify({ detail: { status: "missing_permissions", message: "The API key is missing the permission voices_read." } });
    const { provider } = providerWith(new Response(body, { status: 400 }));
    const error = await provider.listVoices!().catch((thrown) => thrown);
    expect(error.message).toContain("400");
    expect(error.message).toContain("missing_permissions");
  });

  it("does not let a huge vendor body become the error message", async () => {
    const { provider } = providerWith(new Response("x".repeat(5_000), { status: 400 }));
    const error = await provider.listVoices!().catch((thrown) => thrown);
    expect(error.message.length).toBeLessThan(400);
  });

  it("refuses to construct without a key, instead of calling with an empty credential", () => {
    expect(() => new ElevenLabsProvider({ apiKey: "" })).toThrow(MediaProviderError);
  });
});

describe("listing the account's voices", () => {
  const listing = (voices: unknown) => new Response(JSON.stringify({ voices }), { status: 200, headers: { "content-type": "application/json" } });

  it("reads the vendor's labels through untouched, as hints", async () => {
    // Reading "accent: latin american" as a region would put a Mexican voice on a Rioplatense
    // brand on a guess, so nothing here is interpreted.
    const { provider } = providerWith(listing([{ voice_id: "v1", name: "Sofia", labels: { accent: "latin american", gender: "female" } }]));
    const [voice] = await provider.listVoices!();
    expect(voice.labels).toEqual({ accent: "latin american", gender: "female" });
    expect(voice).not.toHaveProperty("region");
  });

  it("drops a voice with no identifier rather than offering a dead option", async () => {
    const { provider } = providerWith(listing([{ name: "sin id" }, { voice_id: "v2", name: "Diego" }]));
    const voices = await provider.listVoices!();
    expect(voices.map((voice) => voice.providerVoiceId)).toEqual(["v2"]);
  });

  it("falls back to the identifier when a voice has no name", async () => {
    const { provider } = providerWith(listing([{ voice_id: "v3" }]));
    expect((await provider.listVoices!())[0].name).toBe("v3");
  });

  it("treats an unreadable payload as a failure, not as an empty account", async () => {
    const { provider } = providerWith(new Response("no soy json", { status: 200 }));
    await expect(provider.listVoices!()).rejects.toMatchObject({ reason: "unavailable" });
  });

  it("survives labels that are not strings", async () => {
    const { provider } = providerWith(listing([{ voice_id: "v4", name: "X", labels: { accent: "neutral", age: 42 } }]));
    expect((await provider.listVoices!())[0].labels).toEqual({ accent: "neutral" });
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
