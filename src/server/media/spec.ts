import { z } from "zod";

// The composed frame as pure data: positions, sizes and colours, with no rendering technology
// in it at all.
//
// This exists so the same composition can be drawn twice from one source of truth: as React
// elements in the browser today, and as an SVG string the server rasterises into a PNG asset
// later. If the composition were an SVG string to begin with, the browser would have to trust
// provider-written text inside markup, and the two renderers would drift apart the first time
// one of them needed a fix.

export const frameFillSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "A fill is a six-digit hex colour.");

export const textAlignSchema = z.enum(["left", "center"]);

export const rectBlockSchema = z.object({
  kind: z.literal("rect"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fill: frameFillSchema,
  radius: z.number().nonnegative().default(0),
  opacity: z.number().min(0).max(1).default(1),
});

export const textBlockSchema = z.object({
  kind: z.literal("text"),
  x: z.number(),
  y: z.number(),
  /** Pre-wrapped. Layout is decided during composition so both renderers agree exactly. */
  lines: z.array(z.string()).min(1),
  size: z.number().positive(),
  lineHeight: z.number().positive(),
  weight: z.number().int().min(100).max(900),
  fill: frameFillSchema,
  align: textAlignSchema,
  letterSpacing: z.number().default(0),
});

export const frameBlockSchema = z.discriminatedUnion("kind", [rectBlockSchema, textBlockSchema]);

export const frameSpecSchema = z.object({
  /** Stable within one variant, so a frame keeps its identity across recompositions. */
  key: z.string().min(1),
  /** What this frame is, in the words a person would use. */
  label: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background: frameFillSchema,
  blocks: z.array(frameBlockSchema),
  /** True when some text had to be dropped to fit; the caller decides whether that matters. */
  truncated: z.boolean().default(false),
});

export type RectBlock = z.infer<typeof rectBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type FrameBlock = z.infer<typeof frameBlockSchema>;
export type FrameSpec = z.infer<typeof frameSpecSchema>;
