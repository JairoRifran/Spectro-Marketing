// The voice vocabulary, shared by the pages that render it and the domain that validates it.
//
// The lists live here rather than in `src/server` because a client component needs the options
// and the labels to draw a form, and reaching into server domain code for them blurs a boundary
// worth keeping. The zod enums are built from these arrays, so there is one source of truth and
// the two cannot drift into disagreeing about what a region is.

export const VOICE_TONES = ["reflexiva", "entusiasta", "comercial", "cercana", "autoritaria", "informativa"] as const;
export const VOICE_REGIONS = ["rioplatense", "mexicana", "castellana", "colombiana", "neutra"] as const;
export const VOICE_GENDERS = ["femenina", "masculina", "indistinta"] as const;

export type VoiceToneName = (typeof VOICE_TONES)[number];
export type VoiceRegionName = (typeof VOICE_REGIONS)[number];
export type VoiceGenderName = (typeof VOICE_GENDERS)[number];

/** What a person sees when choosing. Each says what the tone is for, not just what it is called. */
export const TONE_LABEL: Record<VoiceToneName, string> = {
  reflexiva: "Reflexiva — pausada, para explicar algo que requiere atención",
  entusiasta: "Entusiasta — con energía, para algo que celebra o lanza",
  comercial: "Comercial — persuasiva, para una oferta o un llamado directo",
  cercana: "Cercana — conversacional, como hablarle a una persona",
  autoritaria: "Autoritaria — firme, para una postura o un dato duro",
  informativa: "Informativa — neutra, para datos y procedimientos",
};

export const REGION_LABEL: Record<VoiceRegionName, string> = {
  rioplatense: "Rioplatense (Uruguay, Argentina)",
  mexicana: "Mexicana",
  castellana: "Castellana (España)",
  colombiana: "Colombiana",
  neutra: "Español neutro",
};

export const GENDER_LABEL: Record<VoiceGenderName, string> = {
  femenina: "Femenina",
  masculina: "Masculina",
  indistinta: "Indistinta",
};

/**
 * Friendly names for the language codes a provider labels its voices with.
 *
 * A lookup, not a list of what exists: the filter is built from the languages an account
 * actually has, so a voice in a language missing from this map is still offered — under its raw
 * code rather than hidden. Hard-coding the options would quietly drop every voice outside them.
 */
const LANGUAGE_NAMES: Record<string, string> = {
  es: "Español",
  en: "Inglés",
  pt: "Portugués",
  fr: "Francés",
  it: "Italiano",
  de: "Alemán",
  ja: "Japonés",
};

export function languageLabel(code: string): string {
  return LANGUAGE_NAMES[code.toLowerCase()] ?? code.toUpperCase();
}

/** The languages present in a set of voices, named and ordered for a dropdown. */
export function languagesPresent(voices: Array<{ labels: Record<string, string> }>) {
  const codes = new Set<string>();
  for (const voice of voices) {
    const code = voice.labels.language?.trim().toLowerCase();
    if (code) codes.add(code);
  }
  return [...codes].sort().map((code) => ({ code, label: languageLabel(code) }));
}
