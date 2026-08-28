import { z } from "zod";

// The composed frame as pure data: positions, sizes and colours, with no rendering technology
// in it at all.
//
// This exists so the same composition can be drawn three times from one source of truth: as
// React elements in the browser, as an SVG string a server can rasterise, and onto a canvas the
// browser exports as a PNG. If the composition were markup to begin with, the browser would have
// to trust provider-written text inside it, and the renderers would drift apart the first time
// one of them needed a fix.
//
// The primitives are deliberately few — a rectangle, an ellipse, a line of text — because every
// one added has to be implemented three times and correctly each time. What gives the design its
// range is the fill: a flat colour or a two-stop gradient, which is enough for depth without
// becoming a drawing language.

export const hexColourSchema = z.string().regex(/^#[0-9a-f]{6}$/i, "A colour is a six-digit hex value.");

export const gradientFillSchema = z.object({
  from: hexColourSchema,
  to: hexColourSchema,
  /** Degrees clockwise from a left-to-right sweep. */
  angle: z.number().min(0).max(360),
});
export type GradientFill = z.infer<typeof gradientFillSchema>;

export const fillSchema = z.union([hexColourSchema, gradientFillSchema]);
export type Fill = z.infer<typeof fillSchema>;

export function isGradient(fill: Fill): fill is GradientFill {
  return typeof fill !== "string";
}

export const rectBlockSchema = z.object({
  kind: z.literal("rect"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  fill: fillSchema,
  radius: z.number().nonnegative().default(0),
  opacity: z.number().min(0).max(1).default(1),
});

/** Soft shapes carry depth that rectangles cannot, and cost one more primitive to support. */
export const ellipseBlockSchema = z.object({
  kind: z.literal("ellipse"),
  cx: z.number(),
  cy: z.number(),
  rx: z.number().positive(),
  ry: z.number().positive(),
  fill: fillSchema,
  opacity: z.number().min(0).max(1).default(1),
});

/**
 * A generated picture behind the typography.
 *
 * It carries a slot name rather than a URL. A spec holding a signed link would stop being
 * deterministic — it would differ on every read and expire — and the whole value of the spec is
 * that the same piece composes to the same thing. Renderers resolve the slot against a map of
 * links supplied at render time, and draw the fallback when there is nothing for it yet.
 */
export const imageBlockSchema = z.object({
  kind: z.literal("image"),
  x: z.number(),
  y: z.number(),
  width: z.number().positive(),
  height: z.number().positive(),
  /** Matches the asset slot the picture is stored under. */
  slot: z.string().min(1),
  /** Drawn when no picture exists yet, so a frame is never a hole. */
  fallback: fillSchema,
  /**
   * How much to darken the picture, and with what.
   *
   * Applied only when a picture is actually drawn. Type over an unknown photograph is unreadable
   * about half the time — a light headline lands on a bright sky — and which half is not known
   * until the picture exists. Veiling the designed fallback as well would dim every frame that
   * has no artwork, which is most of them.
   */
  veil: z.number().min(0).max(1).default(0),
  veilColour: hexColourSchema,
  opacity: z.number().min(0).max(1).default(1),
});

export const textAlignSchema = z.enum(["left", "center"]);

export const textBlockSchema = z.object({
  kind: z.literal("text"),
  x: z.number(),
  y: z.number(),
  /** Pre-wrapped. Layout is decided during composition so every renderer agrees exactly. */
  lines: z.array(z.string()).min(1),
  size: z.number().positive(),
  lineHeight: z.number().positive(),
  weight: z.number().int().min(100).max(900),
  fill: hexColourSchema,
  align: textAlignSchema,
  letterSpacing: z.number().default(0),
  opacity: z.number().min(0).max(1).default(1),
});

export const frameBlockSchema = z.discriminatedUnion("kind", [rectBlockSchema, ellipseBlockSchema, imageBlockSchema, textBlockSchema]);

export const frameSpecSchema = z.object({
  /** Stable within one variant, so a frame keeps its identity across recompositions. */
  key: z.string().min(1),
  /** What this frame is, in the words a person would use. */
  label: z.string().min(1),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  background: fillSchema,
  blocks: z.array(frameBlockSchema),
  /** True when some text had to be dropped to fit; the caller decides whether that matters. */
  truncated: z.boolean().default(false),
});

export type RectBlock = z.infer<typeof rectBlockSchema>;
export type EllipseBlock = z.infer<typeof ellipseBlockSchema>;
export type ImageBlock = z.infer<typeof imageBlockSchema>;
export type TextBlock = z.infer<typeof textBlockSchema>;
export type FrameBlock = z.infer<typeof frameBlockSchema>;
export type FrameSpec = z.infer<typeof frameSpecSchema>;

/**
 * Where a gradient starts and ends inside a box, as fractions of it.
 *
 * Shared by all three renderers so a gradient points the same way in the preview, the PNG and
 * the server-rendered file. Computing it separately in each is how the same frame ends up with
 * three slightly different pictures.
 */
export function gradientVector(angle: number) {
  const radians = (angle * Math.PI) / 180;
  const dx = Math.cos(radians) / 2;
  const dy = Math.sin(radians) / 2;
  return { x1: 0.5 - dx, y1: 0.5 - dy, x2: 0.5 + dx, y2: 0.5 + dy };
}
