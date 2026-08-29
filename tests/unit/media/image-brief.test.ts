import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildImageRequest, looksLikeProductionNote } from "@/server/media/image-brief";
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
  conceptId: "C1", title: "T", internalName: "t", pillar: "Educacion", angle: "Marketing con continuidad", objective: "educational",
  audience: { persona: "Responsable de marketing en una PyME B2B", problem: "Pr.", promise: "Pm." }, coreIdea: "Idea.",
  hookDirection: { preferredTypes: ["problem"] }, format: "carousel",
  platforms: ["instagram"], cta: "save", evidenceRequired: [], creativeNotes: [],
};
const draft = (platform: "instagram" | "tiktok", format: ContentConcept["format"]) =>
  getAdapter(platform).draft({ concept: { ...concept, format, platforms: [platform] }, brand, campaign: { campaignId: "c", name: "n", objective: "awareness" } });

const carousel = draft("instagram", "carousel");
const video = draft("tiktok", "short_video");
const context = { pillar: "Educacion", angle: "Marketing con continuidad", audience: "Responsable de marketing en una PyME B2B" };

describe("telling a subject from a production note", () => {
  it("recognises a note about how the frame is built", () => {
    // "Cover legible at 160 px" says nothing about what is in the picture. Sending it as the
    // subject is what produced a swimwear model on a B2B marketing carousel.
    for (const note of ["Portada legible a 160 px", "Tipografia de alto contraste", "Encuadre vertical", "Texto fuera de la zona segura"]) {
      expect(looksLikeProductionNote(note), note).toBe(true);
    }
  });

  it("recognises a note that actually describes a scene", () => {
    for (const note of ["Escritorio con notas adhesivas y una laptop", "Dos personas revisando un tablero"]) {
      expect(looksLikeProductionNote(note), note).toBe(false);
    }
  });
});

describe("what to draw", () => {
  it("builds a valid request for every frame the composition produces", () => {
    for (const variant of [carousel, video]) {
      for (const frame of composeFrames(variant)) {
        const request = buildImageRequest(variant, frame.key, context);
        if (!request) continue;
        expect(() => imageRequestSchema.parse(request), frame.key).not.toThrow();
      }
    }
  });

  it("says what the piece is about, taken from the campaign", () => {
    const prompt = buildImageRequest(carousel, "slide-0", context)!.prompt;
    expect(prompt).toContain("Marketing con continuidad");
    expect(prompt).toContain("Educacion");
    expect(prompt).toContain("PyME B2B");
  });

  it("never sends a production note as the subject", () => {
    const prompt = buildImageRequest(carousel, "slide-0", context)!.prompt;
    expect(prompt).not.toContain("160 px");
    expect(prompt).not.toMatch(/legible/i);
  });

  it("uses a visual note that genuinely describes a scene", () => {
    const scened = {
      ...carousel,
      detail: {
        shape: "carousel" as const,
        carousel: {
          ...(carousel.detail.shape === "carousel" ? carousel.detail.carousel : ({} as never)),
          cover: { headline: "h", visualNote: "Escritorio con notas adhesivas y una laptop abierta" },
        },
      },
    };
    expect(buildImageRequest(scened, "slide-0", context)!.prompt).toContain("notas adhesivas");
  });

  it("anchors the style, because the drift is not random", () => {
    // Without an anchor it goes to fantasy illustration and stock glamour, which is the wrong
    // register for every brand this is likely to serve.
    const prompt = buildImageRequest(carousel, "slide-0", context)!.prompt;
    expect(prompt.toLowerCase()).toContain("fotografia editorial realista");
    expect(prompt.toLowerCase()).toContain("sin fantasia");
    expect(prompt.toLowerCase()).toContain("sin modelos posando");
  });

  it("forbids text in the picture", () => {
    // The typography is composed on top at delivery size. A picture that already contains words
    // produces a frame with two headlines, one of them misspelled.
    const prompt = buildImageRequest(carousel, "slide-0", context)!.prompt;
    expect(prompt.toLowerCase()).toContain("sin texto");
    expect(prompt.toLowerCase()).toContain("sin logos");
  });

  it("asks for room where the headline goes", () => {
    expect(buildImageRequest(carousel, "slide-0", context)!.prompt.toLowerCase()).toContain("espacio libre");
  });

  it("asks at the frame's own delivery proportions", () => {
    const canvas = canvasFor(video.platform, video.format);
    const request = buildImageRequest(video, "cover", context)!;
    expect(request.width).toBe(canvas.width);
    expect(request.height).toBe(canvas.height);
  });

  it("gives different frames different pictures, and the same frame the same one", () => {
    const first = buildImageRequest(carousel, "slide-0", context)!;
    const second = buildImageRequest(carousel, "slide-1", context)!;
    expect(first.seed).not.toBe(second.seed);
    expect(buildImageRequest(carousel, "slide-0", context)!.seed).toBe(first.seed);
  });

  it("includes the brand's own visual instructions when there are any", () => {
    const request = buildImageRequest(carousel, "slide-0", { ...context, brandVisualInstructions: "Paleta fria, documental" })!;
    expect(request.prompt).toContain("Paleta fria");
  });

  it("asks for nothing when neither the campaign nor the piece says anything", () => {
    // With neither, the prompt would be style and prohibitions only — the empty brief that
    // produced pictures unrelated to the content.
    expect(buildImageRequest(carousel, "slide-0", {})).toBeNull();
  });

  it("never exceeds the prompt length the contract allows", () => {
    const request = buildImageRequest(carousel, "slide-0", { ...context, brandVisualInstructions: "x".repeat(3_000) })!;
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

// A picture that came back wrong is not something to live with, but replacing one has to be
// deliberate: reuse is what keeps a second look from being a second charge.
describe("replacing a picture", () => {
  const producer = readFileSync(new URL("../../../src/server/media/voiceover-asset.ts", import.meta.url), "utf8");
  const route = readFileSync(new URL("../../../src/app/api/content/[id]/image/route.ts", import.meta.url), "utf8");
  const screen = readFileSync(new URL("../../../src/components/image-actions.tsx", import.meta.url), "utf8");

  it("reuses by default and only skips the check when asked", () => {
    expect(producer).toContain("regenerate = false");
    expect(producer).toContain("const existing = regenerate ? null : await findAsset(");
  });

  it("never lets a request turn it on by accident", () => {
    expect(route).toContain("regenerate: z.boolean().default(false)");
  });

  it("offers it only where a picture already exists", () => {
    expect(screen).toContain("generate(frame.key, true)");
    expect(screen).toMatch(/Rehacer/);
  });
});

describe("a written scene beats the campaign's own vocabulary", () => {
  const withDirection = { ...carousel, visualDirection: "Dos personas revisando un tablero de tareas en una oficina chica" } as typeof carousel;

  it("uses the piece's visual direction when the frame has no note of its own", () => {
    // A text post has no per-frame note, and its only other subject was the pillar and angle —
    // an internal taxonomy nobody can photograph. That is how a post about marketing process
    // came back illustrated with a jungle waterfall.
    const prompt = buildImageRequest(withDirection, "slide-9", context)!.prompt;
    expect(prompt).toContain("tablero de tareas");
  });

  it("drops the theme once a scene exists, but keeps who it is for", () => {
    const prompt = buildImageRequest(withDirection, "slide-9", context)!.prompt;
    expect(prompt).not.toContain("Tema:");
    expect(prompt).toContain("PyME B2B");
  });

  it("still falls back to the theme when nothing describes a scene", () => {
    expect(buildImageRequest(carousel, "slide-0", context)!.prompt).toContain("Tema:");
  });
});
