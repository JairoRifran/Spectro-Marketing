import { z } from "zod";
import { bodyText, noteText, notes, shortText } from "./common";

// One detail schema per production shape. Keeping them separate is what stops the variant
// schema from becoming a single object with forty optional fields that nothing can validate
// meaningfully. A variant carries exactly the detail its format needs.

// --- video -------------------------------------------------------------------------------

export const videoSceneSchema = z.object({
  durationSeconds: z.number().positive().max(120),
  /** What the camera sees. Consumed later by an image or video generation step. */
  visual: bodyText,
  voiceover: bodyText.optional(),
  onScreenText: shortText.optional(),
  transitionNote: noteText.optional(),
});
export type VideoScene = z.infer<typeof videoSceneSchema>;

export const shortVideoScriptSchema = z.object({
  hook: shortText,
  setup: bodyText,
  /** The progression between setup and payoff; each beat is a reason to keep watching. */
  beats: z.array(bodyText).min(1).max(10),
  payoff: bodyText,
  cta: shortText,

  estimatedDurationSeconds: z.number().positive().max(180),
  voiceover: bodyText.optional(),
  onScreenText: z.array(shortText).max(20).default([]),
  scenes: z.array(videoSceneSchema).min(1).max(20),
  shotNotes: notes,
});
export type ShortVideoScript = z.infer<typeof shortVideoScriptSchema>;

// --- carousel ----------------------------------------------------------------------------

export const carouselSlideSchema = z.object({
  headline: shortText,
  body: bodyText.optional(),
  visualNote: noteText,
});
export type CarouselSlide = z.infer<typeof carouselSlideSchema>;

export const carouselSchema = z.object({
  cover: carouselSlideSchema,
  /** Body slides between the cover and the call to action slide. */
  slides: z.array(carouselSlideSchema).min(1).max(12),
  ctaSlide: carouselSlideSchema,
  caption: bodyText,
  visualDirection: bodyText,
});
export type Carousel = z.infer<typeof carouselSchema>;

// --- story -------------------------------------------------------------------------------

export const storyFrameSchema = z.object({
  /** The job this frame does in the sequence. Sequences are not assumed to be four frames. */
  role: z.enum(["hook", "context", "value", "proof", "cta"]),
  text: shortText,
  visualNote: noteText,
  durationSeconds: z.number().positive().max(60).default(5),
});
export type StoryFrame = z.infer<typeof storyFrameSchema>;

export const storySequenceSchema = z.object({
  frames: z.array(storyFrameSchema).min(2).max(10),
  visualDirection: bodyText,
});
export type StorySequence = z.infer<typeof storySequenceSchema>;

// --- text --------------------------------------------------------------------------------

export const textPostSchema = z.object({
  hook: shortText,
  body: bodyText,
  cta: shortText,
  /** Editorial metadata that travels with the post rather than being reconstructed later. */
  readingLevel: z.enum(["plain", "professional", "technical"]).default("professional"),
  sources: z.array(shortText).max(10).default([]),
});
export type TextPost = z.infer<typeof textPostSchema>;

// --- static ------------------------------------------------------------------------------

export const staticPostSchema = z.object({
  headline: shortText,
  caption: bodyText,
  visualDirection: bodyText,
  onScreenText: z.array(shortText).max(10).default([]),
});
export type StaticPost = z.infer<typeof staticPostSchema>;
