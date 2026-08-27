import { z } from "zod";
import { contentConceptSchema } from "@/server/content/schemas/concept";
import { hookVariantSetSchema, platformContentVariantSchema } from "@/server/content/schemas/variant";
import { findingSchema } from "@/server/content/schemas/review";

// Agent output contracts for the three Content Factory task types. Every schema reuses the
// Content Intelligence contracts rather than restating them: the factory persists what that
// layer defines, it does not define a second vocabulary.

const shortText = z.string().trim().min(1).max(300);
const summaryText = z.string().trim().min(1).max(2000);
const providerMeta = {
  provider: z.string().trim().min(1).max(60),
  model: z.string().trim().max(120).nullable().default(null),
  promptVersion: z.string().trim().min(1).max(120),
};

/** Bruno: turns an approved campaign into editorial ideas. */
export const contentPlanOutputSchema = z.object({
  concepts: z.array(contentConceptSchema).min(1).max(60),
  /** Deviations the deterministic planner could not honour. Surfaced, never hidden. */
  planWarnings: z.array(shortText).max(30).default([]),
  /** User-facing reason the plan is shaped this way. Never a reasoning trace. */
  reason: summaryText,
  ...providerMeta,
});
export type ContentPlanOutput = z.infer<typeof contentPlanOutputSchema>;

/** Clara: writes one platform's native execution from a brief. */
export const contentCopyOutputSchema = z.object({
  variant: platformContentVariantSchema,
  /** Two or three alternative openings when the format warrants them. */
  hookVariants: hookVariantSetSchema.optional(),
  reason: summaryText,
  ...providerMeta,
});
export type ContentCopyOutput = z.infer<typeof contentCopyOutputSchema>;

/**
 * Emilia: creative direction and review. She does not return copy — the schema has no field
 * for it, which is how "Emilia must not rewrite Clara's text" is enforced rather than asked.
 */
export const creativeReviewOutputSchema = z.object({
  visualDirection: summaryText,
  storyboard: z.array(z.object({ beat: shortText, visual: shortText, motion: shortText.optional() })).max(20).default([]),
  motionNotes: z.array(shortText).max(20).default([]),
  compositionNotes: z.array(shortText).max(20).default([]),
  brandConsistency: z.enum(["consistent", "needs_adjustment", "off_brand"]),
  findings: z.array(findingSchema).max(40).default([]),
  approved: z.boolean(),
  reason: summaryText,
  ...providerMeta,
});
export type CreativeReviewOutput = z.infer<typeof creativeReviewOutputSchema>;

/** Persisted quality outcome. A ratio of checks, never a predicted performance figure. */
export const qualitySummarySchema = z.object({
  passed: z.boolean(),
  checksPassed: z.number().int().nonnegative(),
  checksTotal: z.number().int().nonnegative(),
  errors: z.array(findingSchema).default([]),
  warnings: z.array(findingSchema).default([]),
  recommendations: z.array(shortText).default([]),
});
export type QualitySummary = z.infer<typeof qualitySummarySchema>;

/** Revision feedback a human writes when sending a piece back. */
export const revisionRequestSchema = z.object({
  feedback: z.string().trim().min(5).max(2000),
});
export type RevisionRequest = z.infer<typeof revisionRequestSchema>;
