import type { PlatformContentVariant } from "../content/schemas/variant";
import { canvasFor } from "./canvas";
import { seedOf } from "./palette";
import type { ImageRequest } from "./image-provider";

// What to draw.
//
// The first version of this sent only the slide's visual note, which turned out to be a
// production note rather than a subject: "cover legible at 160 px" says nothing about what is in
// the picture. With no subject at all the model filled the gap on its own, and a B2B marketing
// carousel came back illustrated with a swimwear model and a fantasy moon. That was not the
// model failing; it was being asked nothing.
//
// So the subject is built from what the campaign actually decided — its pillar, its angle, who
// it is for — and the visual note is used only when it reads like a description of a scene
// rather than a note about legibility.
//
// Three constraints go into every prompt and none is decoration:
//
//   * No text, letters or logos. The typography is composed on top at delivery size, and a
//     picture that already contains words yields a frame with two headlines, one misspelled.
//   * Room where the headline goes. A subject centred under the title wears it as a caption.
//   * A style anchor. Without one the drift is not random — it goes to fantasy illustration and
//     stock glamour, which is the wrong register for every brand this is likely to serve.

const NO_TEXT = "Sin texto, sin letras, sin palabras, sin logos, sin marcas de agua.";
const COMPOSITION = "Espacio libre en la mitad superior para sobreimprimir un titulo.";
const STYLE = "Fotografia editorial realista, ambiente de trabajo, luz natural, tonos sobrios.";
const NOT_THIS = "Sin fantasia, sin ilustracion digital, sin paisajes surrealistas, sin modelos posando, sin primeros planos de personas.";

export interface ImageContext {
  /** What the campaign decided this piece is about. */
  pillar?: string;
  angle?: string;
  /** Who it is for, which is most of what makes a scene specific rather than generic. */
  audience?: string;
  brandVisualInstructions?: string;
}

/**
 * Whether a note describes a scene or merely how the frame should be built.
 *
 * A production note is not a subject, and sending one as though it were is what produced
 * pictures unrelated to the piece. When in doubt this treats a note as production, because a
 * missing scene falls back to the campaign's own subject while a wrong one becomes the subject.
 */
export function looksLikeProductionNote(note: string): boolean {
  return /\b(\d+\s*px|legible|legibilidad|tipografia|tipografía|contraste|encuadre|formato|resolucion|resolución|miniatura|safe area|zona segura|margen|lamina|lámina|slide|portada)\b/i.test(note);
}

/** The note written for this particular frame, when there is a usable one. */
function sceneNote(variant: PlatformContentVariant, slot: string): string {
  const detail = variant.detail;
  let note = "";

  if (detail.shape === "carousel") {
    const index = Number(slot.replace("slide-", ""));
    const slides = [detail.carousel.cover, ...detail.carousel.slides, detail.carousel.ctaSlide];
    note = (Number.isInteger(index) ? slides[index]?.visualNote : "") || "";
  } else if (detail.shape === "story") {
    const index = Number(slot.replace("story-", ""));
    note = detail.story.frames[index]?.visualNote || "";
  } else if (detail.shape === "video") {
    const index = slot === "cover" ? 0 : Number(slot.replace("scene-", ""));
    note = detail.script.scenes[index]?.visual || "";
  } else if (detail.shape === "static") {
    note = detail.post.visualDirection || "";
  }

  const trimmed = note.trim();
  return trimmed && !looksLikeProductionNote(trimmed) ? trimmed : "";
}

/** What the piece is about, in the campaign's own words. */
function subjectOf(context: ImageContext): string {
  const parts: string[] = [];
  const topic = [context.angle?.trim(), context.pillar?.trim()].filter(Boolean).join(", ");
  if (topic) parts.push(`Tema: ${topic}.`);
  if (context.audience?.trim()) parts.push(`Para: ${context.audience.trim()}.`);
  return parts.join(" ");
}

/**
 * The request for one frame's picture, or nothing when there is nothing to say.
 *
 * Nothing is the right answer when neither the campaign nor the piece describes a subject.
 * Inventing one puts a picture on a brand's channel that nobody chose, and a designed surface
 * with no photograph is a perfectly good frame.
 */
export function buildImageRequest(
  variant: PlatformContentVariant,
  slot: string,
  context: ImageContext = {},
): ImageRequest | null {
  const subject = subjectOf(context);
  const scene = sceneNote(variant, slot);
  // With neither, the prompt would be style and prohibitions only — which is exactly the empty
  // brief that produced pictures unrelated to the piece.
  if (!subject && !scene) return null;

  const canvas = canvasFor(variant.platform, variant.format);
  const prompt = [STYLE, subject, scene, context.brandVisualInstructions?.trim(), COMPOSITION, NO_TEXT, NOT_THIS]
    .filter(Boolean)
    .join(" ");

  return {
    prompt: prompt.slice(0, 1_000),
    // Asked for at delivery proportions: a square picture cropped into a 9:16 frame loses the
    // half of the subject the direction was written about.
    width: canvas.width,
    height: canvas.height,
    seed: seedOf(`${variant.conceptId}:${variant.platform}:${slot}`),
  };
}
