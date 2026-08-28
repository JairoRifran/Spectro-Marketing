import { z } from "zod";
import { ceilMicros, microsSchema, type Micros } from "./money";

// What an operation is expected to cost, before it runs.
//
// The rates here are CONFIGURATION, not facts. Vendor pricing changes, is tiered, and is often
// quoted in credits rather than currency — so a number written into this file is out of date the
// moment it is committed. What the code owns is the shape of the calculation; the rate itself is
// set per deployment and has to be checked against the vendor's current pricing page.
//
// Defaults deliberately overestimate. An estimate that is too high refuses a call that would
// have fitted, which is an annoyance; an estimate that is too low authorises a call that breaks
// the ceiling, which is a bill. Those costs are not symmetrical.
//
// The three operations bill in different units, and pretending otherwise would misprice two of
// them: speech is charged by the characters sent, while sound and music are charged by the
// seconds produced.

export const rateCardSchema = z.object({
  /** Cost of one character of synthesised speech. */
  ttsPerCharacterMicros: microsSchema,
  /** Cost of one second of generated sound effect. */
  sfxPerSecondMicros: microsSchema,
  /** Cost of one second of composed music. */
  musicPerSecondMicros: microsSchema,
  /** Charged even for a request that produces almost nothing, covering per-call overhead. */
  minimumChargeMicros: microsSchema,
});
export type RateCard = z.infer<typeof rateCardSchema>;

/**
 * Deliberately pessimistic defaults: roughly US$0.30 per thousand characters of speech, and a
 * few cents per second of generated audio. Real pricing at the time of writing is generally
 * below these, which is the point — the ceiling should bind before the invoice does. Override
 * them per deployment once the actual plan is known.
 */
export const CONSERVATIVE_RATES: RateCard = {
  ttsPerCharacterMicros: 300,
  sfxPerSecondMicros: 20_000,
  musicPerSecondMicros: 30_000,
  minimumChargeMicros: 1_000,
};

export const paidOperationSchema = z.enum(["media.tts", "media.sfx", "media.music", "media.image"]);
export type PaidOperation = z.infer<typeof paidOperationSchema>;

export interface TtsEstimateInput {
  operation: "media.tts";
  /** The text that will actually be sent. Not the script, not the brief — the billed string. */
  text: string;
}

export interface TimedEstimateInput {
  operation: "media.sfx" | "media.music";
  /** The length that will actually be requested. Billing follows the request, not the result. */
  seconds: number;
}

export type EstimateInput = TtsEstimateInput | TimedEstimateInput;

/**
 * Estimates in whole micros, rounding up.
 *
 * Each operation is measured in the unit it is billed in. Estimating sound by its prompt length,
 * or speech by its duration, would enforce the ceiling against a number unrelated to the invoice.
 */
export function estimateCost(input: EstimateInput, rates: RateCard = CONSERVATIVE_RATES): Micros {
  if (input.operation === "media.tts") {
    const characters = [...input.text].length;
    return Math.max(ceilMicros(characters * rates.ttsPerCharacterMicros), rates.minimumChargeMicros);
  }
  const perSecond = input.operation === "media.music" ? rates.musicPerSecondMicros : rates.sfxPerSecondMicros;
  const seconds = Math.max(0, input.seconds);
  return Math.max(ceilMicros(seconds * perSecond), rates.minimumChargeMicros);
}

function readRate(value: string | undefined, fallback: number): number {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
}

/** Rates from the environment, falling back to the conservative defaults when unset. */
export function ratesFromEnv(env: Record<string, string | undefined>): RateCard {
  const candidate = {
    ttsPerCharacterMicros: readRate(env.SPECTRO_TTS_MICROS_PER_CHARACTER, CONSERVATIVE_RATES.ttsPerCharacterMicros),
    sfxPerSecondMicros: readRate(env.SPECTRO_SFX_MICROS_PER_SECOND, CONSERVATIVE_RATES.sfxPerSecondMicros),
    musicPerSecondMicros: readRate(env.SPECTRO_MUSIC_MICROS_PER_SECOND, CONSERVATIVE_RATES.musicPerSecondMicros),
    minimumChargeMicros: readRate(env.SPECTRO_MINIMUM_CHARGE_MICROS, CONSERVATIVE_RATES.minimumChargeMicros),
  };
  const parsed = rateCardSchema.safeParse(candidate);
  return parsed.success ? parsed.data : CONSERVATIVE_RATES;
}
