import { z } from "zod";
import { bodyText, claimSchema, conceptIdSchema, contentFormatSchema, contentTypeSchema, ctaTypeSchema, hookTypeSchema, notes, shortText, supportedPlatformSchema } from "./common";

// A concept is the idea before anyone writes the piece. It is deliberately platform-plural:
// one concept fans out into several native variants, and they stay related through conceptId.

export const contentConceptSchema = z.object({
  conceptId: conceptIdSchema,
  title: shortText,
  /** Human-readable handle used in plans and reviews; not shown to an audience. */
  internalName: shortText,

  pillar: shortText,
  angle: shortText,

  objective: contentTypeSchema,
  audience: z.object({
    persona: shortText,
    problem: bodyText,
    promise: bodyText,
  }),

  coreIdea: bodyText,
  hookDirection: z.object({
    preferredTypes: z.array(hookTypeSchema).min(1).max(5),
    note: shortText.optional(),
  }),

  format: contentFormatSchema,
  platforms: z.array(supportedPlatformSchema).min(1).max(5),
  cta: ctaTypeSchema,

  /** Claims the idea already commits to. Empty means the idea asserts nothing provable. */
  evidenceRequired: z.array(claimSchema).max(10).default([]),
  creativeNotes: notes,
});

export type ContentConcept = z.infer<typeof contentConceptSchema>;
