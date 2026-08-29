import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { canvasFor, contentBox } from "@/server/media/canvas";
import { composeFrames } from "@/server/media/compose";
import { SPECTRO_IDENTITY } from "@/server/media/identity";
import { frameSpecSchema } from "@/server/media/spec";
import { renderFrameSvg } from "@/server/media/svg";
import { fitSize, measure, wrap, wrapClamped } from "@/server/media/text";
import { getAdapter } from "@/server/content/adapters";
import { SUPPORTED_PLATFORMS, supportsFormat, CONTENT_FORMATS } from "@/server/content/platforms";
import type { ContentConcept } from "@/server/content/schemas/concept";

const brand = {
  name: "Spectro Marketing", toneOfVoice: "Claro y directo", personality: ["honesto"],
  preferredWords: [], forbiddenWords: [], forbiddenClaims: [],
  informalityCeiling: "conversational" as const, visualInstructions: "",
};

const concept: ContentConcept = {
  conceptId: "CONCEPT-TEST-001", title: "Proceso antes que herramienta", internalName: "test",
  pillar: "Educación", angle: "Proceso antes que herramienta", objective: "educational",
  audience: { persona: "Responsable de marketing", problem: "Tareas repetitivas sin documentar.", promise: "El proceso escrito las vuelve delegables." },
  coreIdea: "Antes de automatizar hay que poder describir la tarea de principio a fin.",
  hookDirection: { preferredTypes: ["problem"] }, format: "carousel",
  platforms: ["instagram"], cta: "save", evidenceRequired: [], creativeNotes: [],
};

const context = { concept, brand, campaign: { campaignId: "camp-1", name: "Test", objective: "awareness" as const } };
const variantFor = (platform: (typeof SUPPORTED_PLATFORMS)[number], format: (typeof CONTENT_FORMATS)[number]) => {
  const scoped = { ...context, concept: { ...concept, format, platforms: [platform] as ContentConcept["platforms"] } };
  return getAdapter(platform).draft(scoped);
};

describe("text measurement", () => {
  it("does not treat every character as the same width", () => {
    expect(measure("mmmm", 100)).toBeGreaterThan(measure("iiii", 100));
  });

  it("scales linearly with font size", () => {
    expect(measure("Spectro", 100)).toBeCloseTo(measure("Spectro", 50) * 2, 5);
  });

  it("is pure: the same text always measures the same", () => {
    expect(measure("Proceso antes que herramienta", 64)).toBe(measure("Proceso antes que herramienta", 64));
  });
});

describe("wrapping", () => {
  it("keeps every line inside the width it was given", () => {
    const width = 600;
    for (const line of wrap("Antes de automatizar cualquier tarea hay que poder describirla en voz alta", width, 48)) {
      expect(measure(line, 48)).toBeLessThanOrEqual(width);
    }
  });

  it("loses no words", () => {
    const text = "Antes de automatizar cualquier tarea hay que poder describirla";
    expect(wrap(text, 500, 44).join(" ")).toBe(text);
  });

  it("breaks a word too long for the line instead of letting it overflow", () => {
    // An unbroken overlong word is invisible damage: it renders past the frame and nothing sees it.
    const lines = wrap("supercalifragilisticoespialidoso", 200, 48);
    expect(lines.length).toBeGreaterThan(1);
    for (const line of lines) expect(measure(line, 48)).toBeLessThanOrEqual(200);
  });

  it("reports when it had to drop text rather than dropping it silently", () => {
    const long = "palabra ".repeat(60).trim();
    const clamped = wrapClamped(long, 500, 44, 3);
    expect(clamped.truncated).toBe(true);
    expect(clamped.lines).toHaveLength(3);
    expect(clamped.lines[2].endsWith("…")).toBe(true);
  });

  it("does not claim truncation when everything fitted", () => {
    expect(wrapClamped("Texto corto", 800, 44, 3).truncated).toBe(false);
  });

  it("picks the largest size that still fits the line budget", () => {
    const small = fitSize("Un titular considerablemente más largo que el otro para forzar el ajuste", 600, 2, [96, 72, 48, 32]);
    const large = fitSize("Corto", 600, 2, [96, 72, 48, 32]);
    expect(large).toBeGreaterThan(small);
  });
});

describe("canvas", () => {
  it("uses the vertical canvas for anything that plays full screen", () => {
    for (const format of ["reel", "short_video", "story"] as const) {
      const canvas = canvasFor("instagram", format);
      expect(canvas.height).toBeGreaterThan(canvas.width);
      expect(canvas.width / canvas.height).toBeCloseTo(9 / 16, 3);
    }
  });

  it("leaves room for the interface that covers a vertical frame", () => {
    const canvas = canvasFor("tiktok", "short_video");
    // The action rail is on the right and the caption at the bottom; both must be avoided.
    expect(canvas.safe.right).toBeGreaterThan(canvas.safe.left);
    expect(canvas.safe.bottom).toBeGreaterThan(canvas.safe.top);
  });

  it("gives composition a content box strictly inside the canvas", () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      for (const format of CONTENT_FORMATS) {
        if (!supportsFormat(platform, format)) continue;
        const canvas = canvasFor(platform, format);
        const box = contentBox(canvas);
        expect(box.x).toBeGreaterThan(0);
        expect(box.width).toBeGreaterThan(0);
        expect(box.height).toBeGreaterThan(0);
        expect(box.x + box.width).toBeLessThanOrEqual(canvas.width);
        expect(box.y + box.height).toBeLessThanOrEqual(canvas.height);
      }
    }
  });
});

describe("composition", () => {
  it("produces a valid, complete frame for every format an adapter can produce", () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      for (const format of CONTENT_FORMATS) {
        if (!supportsFormat(platform, format)) continue;
        const variant = variantFor(platform, format);
        for (const frame of composeFrames(variant)) {
          expect(() => frameSpecSchema.parse(frame), `${platform}/${format}`).not.toThrow();
        }
      }
    }
  });

  it("is deterministic: the same variant always composes to the same frames", () => {
    const variant = variantFor("instagram", "carousel");
    expect(composeFrames(variant)).toEqual(composeFrames(variant));
  });

  it("composes one frame per carousel slide, cover and closing included", () => {
    const variant = variantFor("instagram", "carousel");
    if (variant.detail.shape !== "carousel") throw new Error("expected a carousel");
    const expected = variant.detail.carousel.slides.length + 2;
    const frames = composeFrames(variant);
    expect(frames).toHaveLength(expected);
    expect(frames[0].label).toBe("Portada");
    expect(frames.at(-1)!.label).toBe("Cierre");
  });

  it("gives a video a cover built from its hook", () => {
    const variant = variantFor("tiktok", "short_video");
    const cover = composeFrames(variant).find((frame) => frame.key === "cover");
    expect(cover).toBeDefined();
    expect(cover!.blocks.some((block) => block.kind === "text" && block.lines.join(" ").length > 0)).toBe(true);
  });

  it("composes one spare frame to accompany a text post, not to replace it", () => {
    // The earlier rule was that a designed surface here invents a format nobody uses. That was
    // half right: the words are still the piece, but a text post can carry an image beside them,
    // and a wall of unbroken text is what a feed scrolls past. One frame, and only one.
    const frames = composeFrames(variantFor("linkedin", "text_post"));
    expect(frames).toHaveLength(1);
    expect(frames[0]!.key).toBe("post");
    // An image slot is the whole point: without a frame there was nowhere to put a picture.
    expect(frames[0]!.blocks.some((block) => block.kind === "image")).toBe(true);
  });

  // Text stays inside the safe area, because outside it the platform's own interface sits on
  // top. Decoration is held to the canvas instead: confining it to the text box would leave
  // every frame with a permanent border, which is not a design, it is a bug with margins.
  it("keeps every line of text inside the content box on every platform", () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      for (const format of CONTENT_FORMATS) {
        if (!supportsFormat(platform, format)) continue;
        // The canvas comes from the format the adapter actually produced, never the one that was
        // asked for: an adapter is allowed to answer a request with the shape it can deliver.
        const variant = variantFor(platform, format);
        const box = contentBox(canvasFor(variant.platform, variant.format));
        for (const frame of composeFrames(variant)) {
          for (const block of frame.blocks) {
            const where = `${platform}/${format}`;
            if (block.kind !== "text") continue;
            expect(block.x, `${where} starts left of the box`).toBeGreaterThanOrEqual(box.x);
            const widest = Math.max(...block.lines.map((line) => measure(line, block.size, block.letterSpacing)));
            expect(block.x + widest, `${where} text too wide`).toBeLessThanOrEqual(box.x + box.width);
            const bottom = block.y + (block.lines.length - 1) * block.lineHeight;
            expect(bottom, `${where} text below the box`).toBeLessThanOrEqual(box.y + box.height);
          }
        }
      }
    }
  });

  it("keeps text out of the area the platform interface covers on a vertical frame", () => {
    const variant = variantFor("tiktok", "short_video");
    expect(variant.format, "this test is only meaningful on a vertical format").toBe("short_video");
    const canvas = canvasFor(variant.platform, variant.format);
    for (const frame of composeFrames(variant)) {
      for (const block of frame.blocks) {
        if (block.kind !== "text") continue;
        const widest = Math.max(...block.lines.map((line) => measure(line, block.size, block.letterSpacing)));
        expect(block.x).toBeGreaterThanOrEqual(canvas.safe.left);
        expect(block.x + widest).toBeLessThanOrEqual(canvas.width - canvas.safe.right);
      }
    }
  });
});

describe("svg rendering", () => {
  it("escapes text that came from a provider instead of letting it become markup", () => {
    const frame = composeFrames(variantFor("instagram", "carousel"))[0];
    const hostile = {
      ...frame,
      blocks: [{ kind: "text" as const, x: 10, y: 10, lines: ["</text><script>alert(1)</script>"], size: 40, lineHeight: 48, weight: 400, fill: "#ffffff", align: "left" as const, letterSpacing: 0, opacity: 1 }],
    };
    const svg = renderFrameSvg(hostile, SPECTRO_IDENTITY);
    expect(svg).not.toContain("<script>");
    expect(svg).toContain("&lt;/text&gt;");
  });

  it("declares the same size the spec was composed at", () => {
    const frame = composeFrames(variantFor("instagram", "carousel"))[0];
    const svg = renderFrameSvg(frame);
    expect(svg).toContain(`viewBox="0 0 ${frame.width} ${frame.height}"`);
  });

  it("is deterministic", () => {
    const frame = composeFrames(variantFor("tiktok", "short_video"))[0];
    expect(renderFrameSvg(frame)).toBe(renderFrameSvg(frame));
  });
});

// The adapter answers a request with the shape it can actually deliver — asking Instagram for a
// story yields a carousel. Composition has to follow the produced format, because sizing a frame
// from the requested one silently renders at the wrong dimensions.
describe("decoration", () => {
  it("stays within the canvas, so no shape is drawn entirely off the edge", () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      for (const format of CONTENT_FORMATS) {
        if (!supportsFormat(platform, format)) continue;
        const variant = variantFor(platform, format);
        for (const frame of composeFrames(variant)) {
          for (const block of frame.blocks) {
            if (block.kind !== "ellipse") continue;
            const where = `${platform}/${format}`;
            expect(block.cx, `${where} shape centred off the canvas`).toBeGreaterThan(0);
            expect(block.cx, where).toBeLessThan(frame.width);
            expect(block.cy, where).toBeGreaterThan(0);
            expect(block.cy, where).toBeLessThan(frame.height);
            // Barely visible is worse than absent: it reads as a rendering fault.
            expect(block.opacity, `${where} shape invisible`).toBeGreaterThan(0.05);
          }
        }
      }
    }
  });

  it("gives a frame more than words on a flat rectangle", () => {
    const frames = composeFrames(variantFor("instagram", "carousel"));
    for (const frame of frames) {
      expect(typeof frame.background, "a flat background is the thing this replaced").not.toBe("string");
      expect(frame.blocks.some((block) => block.kind === "ellipse")).toBe(true);
    }
  });

  it("varies between slides while staying deterministic", () => {
    // A set, not five copies — and the same slide twice is the same picture.
    const frames = composeFrames(variantFor("instagram", "carousel"));
    const shapes = frames.map((frame) => JSON.stringify(frame.blocks.filter((block) => block.kind === "ellipse")));
    expect(new Set(shapes).size).toBeGreaterThan(1);
    expect(composeFrames(variantFor("instagram", "carousel"))).toEqual(frames);
  });
});

describe("canvas follows the produced format", () => {
  it("sizes the frame from what the adapter delivered, not what was asked for", () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      for (const format of CONTENT_FORMATS) {
        if (!supportsFormat(platform, format)) continue;
        const variant = variantFor(platform, format);
        const produced = canvasFor(variant.platform, variant.format);
        for (const frame of composeFrames(variant)) {
          expect(frame.width, `${platform}/${format}`).toBe(produced.width);
          expect(frame.height, `${platform}/${format}`).toBe(produced.height);
        }
      }
    }
  });
});

describe("a text post previews with what it will carry", () => {
  const mockup = readFileSync(new URL("../../../src/components/platform-mockup.tsx", import.meta.url), "utf8");

  it("hands the text renderer the composed frame", () => {
    // It used to take only the variant and the account, so there was nowhere for a picture to
    // appear even once one had been generated.
    expect(mockup).toContain("function TextPost({ variant, account, frames, identity, images }: Renderable)");
    expect(mockup).toContain('{shape === "text" && <TextPost {...props} />}');
  });

  it("puts it under the words, where the platform attaches one", () => {
    const start = mockup.indexOf("function TextPost");
    const post = mockup.slice(start, mockup.indexOf("export function PlatformMockup"));
    expect(post.indexOf("<Caption")).toBeLessThan(post.indexOf("<Media"));
  });

  it("still previews a piece whose picture does not exist", () => {
    expect(mockup).toContain("{frames[0] && (");
  });
});

describe("the picture is not hidden by the stylesheet that predates it", () => {
  const css = readFileSync(new URL("../../../src/app/globals.css", import.meta.url), "utf8");
  const page = readFileSync(new URL("../../../src/app/content/page.tsx", import.meta.url), "utf8");

  it("stops hiding the media box on a text post", () => {
    // It was hidden because it never had anything in it. The element was in the DOM, correct
    // and unrendered, which is the hardest kind of missing feature to see.
    expect(css).not.toContain(".mock-post.is-text .mock-media{display:none}");
  });

  it("prints the platform tag once", () => {
    // The static mockup prints its own; the card printed a second one over it.
    expect(page).toContain("{playable && <PlatformTag variant={variant} />}");
  });

  it("prints the honesty note once", () => {
    // Only the assembled playback lacks one of its own.
    expect(page).toContain("{playable && (\n                            <p className=\"mock-disclaimer\">");
  });
});
