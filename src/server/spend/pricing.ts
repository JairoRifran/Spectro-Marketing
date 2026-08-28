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

export const rateCardSchema = z.object({
  /** Cost of one character of synthesised speech. */
  ttsPerCharacterMicros: microsSchema,
  /** Charged even for a request that produces almost nothing, covering per-call overhead. */
  minimumChargeMicros: microsSchema,
});
export type RateCard = z.infer<typeof rateCardSchema>;

/**
 * A deliberately pessimistic default: roughly US$0.30 per thousand characters. Real pricing at
 * the time of writing is generally below this, which is the point — the ceiling should bind
 * before the invoice does. Override it per deployment once the actual plan is known.
 */
export const CONSERVATIVE_RATES: RateCard = {
  ttsPerCharacterMicros: 300,
  minimumChargeMicros: 1_000,
};

export const paidOperationSchema = z.enum(["media.tts"]);
export type PaidOperation = z.infer<typeof paidOperationSchema>;

export interface TtsEstimateInput {
  operation: "media.tts";
  /** The text that will actually be sent. Not the script, not the brief — the billed string. */
  text: string;
}

export type EstimateInput = TtsEstimateInput;

/**
 * Estimates in whole micros, rounding up.
 *
 * The billed unit is the character count of the exact string sent to the vendor, so the estimate
 * measures that string rather than anything upstream of it. Estimating from the script and then
 * sending something longer is how a ceiling gets quietly exceeded.
 */
export function estimateCost(input: EstimateInput, rates: RateCard = CONSERVATIVE_RATES): Micros {
  const characters = [...input.text].length;
  const variable = ceilMicros(characters * rates.ttsPerCharacterMicros);
  return Math.max(variable, rates.minimumChargeMicros);
}

/** Rates from the environment, falling back to the conservative defaults when unset. */
export function ratesFromEnv(env: Record<string, string | undefined>): RateCard {
  const perCharacter = Number(env.SPECTRO_TTS_MICROS_PER_CHARACTER);
  const minimum = Number(env.SPECTRO_MINIMUM_CHARGE_MICROS);
  const candidate = {
    ttsPerCharacterMicros: Number.isInteger(perCharacter) && perCharacter >= 0 ? perCharacter : CONSERVATIVE_RATES.ttsPerCharacterMicros,
    minimumChargeMicros: Number.isInteger(minimum) && minimum >= 0 ? minimum : CONSERVATIVE_RATES.minimumChargeMicros,
  };
  const parsed = rateCardSchema.safeParse(candidate);
  return parsed.success ? parsed.data : CONSERVATIVE_RATES;
}
