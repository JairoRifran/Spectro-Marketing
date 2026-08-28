import type { PlatformContentVariant } from "../content/schemas/variant";
import { canvasFor } from "./canvas";
import { seedOf } from "./palette";
import type { ImageRequest } from "./image-provider";

// What to draw, taken from what the piece already says.
//
// Emilia writes a visual direction for every piece and a note for every slide. Those are the
// brief; asking a model to invent something instead would produce a picture unrelated to the
// creative decision somebody already made and approved.
//
// Two instructions are appended to every prompt and neither is decoration:
//
//   * No text, letters or logos. The typography is composed on top at delivery size, and a
//     picture that already contains words produces a frame with two headlines, one of them
//     misspelled — the failure mode of generated imagery that is hardest to unsee.
//   * Room at one side. The composed headline occupies the upper half, so a subject centred
//     under it is a subject wearing a caption.
//
// The seed comes from the piece and the slot, so the same frame always asks for the same picture.
// A regeneration is then a comparison rather than a lottery.

const NO_TEXT = "Sin texto, sin letras, sin palabras, sin logos, sin marcas de agua.";
const COMPOSITION = "Composicion con espacio libre en la mitad superior para sobreimprimir un titulo.";

/** The direction written for this particular frame, falling back to the piece's own. */
function directionFor(variant: PlatformContentVariant, slot: string): string {
  const detail = variant.detail;

  if (detail.shape === "carousel") {
    const index = Number(slot.replace("slide-", ""));
    const slides = [detail.carousel.cover, ...detail.carousel.slides, detail.carousel.ctaSlide];
    const slide = Number.isInteger(index) ? slides[index] : undefined;
    return slide?.visualNote || detail.carousel.visualDirection;
  }

  if (detail.shape === "story") {
    const index = Number(slot.replace("story-", ""));
    return detail.story.frames[index]?.visualNote || detail.story.visualDirection;
  }

  if (detail.shape === "video") {
    if (slot === "cover") return detail.script.scenes[0]?.visual || variant.visualDirection || "";
    const index = Number(slot.replace("scene-", ""));
    return detail.script.scenes[index]?.visual || variant.visualDirection || "";
  }

  if (detail.shape === "static") return detail.post.visualDirection;
  return variant.visualDirection ?? "";
}

/**
 * The request for one frame's picture, or nothing when the piece never said what to draw.
 *
 * Nothing is the right answer there. Inventing a subject would put an image on a brand's channel
 * that no one chose, and a designed surface with no photograph is a perfectly good frame.
 */
export function buildImageRequest(
  variant: PlatformContentVariant,
  slot: string,
  brandVisualInstructions = "",
): ImageRequest | null {
  const direction = directionFor(variant, slot).trim();
  if (!direction) return null;

  const canvas = canvasFor(variant.platform, variant.format);
  const brand = brandVisualInstructions.trim();

  const prompt = [direction, brand, COMPOSITION, NO_TEXT].filter(Boolean).join(" ");

  return {
    prompt: prompt.slice(0, 1_000),
    // Asked for at delivery proportions: a square picture cropped into a 9:16 frame loses the
    // half of the subject the direction was written about.
    width: canvas.width,
    height: canvas.height,
    seed: seedOf(`${variant.conceptId}:${variant.platform}:${slot}`),
  };
}
