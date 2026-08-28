import { describe, expect, it } from "vitest";
import {
  buildMusicBrief,
  clampMusicSeconds,
  clampSfxSeconds,
  MUSIC_MAX_SECONDS,
  MUSIC_MIN_SECONDS,
  scriptSeconds,
} from "@/server/media/soundtrack";
import { estimateCost } from "@/server/spend/pricing";
import { getAdapter } from "@/server/content/adapters";
import type { ContentConcept } from "@/server/content/schemas/concept";

const brand = {
  name: "Spectro", toneOfVoice: "Claro", personality: [], preferredWords: [], forbiddenWords: [],
  forbiddenClaims: [], informalityCeiling: "conversational" as const, visualInstructions: "",
};
const concept: ContentConcept = {
  conceptId: "C1", title: "T", internalName: "t", pillar: "Educacion", angle: "A", objective: "educational",
  audience: { persona: "P", problem: "Pr.", promise: "Pm." }, coreIdea: "Idea.",
  hookDirection: { preferredTypes: ["problem"] }, format: "short_video",
  platforms: ["tiktok"], cta: "save", evidenceRequired: [], creativeNotes: [],
};
const draft = (platform: "tiktok" | "instagram" | "linkedin", format: ContentConcept["format"]) =>
  getAdapter(platform).draft({
    concept: { ...concept, format, platforms: [platform] },
    brand,
    campaign: { campaignId: "c", name: "n", objective: "awareness" },
  });

const video = draft("tiktok", "short_video");
const TONES = ["reflexiva", "entusiasta", "comercial", "cercana", "autoritaria", "informativa"] as const;

describe("what gets scored", () => {
  it("has no soundtrack for a piece read in silence", () => {
    // A carousel is read by whoever is scrolling it. Scoring it would be producing something
    // nobody asked for and charging for it, the same reason it gets no voiceover.
    expect(buildMusicBrief(draft("instagram", "carousel"), "cercana", "Educacion")).toBeNull();
    expect(buildMusicBrief(draft("linkedin", "text_post"), "cercana", "Educacion")).toBeNull();
  });

  it("scores a video from its own script length", () => {
    const brief = buildMusicBrief(video, "cercana", "Educacion");
    expect(brief?.seconds).toBe(clampMusicSeconds(scriptSeconds(video)!));
  });

  it("always asks for instrumental", () => {
    // A voiceover and a vocal track compete for the same attention, and a piece with both is a
    // piece where neither is heard.
    for (const tone of TONES) {
      const brief = buildMusicBrief(video, tone, "Educacion")!;
      expect(brief.instrumental, tone).toBe(true);
      expect(brief.prompt.toLowerCase(), tone).toContain("sin voces");
    }
  });

  it("describes each tone differently, so the choice is not decorative", () => {
    const prompts = TONES.map((tone) => buildMusicBrief(video, tone, "Educacion")!.prompt);
    expect(new Set(prompts).size).toBe(prompts.length);
  });

  it("says what the piece is about rather than asking for generic music", () => {
    expect(buildMusicBrief(video, "cercana", "Educacion")!.prompt).toContain("educacion");
  });

  it("survives a piece with no pillar recorded", () => {
    expect(buildMusicBrief(video, "cercana", "")).not.toBeNull();
  });

  it("is deterministic, so the same piece always costs the same", () => {
    expect(buildMusicBrief(video, "comercial", "Educacion")).toEqual(buildMusicBrief(video, "comercial", "Educacion"));
  });

  it("prefers the voiceover's real length over the script's intention", () => {
    // The voice is a fact and the script is an intention; music that ends before the narration
    // is worse than music that was never made.
    expect(buildMusicBrief(video, "cercana", "Educacion", 41.6)?.seconds).toBe(42);
  });

  it("ignores a nonsensical voiceover length rather than trusting it", () => {
    const scripted = clampMusicSeconds(scriptSeconds(video)!);
    expect(buildMusicBrief(video, "cercana", "Educacion", 0)?.seconds).toBe(scripted);
    expect(buildMusicBrief(video, "cercana", "Educacion", -3)?.seconds).toBe(scripted);
  });
});

describe("staying inside what the vendor accepts", () => {
  it("clamps to the documented music range", () => {
    expect(clampMusicSeconds(1)).toBe(MUSIC_MIN_SECONDS);
    expect(clampMusicSeconds(10_000)).toBe(MUSIC_MAX_SECONDS);
    expect(clampMusicSeconds(45)).toBe(45);
  });

  it("clamps to the documented sound effect range", () => {
    expect(clampSfxSeconds(0)).toBe(0.5);
    expect(clampSfxSeconds(90)).toBe(30);
  });

  it("refuses nonsense rather than sending it", () => {
    // A rejected call still costs a round trip, and a silently shortened one leaves the piece
    // with a track that ends before the script it was written for.
    expect(clampMusicSeconds(Number.NaN)).toBe(MUSIC_MIN_SECONDS);
    expect(clampMusicSeconds(-5)).toBe(MUSIC_MIN_SECONDS);
  });

  it("never asks for a length the vendor would refuse", () => {
    for (const tone of TONES) {
      const brief = buildMusicBrief(video, tone, "Educacion", 99_999)!;
      expect(brief.seconds).toBeGreaterThanOrEqual(MUSIC_MIN_SECONDS);
      expect(brief.seconds).toBeLessThanOrEqual(MUSIC_MAX_SECONDS);
    }
  });

  it("is charged by the seconds requested, which is what is sent", () => {
    const brief = buildMusicBrief(video, "cercana", "Educacion")!;
    const rates = { ttsPerCharacterMicros: 0, sfxPerSecondMicros: 0, musicPerSecondMicros: 1_000, minimumChargeMicros: 0 };
    expect(estimateCost({ operation: "media.music", seconds: brief.seconds }, rates)).toBe(brief.seconds * 1_000);
  });
});
