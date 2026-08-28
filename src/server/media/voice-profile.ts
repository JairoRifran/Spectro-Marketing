import { z } from "zod";
import { VOICE_GENDERS, VOICE_REGIONS, VOICE_TONES } from "@/features/media/vocabulary";

// How an organization asks for a voice, without knowing anything about a vendor.
//
// Nobody configuring a brand should have to paste an identifier from somebody's dashboard. They
// should say "reflexiva, rioplatense" and have that mean something. So a profile is the request,
// and each provider is responsible for honouring it however its own API allows.
//
// The split matters and is not arbitrary:
//
//   * TONE is delivery. It maps onto settings a synthesiser genuinely exposes — how much
//     emotional range, how performed, how fast — so one voice can read reflectively or
//     enthusiastically.
//   * REGION and GENDER are not settings. No parameter turns a Castilian voice into a Rioplatense
//     one; that is a different voice. So they select which voice, from a catalogue of the ones
//     the organization actually has, and if nothing matches the answer is that nothing matches.
//     Quietly substituting another accent would ship the wrong voice for a brand.

// Built from the shared lists so the form and the validation cannot disagree about what exists.
export const voiceToneSchema = z.enum(VOICE_TONES);
export type VoiceTone = z.infer<typeof voiceToneSchema>;

export const voiceRegionSchema = z.enum(VOICE_REGIONS);
export type VoiceRegion = z.infer<typeof voiceRegionSchema>;

export const voiceGenderSchema = z.enum(VOICE_GENDERS);
export type VoiceGender = z.infer<typeof voiceGenderSchema>;

export const voiceProfileSchema = z.object({
  tone: voiceToneSchema,
  region: voiceRegionSchema,
  gender: voiceGenderSchema.default("indistinta"),
});
export type VoiceProfile = z.infer<typeof voiceProfileSchema>;

/**
 * Delivery in vendor-neutral terms.
 *
 * Deliberately not a copy of any vendor's fields with different names — that would be lock-in
 * wearing a neutral label. These are the three things a person actually means when they say a
 * read should be calmer or punchier, and each provider translates them into whatever it has.
 */
export const deliverySchema = z.object({
  /** How much the read is allowed to vary. Low is measured and even; high is animated. */
  expressiveness: z.number().min(0).max(1),
  /** How performed it is. Low is plain; high leans into the voice's character. */
  intensity: z.number().min(0).max(1),
  /** Speed against a natural read. Below 1 is slower. */
  pace: z.number().min(0.5).max(1.5),
});
export type Delivery = z.infer<typeof deliverySchema>;

/**
 * What each tone means as delivery.
 *
 * Chosen so the extremes stay usable rather than caricatured: a fully expressionless read sounds
 * synthetic and a fully exaggerated one sounds like a parody, and neither is what anybody wants
 * on a brand's channel.
 */
const TONE_DELIVERY: Record<VoiceTone, Delivery> = {
  reflexiva: { expressiveness: 0.25, intensity: 0.15, pace: 0.92 },
  entusiasta: { expressiveness: 0.8, intensity: 0.65, pace: 1.12 },
  comercial: { expressiveness: 0.65, intensity: 0.7, pace: 1.05 },
  cercana: { expressiveness: 0.55, intensity: 0.3, pace: 1.0 },
  autoritaria: { expressiveness: 0.3, intensity: 0.45, pace: 0.95 },
  informativa: { expressiveness: 0.35, intensity: 0.2, pace: 1.0 },
};

export function deliveryFor(tone: VoiceTone): Delivery {
  return TONE_DELIVERY[tone];
}

/** One voice an organization has available, described the way it was asked for. */
export interface CatalogueVoice {
  /** The provider's own identifier. Never shown to a person choosing a profile. */
  providerVoiceId: string;
  region: VoiceRegion;
  gender: VoiceGender;
  /** The operator's own name for it, for the interface. */
  label: string;
}

/**
 * Picks the voice for a profile, or nothing.
 *
 * Returning nothing is a real answer. Falling back to another region would ship a Castilian read
 * for a brand that asked for Rioplatense, and nobody would find out until it was published.
 * A gender of "indistinta" genuinely does not care, so it accepts any.
 */
export function selectVoice(profile: VoiceProfile, catalogue: CatalogueVoice[]): CatalogueVoice | null {
  const inRegion = catalogue.filter((voice) => voice.region === profile.region);
  if (inRegion.length === 0) return null;
  if (profile.gender === "indistinta") return inRegion[0];
  return inRegion.find((voice) => voice.gender === profile.gender) ?? null;
}
