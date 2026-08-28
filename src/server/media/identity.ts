import { z } from "zod";

// The visual tokens a composed frame is drawn with.
//
// These are Spectro's system defaults, not a claim about anyone's brand. The brand context
// today carries `visualInstructions` as free text and no palette, so there is nothing truthful
// to derive colours from yet; inventing a palette and presenting it as the organization's would
// be the visual equivalent of a fabricated metric. When brand identity gains real tokens this
// schema is what they populate, and every composition picks them up without changing.

export const brandIdentitySchema = z.object({
  /** Frame background. */
  surface: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** Primary text on that surface. */
  ink: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** Secondary text: supporting lines, labels. */
  muted: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** The one colour that carries emphasis. */
  accent: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** Text drawn on top of the accent. */
  onAccent: z.string().regex(/^#[0-9a-f]{6}$/i),
  /** Family list; the renderer is responsible for having something usable in it. */
  fontFamily: z.string().min(1),
});

export type BrandIdentity = z.infer<typeof brandIdentitySchema>;

export const SPECTRO_IDENTITY: BrandIdentity = {
  surface: "#102b2a",
  ink: "#ffffff",
  muted: "#9dbdb4",
  accent: "#16a47a",
  onAccent: "#04211a",
  fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
};

/** The light counterpart, for frames that should read as paper rather than screen. */
export const SPECTRO_IDENTITY_LIGHT: BrandIdentity = {
  surface: "#f4f6f4",
  ink: "#102b2a",
  muted: "#5d6f6b",
  accent: "#16a47a",
  onAccent: "#ffffff",
  fontFamily: "Inter, 'Helvetica Neue', Arial, sans-serif",
};
