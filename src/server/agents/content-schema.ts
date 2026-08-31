import { z } from "zod";
import { getAdapter } from "@/server/content/adapters";
import { contentCopyOutputSchema } from "@/server/content-factory/schemas";
import { platformContentVariantSchema } from "@/server/content/schemas/variant";
import { carouselSchema, shortVideoScriptSchema, staticPostSchema, storySequenceSchema, textPostSchema } from "@/server/content/schemas/formats";
import type { ContentCopyTaskInput } from "@/server/content-factory/mock-content";

// The schema asked of the writer, narrowed to the piece actually being written.
//
// The full variant schema carries every production shape at once — a carousel's slides, a
// video's script, a story's frames, two kinds of post — because one type has to describe them
// all. Sent to structured outputs it compiled to a grammar the API refused outright:
//
//   "The compiled grammar is too large, which would cause performance issues.
//    Simplify your tool schemas or reduce the number of strict tools."
//
// Four fifths of that was shapes this piece was never going to use. Which one it needs is not a
// guess: the platform and format were decided by the plan, and the deterministic adapter already
// resolves them to a shape — Instagram answers a video request with a video and a carousel
// request with slides. Asking it, rather than restating the mapping here, keeps one source of
// truth for a decision that has been got wrong twice.
//
// Narrowing also removes a whole class of bug rather than merely shrinking a payload: a schema
// with one branch cannot come back carrying another platform's shape.

const DETAIL_BY_SHAPE = {
  video: z.object({ shape: z.literal("video"), script: shortVideoScriptSchema }),
  carousel: z.object({ shape: z.literal("carousel"), carousel: carouselSchema }),
  story: z.object({ shape: z.literal("story"), story: storySequenceSchema }),
  text: z.object({ shape: z.literal("text"), post: textPostSchema }),
  static: z.object({ shape: z.literal("static"), post: staticPostSchema }),
} as const;

/**
 * Fields the writer is not asked for, because they are facts of the task or of the run.
 *
 * `conceptId`, `platform` and `format` say which piece this is; the plan decided them and the
 * code writes them back. `generatedBy` is provenance. `metadata` is a free-form dictionary of
 * platform extras that nothing downstream requires and every key of which would widen the
 * grammar that was already too wide.
 */
const NOT_ASKED = { conceptId: true, platform: true, format: true, generatedBy: true, metadata: true } as const;

/** The shape this piece needs, taken from the adapter that will have to render it. */
export function shapeFor(input: ContentCopyTaskInput) {
  return getAdapter(input.brief.platform).draft({
    concept: input.concept,
    brand: input.brief.brand,
    campaign: { campaignId: input.campaignId, name: input.campaignName, objective: input.campaignObjective },
  }).detail.shape;
}

/** The copy schema for one piece: its own production shape and nothing else's. */
export function contentCopySchemaFor(input: ContentCopyTaskInput) {
  return contentCopyOutputSchema.extend({
    variant: platformContentVariantSchema.omit(NOT_ASKED).extend({ detail: DETAIL_BY_SHAPE[shapeFor(input)] }),
  });
}
