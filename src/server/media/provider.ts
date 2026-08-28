import { z } from "zod";
import type { Micros } from "../spend/money";
import { deliverySchema } from "./voice-profile";

// The provider-neutral contract for producing media.
//
// Same posture as AgentProvider: the code above this line must never know which vendor is
// behind it, and no vendor's API shape is allowed to leak upward. A provider maps its own
// failures onto the typed errors here, so a caller can decide what to do without parsing a
// message written by somebody else's error handler.
//
// Two things are deliberately part of the contract rather than left to each implementation:
//
//   * `billedCharacters` — what the vendor will actually charge for. The estimate has to be
//     built from the exact string that gets sent, not from anything upstream of it, or the
//     ceiling is enforced against a number that has nothing to do with the invoice.
//   * `costMicros` on the result — what it really cost, when the vendor says so. Settling with
//     the estimate is a fallback, not the normal path.

export const speechRequestSchema = z.object({
  /** The exact string that will be sent. This is what gets billed and what gets estimated. */
  text: z.string().trim().min(1).max(5_000),
  /**
   * The provider's own voice identifier, already resolved from the profile the brand asked for.
   * Callers pick it with `selectVoice`; nothing downstream guesses one.
   */
  voiceId: z.string().trim().min(1).max(200),
  /** BCP-47, so a provider can pick a pronunciation model without guessing from the text. */
  language: z.string().trim().min(2).max(12).default("es-UY"),
  /**
   * How it should be read, in vendor-neutral terms. Absent means the provider's own neutral
   * default rather than a guess at what the brand wanted.
   */
  delivery: deliverySchema.optional(),
});
export type SpeechRequest = z.infer<typeof speechRequestSchema>;

export interface SpeechResult {
  bytes: Uint8Array;
  mimeType: string;
  /**
   * Absent when the provider cannot cheaply know it. A vendor returning compressed audio would
   * have to be decoded to measure, and a fabricated length is worse than an honest gap.
   */
  durationSeconds?: number;
  /** What the vendor reported charging, when it reports one at all. */
  costMicros?: Micros;
  /** The vendor's own identifier for the call, for reconciling against an invoice. */
  providerRef?: string;
  /** Set by anything that is not a real vendor, so mock output can never pass as real. */
  generatedBy: "mock" | "provider";
}

export type MediaFailureReason =
  /** The vendor could not be reached, or answered with something unusable. */
  | "unavailable"
  /** The vendor refused this specific request: bad voice, unsupported language, blocked text. */
  | "rejected"
  /** The vendor's own quota or rate limit, which is not Spectro's ceiling. */
  | "quota_exceeded"
  /** The request never should have been sent; a bug on this side. */
  | "invalid_request";

export class MediaProviderError extends Error {
  constructor(readonly reason: MediaFailureReason, readonly provider: string, message?: string) {
    super(message ?? reason);
    this.name = "MediaProviderError";
  }

  /** Whether trying again could plausibly succeed without anything else changing. */
  get retryable() {
    return this.reason === "unavailable" || this.reason === "quota_exceeded";
  }
}

/**
 * A voice the account has, as the vendor describes it.
 *
 * The vendor's own labels are carried through as hints and nothing more. An accent labelled
 * "latin american" is not a region in this system's vocabulary, and mapping it automatically
 * would assign a Mexican voice to a Rioplatense brand on a guess. A person assigns the region.
 */
export interface AvailableVoice {
  providerVoiceId: string;
  name: string;
  /** Vendor labels verbatim: accent, gender, age, use case. Suggestions for a human, not a map. */
  labels: Record<string, string>;
  category?: string;
  description?: string;
  previewUrl?: string;
}

export interface MediaProvider {
  readonly name: string;
  /** What this request will be billed for, before it is sent. */
  billedCharacters(request: SpeechRequest): number;
  synthesizeSpeech(request: SpeechRequest): Promise<SpeechResult>;
  /**
   * The voices this account has, when the provider can enumerate them. Optional because not
   * every provider will, and pretending otherwise would force a fake implementation.
   */
  listVoices?(): Promise<AvailableVoice[]>;
}
