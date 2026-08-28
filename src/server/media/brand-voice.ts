import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deliveryFor,
  selectVoice,
  voiceProfileSchema,
  type CatalogueVoice,
  type Delivery,
  type VoiceProfile,
} from "./voice-profile";

// Reading a brand's voice out of the database and turning it into a concrete request.
//
// Two failures are represented rather than papered over, because both are things a person has to
// fix and neither has a safe default:
//
//   * The brand never chose a voice. Guessing a tone would be inventing an editorial decision.
//   * The brand chose a profile it has no voice for. Substituting a different accent would ship
//     the wrong voice and nobody would notice until it was published.

export type BrandVoiceProblem = "no_profile" | "no_matching_voice";

export interface ResolvedVoice {
  profile: VoiceProfile;
  voice: CatalogueVoice;
  delivery: Delivery;
}

export type BrandVoiceResolution =
  | { ok: true; resolved: ResolvedVoice }
  | { ok: false; problem: BrandVoiceProblem; profile?: VoiceProfile };

interface BrandRow {
  voice_tone: string | null;
  voice_region: string | null;
  voice_gender: string | null;
}

interface VoiceRow {
  provider_voice_id: string;
  region: string;
  gender: string;
  label: string;
}

/** The catalogue as the domain understands it, dropping rows the vocabulary does not cover. */
export function toCatalogue(rows: VoiceRow[] | null): CatalogueVoice[] {
  return (rows ?? []).flatMap((row) => {
    const parsed = voiceProfileSchema
      .pick({ region: true, gender: true })
      .safeParse({ region: row.region, gender: row.gender });
    // A row the vocabulary does not recognise is skipped rather than coerced: it would otherwise
    // be silently offered as a region it is not.
    if (!parsed.success) return [];
    return [{ providerVoiceId: row.provider_voice_id, region: parsed.data.region, gender: parsed.data.gender, label: row.label }];
  });
}

/** The brand's chosen profile, or nothing if it never chose one. */
export function toProfile(brand: BrandRow | null): VoiceProfile | null {
  if (!brand?.voice_tone || !brand.voice_region) return null;
  const parsed = voiceProfileSchema.safeParse({
    tone: brand.voice_tone,
    region: brand.voice_region,
    gender: brand.voice_gender ?? "indistinta",
  });
  return parsed.success ? parsed.data : null;
}

/** Pure: given what the database holds, decide what to ask the provider for. */
export function resolveBrandVoice(brand: BrandRow | null, rows: VoiceRow[] | null): BrandVoiceResolution {
  const profile = toProfile(brand);
  if (!profile) return { ok: false, problem: "no_profile" };

  const voice = selectVoice(profile, toCatalogue(rows));
  if (!voice) return { ok: false, problem: "no_matching_voice", profile };

  return { ok: true, resolved: { profile, voice, delivery: deliveryFor(profile.tone) } };
}

/** A short, user-facing reason. Never an internal code on its own. */
export function brandVoiceMessage(problem: BrandVoiceProblem, profile?: VoiceProfile): string {
  if (problem === "no_profile") {
    return "Esta marca todavia no eligio como quiere que la lean. Configura tono y region antes de generar voz.";
  }
  const region = profile?.region ?? "esa region";
  return `No hay ninguna voz cargada para ${region}. Agrega una antes de generar, en vez de usar otro acento.`;
}

/** Reads both, in one round trip, and resolves them. */
export async function loadBrandVoice(db: SupabaseClient, organizationId: string): Promise<BrandVoiceResolution> {
  const [brand, voices] = await Promise.all([
    db.from("brands").select("voice_tone,voice_region,voice_gender").eq("organization_id", organizationId).limit(1).maybeSingle(),
    db.from("brand_voices").select("provider_voice_id,region,gender,label").eq("organization_id", organizationId),
  ]);
  return resolveBrandVoice(brand.data as BrandRow | null, voices.data as VoiceRow[] | null);
}
