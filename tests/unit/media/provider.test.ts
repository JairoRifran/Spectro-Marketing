import { describe, expect, it } from "vitest";
import { MockMediaProvider } from "@/server/media/mock-provider";
import { MediaProviderError, speechRequestSchema } from "@/server/media/provider";
import { encodeWav, SAMPLE_RATE } from "@/server/media/wav";
import { estimateCost } from "@/server/spend/pricing";

const provider = new MockMediaProvider();
const request = { text: "Antes de automatizar, describí la tarea.", voiceId: "voz-principal", language: "es-UY" };

const ascii = (bytes: Uint8Array, offset: number, length: number) =>
  String.fromCharCode(...bytes.slice(offset, offset + length));
const uint32 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer).getUint32(offset, true);
const uint16 = (bytes: Uint8Array, offset: number) => new DataView(bytes.buffer).getUint16(offset, true);

describe("wav encoding", () => {
  const wav = encodeWav({ samples: new Int16Array([0, 1000, -1000, 0]) });

  it("writes a container an audio decoder will actually accept", () => {
    // Placeholder bytes would let storage, download and playback all pass against something no
    // decoder opens, and the first real integration would be the first real test of any of it.
    expect(ascii(wav, 0, 4)).toBe("RIFF");
    expect(ascii(wav, 8, 4)).toBe("WAVE");
    expect(ascii(wav, 12, 4)).toBe("fmt ");
    expect(ascii(wav, 36, 4)).toBe("data");
  });

  it("declares sizes that match the bytes it actually contains", () => {
    // A header that disagrees with the payload is the classic way a file plays in one program
    // and is silently truncated in another.
    expect(uint32(wav, 4)).toBe(wav.length - 8);
    expect(uint32(wav, 40)).toBe(wav.length - 44);
  });

  it("declares uncompressed mono PCM, which is what it writes", () => {
    expect(uint16(wav, 20)).toBe(1);
    expect(uint16(wav, 22)).toBe(1);
    expect(uint16(wav, 34)).toBe(16);
    expect(uint32(wav, 24)).toBe(SAMPLE_RATE);
  });

  it("keeps the byte rate consistent with the format it declared", () => {
    expect(uint32(wav, 28)).toBe(SAMPLE_RATE * 2);
    expect(uint16(wav, 32)).toBe(2);
  });

  it("round-trips the samples it was given", () => {
    const view = new DataView(wav.buffer);
    expect([view.getInt16(44, true), view.getInt16(46, true), view.getInt16(48, true)]).toEqual([0, 1000, -1000]);
  });
});

describe("the mock provider", () => {
  it("returns audio that plays, not invented bytes", async () => {
    const result = await provider.synthesizeSpeech(request);
    expect(ascii(result.bytes, 0, 4)).toBe("RIFF");
    expect(result.mimeType).toBe("audio/wav");
    expect(result.durationSeconds).toBeGreaterThan(0);
  });

  it("can never be mistaken for real provider output", async () => {
    const result = await provider.synthesizeSpeech(request);
    expect(result.generatedBy).toBe("mock");
    expect(provider.name).toBe("mock");
  });

  it("is deterministic: the same script always produces the same bytes", async () => {
    const first = await provider.synthesizeSpeech(request);
    const second = await provider.synthesizeSpeech(request);
    expect(Array.from(first.bytes)).toEqual(Array.from(second.bytes));
  });

  it("produces audibly different files for different scripts", async () => {
    const one = await provider.synthesizeSpeech(request);
    const two = await provider.synthesizeSpeech({ ...request, text: "Otro guion completamente distinto." });
    expect(Array.from(one.bytes)).not.toEqual(Array.from(two.bytes));
  });

  it("reports costing nothing rather than leaving the caller to assume the estimate", async () => {
    expect((await provider.synthesizeSpeech(request)).costMicros).toBe(0);
  });

  it("rejects a request it should never have been sent, as a typed error", async () => {
    await expect(provider.synthesizeSpeech({ ...request, text: "" })).rejects.toBeInstanceOf(MediaProviderError);
    await expect(provider.synthesizeSpeech({ ...request, text: "" })).rejects.toMatchObject({ reason: "invalid_request" });
  });

  it("does not treat a bug on this side as worth retrying", async () => {
    const error = await provider.synthesizeSpeech({ ...request, voiceId: "" }).catch((thrown) => thrown);
    expect(error).toBeInstanceOf(MediaProviderError);
    expect((error as MediaProviderError).retryable).toBe(false);
  });
});

describe("billing agrees with what is sent", () => {
  it("counts the exact string the vendor will charge for", () => {
    // Estimating from the script and then sending something longer is how a ceiling is
    // quietly exceeded: the check passes against a number unrelated to the invoice.
    expect(provider.billedCharacters(request)).toBe([...request.text].length);
  });

  it("counts a character, not a UTF-16 code unit", () => {
    expect(provider.billedCharacters({ ...request, text: "ñ👋" })).toBe(2);
  });

  it("lines up with what the ceiling is checked against", () => {
    const characters = provider.billedCharacters(request);
    const rates = { ttsPerCharacterMicros: 10, minimumChargeMicros: 0 };
    expect(estimateCost({ operation: "media.tts", text: request.text }, rates)).toBe(characters * 10);
  });
});

describe("the request contract", () => {
  it("requires a voice chosen by the operator, never a vendor default", () => {
    expect(speechRequestSchema.safeParse({ ...request, voiceId: "" }).success).toBe(false);
  });

  it("defaults the language rather than leaving a provider to guess from the text", () => {
    const parsed = speechRequestSchema.parse({ text: "hola", voiceId: "v" });
    expect(parsed.language).toBe("es-UY");
  });

  it("refuses a script long enough to be an accident", () => {
    expect(speechRequestSchema.safeParse({ ...request, text: "x".repeat(5_001) }).success).toBe(false);
  });
});
