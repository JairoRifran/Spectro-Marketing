import { describe, expect, it } from "vitest";
import { fitToDuration, frameAt, intendedTimings, startTimes } from "@/server/media/timing";
import { composeFrames } from "@/server/media/compose";
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
const variant = getAdapter("tiktok").draft({ concept, brand, campaign: { campaignId: "c", name: "n", objective: "awareness" } });
const frames = composeFrames(variant);
const timings = intendedTimings(variant, frames);

describe("pacing", () => {
  it("gives every composed frame a time on screen", () => {
    expect(timings).toHaveLength(frames.length);
    for (const timing of timings) expect(timing.seconds).toBeGreaterThan(0);
  });

  it("takes each scene's own duration from the script", () => {
    if (variant.detail.shape !== "video") throw new Error("expected a video");
    for (const timing of timings) {
      if (timing.key === "cover") continue;
      const index = Number(timing.key.replace("scene-", ""));
      expect(timing.seconds).toBe(variant.detail.script.scenes[index].durationSeconds);
    }
  });

  it("holds the cover long enough to read and not long enough to stall", () => {
    // The opening frame decides whether anything else is watched; a still that lingers is how a
    // viewer leaves.
    const cover = timings.find((timing) => timing.key === "cover")!;
    expect(cover.seconds).toBeGreaterThanOrEqual(1.5);
    expect(cover.seconds).toBeLessThanOrEqual(4);
  });
});

describe("fitting the pacing to real audio", () => {
  const sample = [
    { key: "a", seconds: 2 },
    { key: "b", seconds: 6 },
    { key: "c", seconds: 2 },
  ];

  it("matches the audio's length exactly", () => {
    const fitted = fitToDuration(sample, 20);
    expect(fitted.reduce((sum, timing) => sum + timing.seconds, 0)).toBeCloseTo(20, 6);
  });

  it("keeps every frame's share rather than padding the last one", () => {
    // Adding the difference to the end would leave a still hanging after the voice has finished;
    // trimming only the end would cut a beat the script gave time to.
    const fitted = fitToDuration(sample, 20);
    expect(fitted[1].seconds / fitted[0].seconds).toBeCloseTo(3, 6);
  });

  it("compresses as readily as it stretches", () => {
    const fitted = fitToDuration(sample, 5);
    expect(fitted.reduce((sum, timing) => sum + timing.seconds, 0)).toBeCloseTo(5, 6);
  });

  it("leaves the script's own pacing alone when there is no audio", () => {
    expect(fitToDuration(sample, null)).toEqual(sample);
    expect(fitToDuration(sample, 0)).toEqual(sample);
  });

  it("falls back to even beats rather than dividing by zero", () => {
    const zeroed = [{ key: "a", seconds: 0 }, { key: "b", seconds: 0 }];
    const fitted = fitToDuration(zeroed, 10);
    expect(fitted.map((timing) => timing.seconds)).toEqual([5, 5]);
  });
});

describe("which frame is showing", () => {
  const sample = [
    { key: "a", seconds: 2 },
    { key: "b", seconds: 3 },
    { key: "c", seconds: 1 },
  ];

  it("starts on the first frame", () => {
    expect(frameAt(sample, 0)).toBe(0);
  });

  it("advances exactly at each boundary", () => {
    expect(startTimes(sample)).toEqual([0, 2, 5]);
    expect(frameAt(sample, 1.99)).toBe(0);
    expect(frameAt(sample, 2)).toBe(1);
    expect(frameAt(sample, 4.99)).toBe(1);
    expect(frameAt(sample, 5)).toBe(2);
  });

  it("holds the last frame past the end instead of going blank", () => {
    expect(frameAt(sample, 99)).toBe(2);
  });

  it("has nothing to show for an empty sequence", () => {
    expect(frameAt([], 1)).toBe(-1);
  });
});
