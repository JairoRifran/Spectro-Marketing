import { z } from "zod";
import { conceptIdSchema, contentFormatSchema, contentTypeSchema, noteText, shortText, supportedPlatformSchema } from "./common";

// The result of a deterministic review. Findings are structured so a future LLM reviewer can
// be added alongside without changing how callers read the outcome.

export const findingSchema = z.object({
  /** Stable id such as `platform.tiktok.duration` so a finding can be suppressed or tracked. */
  check: z.string().trim().min(1).max(120),
  severity: z.enum(["error", "warning"]),
  message: shortText,
  /** Which platform variant the finding belongs to, when it is variant-scoped. */
  platform: supportedPlatformSchema.optional(),
});
export type Finding = z.infer<typeof findingSchema>;

export const contentReviewResultSchema = z.object({
  passed: z.boolean(),
  errors: z.array(findingSchema).default([]),
  warnings: z.array(findingSchema).default([]),
  brandIssues: z.array(findingSchema).default([]),
  platformIssues: z.array(findingSchema).default([]),
  claimIssues: z.array(findingSchema).default([]),
  recommendations: z.array(noteText).default([]),
  /**
   * Passed checks out of checks run. Deliberately a ratio and not a percentage of
   * predicted performance: this layer does not model reach, conversion or virality.
   */
  score: z.object({ passed: z.number().int().nonnegative(), total: z.number().int().nonnegative() }),
});
export type ContentReviewResult = z.infer<typeof contentReviewResultSchema>;

/**
 * Why a piece exists, in fields a person can read. No reasoning trace: this is the record
 * of the editorial decisions, not of how a model arrived at them.
 */
export const contentExplanationSchema = z.object({
  conceptId: conceptIdSchema,
  campaignId: z.string().trim().min(1).max(100),
  objective: shortText,
  pillar: shortText,
  angle: shortText,
  audience: shortText,
  platform: supportedPlatformSchema,
  format: contentFormatSchema,
  contentType: contentTypeSchema,
  agent: z.enum(["bruno", "clara", "emilia"]),
  strategyReason: shortText,
});
export type ContentExplanation = z.infer<typeof contentExplanationSchema>;
