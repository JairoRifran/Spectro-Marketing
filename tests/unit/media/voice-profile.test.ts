import { describe, expect, it, vi } from "vitest";
import { ElevenLabsProvider } from "@/server/media/elevenlabs-provider";
import {
  deliveryFor,
  deliverySchema,
  REGION_LABEL,
  selectVoice,
  TONE_LABEL,
  voiceProfileSchema,
  voiceRegionSchema,
  voiceToneSchema,
  type CatalogueVoice,
} from "@/server/media/voice-profile";

const voice = (region: CatalogueVoice["region"], gender: CatalogueVoice["gender"], id: string): CatalogueVoice =>
  ({ providerVoiceId: id, region, gender, label: id });

describe("the vocabulary an organization chooses from", () => {
  it("describes delivery, not a vendor's fields under different names", () => {
    // A neutral wrapper over one vendor's parameters is lock-in wearing a neutral label.
    const keys = Object.keys(deliverySchema.shape);
    expect(keys).toEqual(["expressiveness", "intensity", "pace"]);
    expect(keys).not.toContain("stability");
    expect(keys).not.toContain("similarity_boost");
  });

  it("gives every tone a delivery, so no choice is silently inert", () => {
    for (const tone of voiceToneSchema.options) {
      expect(() => deliverySchema.parse(deliveryFor(tone)), tone).not.toThrow();
    }
  });

  it("makes the tones actually differ from one another", () => {
    const fingerprints = voiceToneSchema.options.map((tone) => JSON.stringify(deliveryFor(tone)));
    expect(new Set(fingerprints).size).toBe(voiceToneSchema.options.length);
  });

  it("reads reflexiva as calmer and slower than entusiasta", () => {
    const calm = deliveryFor("reflexiva");
    const eager = deliveryFor("entusiasta");
    expect(calm.expressiveness).toBeLessThan(eager.expressiveness);
    expect(calm.pace).toBeLessThan(eager.pace);
  });

  it("avoids the caricatured extremes at either end", () => {
    // A fully flat read sounds synthetic and a fully exaggerated one sounds like a parody.
    for (const tone of voiceToneSchema.options) {
      const delivery = deliveryFor(tone);
      expect(delivery.expressiveness).toBeGreaterThan(0);
      expect(delivery.expressiveness).toBeLessThan(1);
      expect(delivery.intensity).toBeLessThan(0.9);
    }
  });

  it("explains every tone and region in words, not codes", () => {
    for (const tone of voiceToneSchema.options) {
      expect(TONE_LABEL[tone], tone).toMatch(/—/);
      expect(TONE_LABEL[tone].length).toBeGreaterThan(20);
    }
    for (const region of voiceRegionSchema.options) expect(REGION_LABEL[region], region).toBeTruthy();
  });

  it("does not require a gender to be stated", () => {
    expect(voiceProfileSchema.parse({ tone: "cercana", region: "rioplatense" }).gender).toBe("indistinta");
  });
});

describe("choosing a voice for a profile", () => {
  const catalogue = [
    voice("rioplatense", "femenina", "rp-f"),
    voice("rioplatense", "masculina", "rp-m"),
    voice("castellana", "femenina", "es-f"),
  ];

  it("picks a voice from the region that was asked for", () => {
    expect(selectVoice({ tone: "cercana", region: "castellana", gender: "indistinta" }, catalogue)?.providerVoiceId).toBe("es-f");
  });

  it("honours gender when it was stated", () => {
    expect(selectVoice({ tone: "cercana", region: "rioplatense", gender: "masculina" }, catalogue)?.providerVoiceId).toBe("rp-m");
  });

  it("accepts any voice when gender genuinely does not matter", () => {
    expect(selectVoice({ tone: "cercana", region: "rioplatense", gender: "indistinta" }, catalogue)).not.toBeNull();
  });

  it("returns nothing rather than substituting another accent", () => {
    // Falling back would ship a Castilian read for a brand that asked for Rioplatense, and
    // nobody would find out until it was published.
    expect(selectVoice({ tone: "cercana", region: "mexicana", gender: "indistinta" }, catalogue)).toBeNull();
  });

  it("returns nothing rather than substituting another gender", () => {
    expect(selectVoice({ tone: "cercana", region: "castellana", gender: "masculina" }, catalogue)).toBeNull();
  });

  it("returns nothing when the organization has no voices at all", () => {
    expect(selectVoice({ tone: "cercana", region: "rioplatense", gender: "indistinta" }, [])).toBeNull();
  });
});

describe("translating delivery for the vendor", () => {
  async function settingsSentFor(tone: Parameters<typeof deliveryFor>[0]) {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1]) as unknown as BodyInit, { status: 200 }));
    const provider = new ElevenLabsProvider({ apiKey: "k", voiceId: "v", fetchImpl: fetchImpl as unknown as typeof fetch });
    await provider.synthesizeSpeech({ text: "hola", voiceId: "v", language: "es-UY", delivery: deliveryFor(tone) });
    return JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
  }

  it("inverts stability, because the vendor's high value means monotonous", () => {
    // Passing expressiveness straight through would make every enthusiastic read flat.
    return Promise.all([settingsSentFor("reflexiva"), settingsSentFor("entusiasta")]).then(([calm, eager]) => {
      expect(calm.voice_settings.stability).toBeGreaterThan(eager.voice_settings.stability);
    });
  });

  it("keeps every setting inside the range the vendor documents", async () => {
    for (const tone of voiceToneSchema.options) {
      const body = await settingsSentFor(tone);
      const settings = body.voice_settings;
      expect(settings.stability, tone).toBeGreaterThanOrEqual(0);
      expect(settings.stability, tone).toBeLessThanOrEqual(1);
      expect(settings.style, tone).toBeGreaterThanOrEqual(0);
      expect(settings.similarity_boost, tone).toBeLessThanOrEqual(1);
    }
  });

  it("never sends a stability low enough to be erratic", () => {
    return settingsSentFor("entusiasta").then((body) => {
      expect(body.voice_settings.stability).toBeGreaterThanOrEqual(0.25);
    });
  });

  it("stops sending language_code, which this model ignores", async () => {
    // A field the vendor documents as silently dropped only suggests it does something.
    const body = await settingsSentFor("cercana");
    expect(body.language_code).toBeUndefined();
  });

  it("sends no settings at all when no delivery was asked for", async () => {
    const fetchImpl = vi.fn(async () => new Response(new Uint8Array([1]) as unknown as BodyInit, { status: 200 }));
    const provider = new ElevenLabsProvider({ apiKey: "k", voiceId: "v", fetchImpl: fetchImpl as unknown as typeof fetch });
    await provider.synthesizeSpeech({ text: "hola", voiceId: "v", language: "es-UY" });
    const body = JSON.parse((fetchImpl.mock.calls[0] as unknown as [string, RequestInit])[1].body as string);
    expect(body.voice_settings).toBeUndefined();
  });
});
