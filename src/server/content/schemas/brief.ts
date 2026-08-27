import { z } from "zod";
import { bodyText, campaignObjectiveSchema, claimSchema, conceptIdSchema, contentFormatSchema, contentTypeSchema, ctaTypeSchema, notes, shortText, supportedPlatformSchema } from "./common";

// Brand context as the editorial layer consumes it. These fields mirror the M01 `brands`
// table so the guardrails run against the organisation's real brand kit rather than a copy.
export const brandContextSchema = z.object({
  name: shortText,
  toneOfVoice: shortText,
  personality: z.array(shortText).max(20).default([]),
  preferredWords: z.array(shortText).max(50).default([]),
  forbiddenWords: z.array(shortText).max(50).default([]),
  forbiddenClaims: z.array(shortText).max(50).default([]),
  /** How informal this brand is ever allowed to be, regardless of platform norms. */
  informalityCeiling: z.enum(["formal", "professional", "conversational", "casual"]).default("conversational"),
  visualInstructions: z.string().trim().max(2000).default(""),
});
export type BrandContext = z.infer<typeof brandContextSchema>;

/**
 * What Content Factory expects to receive from Bruno. Campaign Brain owns how this is
 * produced; this module only states the shape it will consume, so the two can be built in
 * parallel and reconciled at one boundary.
 */
export const contentPlanInputSchema = z.object({
  campaignId: z.string().trim().min(1).max(100),
  campaign: z.object({
    name: shortText,
    objective: campaignObjectiveSchema,
    summary: bodyText,
  }),
  pillars: z.array(shortText).min(1).max(12),
  angles: z.array(shortText).min(1).max(30),
  audience: z.object({
    persona: shortText,
    problem: bodyText,
    motivations: z.array(shortText).max(20).default([]),
    objections: z.array(shortText).max(20).default([]),
  }),
  channels: z.array(supportedPlatformSchema).min(1).max(5),
  /** Intended distribution of editorial intent across the plan, as counts per type. */
  contentMix: z.partialRecord(contentTypeSchema, z.number().int().nonnegative()).default({}),
  constraints: notes,
});
export type ContentPlanInput = z.infer<typeof contentPlanInputSchema>;

/**
 * The contract between Bruno, Clara and Emilia. A brief is per platform and per format:
 * one concept produces one brief per platform, which is what keeps the executions native
 * instead of one text reused everywhere.
 */
export const contentBriefSchema = z.object({
  conceptId: conceptIdSchema,
  campaignId: z.string().trim().min(1).max(100),
  objective: campaignObjectiveSchema,
  contentType: contentTypeSchema,

  audience: z.object({
    persona: shortText,
    problem: bodyText,
  }),
  pillar: shortText,
  angle: shortText,

  platform: supportedPlatformSchema,
  format: contentFormatSchema,

  message: bodyText,
  desiredAction: ctaTypeSchema,
  evidence: z.array(claimSchema).max(10).default([]),

  brand: brandContextSchema,
  constraints: notes,
});
export type ContentBrief = z.infer<typeof contentBriefSchema>;
