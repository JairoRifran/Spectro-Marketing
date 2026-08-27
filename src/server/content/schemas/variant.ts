import { z } from "zod";
import { bodyText, claimSchema, conceptIdSchema, contentFormatSchema, ctaTypeSchema, hookTypeSchema, notes, shortText, supportedPlatformSchema } from "./common";
import { carouselSchema, shortVideoScriptSchema, staticPostSchema, storySequenceSchema, textPostSchema } from "./formats";

// A variant is one platform's native execution of a concept. The `detail` field is a
// discriminated union on production shape, so a Reel carries a script, a carousel carries
// slides, and neither has to pretend it owns the other's fields.

export const variantDetailSchema = z.discriminatedUnion("shape", [
  z.object({ shape: z.literal("video"), script: shortVideoScriptSchema }),
  z.object({ shape: z.literal("carousel"), carousel: carouselSchema }),
  z.object({ shape: z.literal("story"), story: storySequenceSchema }),
  z.object({ shape: z.literal("text"), post: textPostSchema }),
  z.object({ shape: z.literal("static"), post: staticPostSchema }),
]);
export type VariantDetail = z.infer<typeof variantDetailSchema>;

export const platformContentVariantSchema = z.object({
  conceptId: conceptIdSchema,
  platform: supportedPlatformSchema,
  format: contentFormatSchema,

  hook: shortText,
  hookType: hookTypeSchema,
  body: bodyText,
  caption: bodyText,
  cta: shortText,
  ctaType: ctaTypeSchema,

  /** Direction for whoever or whatever produces the imagery. Required on visual platforms. */
  visualDirection: bodyText.optional(),
  /** Direction for motion, pacing and edit. Required when the shape is video. */
  videoDirection: bodyText.optional(),
  estimatedDurationSeconds: z.number().positive().max(600).optional(),
  onScreenText: z.array(shortText).max(20).default([]),
  shotNotes: notes,

  detail: variantDetailSchema,
  claims: z.array(claimSchema).max(10).default([]),

  /** Free-form platform metadata: a Shorts title, a LinkedIn document name, and so on. */
  metadata: z.record(z.string(), z.string().max(600)).default({}),
  /** Set by any generator that is not a real model, so mock output can never be shown as AI output. */
  generatedBy: z.enum(["mock", "provider"]).default("provider"),
});

export type PlatformContentVariant = z.infer<typeof platformContentVariantSchema>;

export const hookVariantSchema = z.object({
  label: z.enum(["A", "B", "C"]),
  text: shortText,
  type: hookTypeSchema,
  /** A short, user-facing reason. Never a reasoning trace. */
  rationale: shortText,
  /** What this opening risks: over-promising, niche reference, tonal mismatch. */
  risk: shortText,
});
export type HookVariant = z.infer<typeof hookVariantSchema>;

export const hookVariantSetSchema = z.array(hookVariantSchema).min(2).max(3);
