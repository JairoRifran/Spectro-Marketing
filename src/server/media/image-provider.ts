import { z } from "zod";
import { encodePng } from "@/lib/png";
import { MediaProviderError } from "./provider";
import { seedOf } from "./palette";

// Generating pictures, behind the same posture as every other provider: nothing above this line
// knows which service is behind it, and each implementation maps its own failures onto typed
// errors rather than leaving callers to read somebody else's error strings.
//
// One thing is part of the contract rather than left to each implementation: whether it charges.
// A free provider must not be dragged through the spend ceiling — a reservation for nothing is a
// row that makes the ledger harder to reconcile against an invoice, which is the only thing the
// ledger is for. A paid one must never skip it.

export const imageRequestSchema = z.object({
  /** What to draw, in words. Built from the piece's own visual direction, never invented here. */
  prompt: z.string().trim().min(1).max(1_000),
  width: z.number().int().min(64).max(2048),
  height: z.number().int().min(64).max(2048),
  /** Same seed, same picture. What makes a regeneration comparable instead of a lottery. */
  seed: z.number().int().nonnegative(),
});
export type ImageRequest = z.infer<typeof imageRequestSchema>;

export interface ImageResult {
  bytes: Uint8Array;
  mimeType: string;
  /** Set by anything that is not a real service, so placeholder art cannot pass as generated. */
  generatedBy: "mock" | "provider";
  providerRef?: string;
}

export interface ImageProvider {
  readonly name: string;
  /**
   * Whether using this provider costs money. False means it does not go through the ceiling at
   * all; the ledger exists to be reconciled against a bill, and rows worth nothing only make
   * that harder.
   */
  readonly charges: boolean;
  /** What one image costs, when it costs anything. Ignored when `charges` is false. */
  readonly costPerImageMicros: number;
  generateImage(request: ImageRequest): Promise<ImageResult>;
}

/**
 * A provider that draws something recognisably placeholder, offline and instantly.
 *
 * It returns a real PNG rather than invented bytes, and what it draws could not be mistaken for
 * a generated picture: a soft two-colour field derived from the prompt, so different prompts
 * differ and the same prompt is always identical.
 */
export class MockImageProvider implements ImageProvider {
  readonly name = "mock";
  readonly charges = false;
  readonly costPerImageMicros = 0;

  async generateImage(request: ImageRequest): Promise<ImageResult> {
    const parsed = imageRequestSchema.safeParse(request);
    if (!parsed.success) {
      throw new MediaProviderError("invalid_request", this.name, "La solicitud de imagen no es valida.");
    }

    const { width, height, prompt, seed } = parsed.data;
    const hue = (seedOf(prompt) + seed) % 360;
    // Rendered small and reported at its true size: a placeholder does not need the pixels, and
    // a full-size one would be megabytes of nothing in the asset store.
    const scaleW = Math.min(width, 256);
    const scaleH = Math.max(1, Math.round((scaleW * height) / width));

    const bytes = encodePng({
      width: scaleW,
      height: scaleH,
      pixel: (x, y) => {
        const t = (x / scaleW) * 0.6 + (y / scaleH) * 0.4;
        const shade = 60 + t * 90;
        return {
          r: Math.round(shade + (hue % 60)),
          g: Math.round(shade * 0.9 + ((hue >> 3) % 40)),
          b: Math.round(shade * 1.05 + ((hue >> 5) % 50)),
        };
      },
    });

    return { bytes, mimeType: "image/png", generatedBy: "mock" };
  }
}
