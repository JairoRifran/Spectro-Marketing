import { describe, expect, it } from "vitest";
import { canvasFor } from "@/server/media/canvas";
import { composeFrames } from "@/server/media/compose";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";

// Composition must hold for text far longer than the demo fixtures. A model writing a long
// headline is normal; a headline that renders past the bottom of the frame is not.
const long = (words: number) => Array.from({ length: words }, (_, index) => `palabra${index}`).join(" ");

function carouselVariant(headline: string, body: string): PlatformContentVariant {
  return {
    conceptId: "CONCEPT-1", platform: "instagram", format: "carousel",
    hook: "hook", hookType: "problem", body: "body", caption: "caption", cta: "cta", ctaType: "save",
    visualDirection: "d", onScreenText: [], shotNotes: [],
    detail: {
      shape: "carousel",
      carousel: {
        cover: { headline, body, visualNote: "n" },
        slides: [{ headline, body, visualNote: "n" }],
        ctaSlide: { headline, body, visualNote: "n" },
        caption: "caption", visualDirection: "d",
      },
    },
    claims: [], metadata: {}, generatedBy: "mock",
  } as PlatformContentVariant;
}

describe("composition under long text", () => {
  it("never draws below the frame, however long the copy is", () => {
    const canvas = canvasFor("instagram", "carousel");
    for (const size of [10, 40, 120, 400]) {
      for (const frame of composeFrames(carouselVariant(long(size), long(size)))) {
        for (const block of frame.blocks) {
          if (block.kind !== "text") continue;
          const bottom = block.y + (block.lines.length - 1) * block.lineHeight;
          expect(bottom, `${size} words overflowed the frame`).toBeLessThanOrEqual(canvas.height - canvas.safe.bottom);
        }
      }
    }
  });

  it("says so when the copy did not fit", () => {
    const frames = composeFrames(carouselVariant(long(200), long(200)));
    expect(frames.some((frame) => frame.truncated)).toBe(true);
  });
});
