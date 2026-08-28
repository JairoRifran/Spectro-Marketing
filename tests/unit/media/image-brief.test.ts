import { describe, expect, it } from "vitest";
import { buildImageRequest } from "@/server/media/image-brief";
import { composeFrames } from "@/server/media/compose";
import { canvasFor } from "@/server/media/canvas";
import { imageRequestSchema } from "@/server/media/image-provider";
import { getAdapter } from "@/server/content/adapters";
import type { ContentConcept } from "@/server/content/schemas/concept";

const brand = {
  name: "Spectro", toneOfVoice: "Claro", personality: [], preferredWords: [], forbiddenWords: [],
  forbiddenClaims: [], informalityCeiling: "conversational" as const, visualInstructions: "",
};
const concept: ContentConcept = {
  conceptId: "C1", title: "T", internalName: "t", pillar: "Educacion", angle: "A", objective: "educational",
  audience: { persona: "P", problem: "Pr.", promise: "Pm." }, coreIdea: "Idea.",
  hookDirection: { preferredTypes: ["problem"] }, format: "carousel",
  platforms: ["instagram"], cta: "save", evidenceRequired: [], creativeNotes: [],
};
const draft = (platform: "instagram" | "tiktok", format: ContentConcept["format"]) =>
  getAdapter(platform).draft({ concept: { ...concept, format, platforms: [platform] }, brand, campaign: { campaignId: "c", name: "n", objective: "awareness" } });

const carousel = draft("instagram", "carousel");
const video = draft("tiktok", "short_video");

describe("what to draw", () => {
  it("builds a valid request for every frame the composition produces", () => {
    for (const variant of [carousel, video]) {
      for (const frame of composeFrames(variant)) {
        const request = buildImageRequest(variant, frame.key);
        if (!request) continue;
        expect(() => imageRequestSchema.parse(request), frame.key).not.toThrow();
      }
    }
  });

  it("takes the direction the piece already wrote rather than inventing a subject", () => {
    if (carousel.detail.shape !== "carousel") throw new Error("expected a carousel");
    const request = buildImageRequest(carousel, "slide-0")!;
    expect(request.prompt).toContain(carousel.detail.carousel.cover.visualNote);
  });

  it("forbids text in the picture", () => {
    // The typography is composed on top at delivery size. A picture that already contains words
    // produces a frame with two headlines, one of them misspelled.
    const request = buildImageRequest(carousel, "slide-0")!;
    expect(request.prompt.toLowerCase()).toContain("sin texto");
    expect(request.prompt.toLowerCase()).toContain("sin logos");
  });

  it("asks for room where the headline goes", () => {
    // A subject centred under the composed title is a subject wearing a caption.
    expect(buildImageRequest(carousel, "slide-0")!.prompt.toLowerCase()).toContain("espacio libre");
  });

  it("asks at the frame's own delivery proportions", () => {
    // A square picture cropped into a 9:16 frame loses the half the direction was written about.
    const canvas = canvasFor(video.platform, video.format);
    const request = buildImageRequest(video, "cover")!;
    expect(request.width).toBe(canvas.width);
    expect(request.height).toBe(canvas.height);
  });

  it("gives different frames different pictures, and the same frame the same one", () => {
    const first = buildImageRequest(carousel, "slide-0")!;
    const second = buildImageRequest(carousel, "slide-1")!;
    expect(first.seed).not.toBe(second.seed);
    expect(buildImageRequest(carousel, "slide-0")!.seed).toBe(first.seed);
  });

  it("includes the brand's own visual instructions when there are any", () => {
    const request = buildImageRequest(carousel, "slide-0", "Paleta fria, fotografia documental")!;
    expect(request.prompt).toContain("Paleta fria");
  });

  it("asks for nothing when the piece never said what to draw", () => {
    // Inventing a subject would put an image on a brand's channel that nobody chose, and a
    // designed surface with no photograph is a perfectly good frame.
    const blank = {
      ...carousel,
      visualDirection: "",
      detail: {
        shape: "carousel" as const,
        carousel: {
          cover: { headline: "h", visualNote: "" },
          slides: [{ headline: "h", visualNote: "" }],
          ctaSlide: { headline: "h", visualNote: "" },
          caption: "c",
          visualDirection: "",
        },
      },
    };
    expect(buildImageRequest(blank, "slide-0")).toBeNull();
  });

  it("never exceeds the prompt length the contract allows", () => {
    const request = buildImageRequest(carousel, "slide-0", "x".repeat(3_000))!;
    expect(request.prompt.length).toBeLessThanOrEqual(1_000);
  });
});

describe("the frame reserves a place for it", () => {
  it("gives every frame an image slot matching its own key", () => {
    for (const frame of composeFrames(carousel)) {
      const picture = frame.blocks.find((block) => block.kind === "image");
      expect(picture, frame.key).toBeDefined();
      if (picture?.kind === "image") expect(picture.slot).toBe(frame.key);
    }
  });

  it("veils the picture but not the designed surface behind it", () => {
    // Veiling the fallback as well would dim every frame that has no artwork, which is most.
    for (const frame of composeFrames(carousel)) {
      const picture = frame.blocks.find((block) => block.kind === "image");
      if (picture?.kind !== "image") continue;
      expect(picture.veil).toBeGreaterThan(0);
      expect(picture.fallback).toEqual(frame.background);
    }
  });

  it("covers the whole frame, so no edge is left unpainted", () => {
    for (const frame of composeFrames(video)) {
      const picture = frame.blocks.find((block) => block.kind === "image");
      if (picture?.kind !== "image") continue;
      expect(picture.width).toBe(frame.width);
      expect(picture.height).toBe(frame.height);
    }
  });
});
