import { z } from "zod";
import type { PlatformContentVariant } from "../content/schemas/variant";
import type { VoiceTone } from "./voice-profile";

// What a piece's music should sound like, derived from the piece rather than invented.
//
// The brief is built from things the campaign already decided — its tone, its pillar, the
// platform it is going to — so the music belongs to the piece instead of being a stock bed
// somebody picked. It is deterministic: the same piece always asks for the same music, which is
// what makes a regeneration comparable and a cost predictable.
//
// Instrumental always. A voiceover and a vocal track compete for the same attention, and a piece
// that has both is a piece where neither is heard. That is a decision worth stating rather than
// leaving to whatever the vendor defaults to.

/** Documented bounds of the vendor's music endpoint, in seconds. */
export const MUSIC_MIN_SECONDS = 3;
export const MUSIC_MAX_SECONDS = 600;

/** Documented bounds of the vendor's sound effect endpoint, in seconds. */
export const SFX_MIN_SECONDS = 0.5;
export const SFX_MAX_SECONDS = 30;

export const musicBriefSchema = z.object({
  prompt: z.string().trim().min(1).max(600),
  seconds: z.number().min(MUSIC_MIN_SECONDS).max(MUSIC_MAX_SECONDS),
  instrumental: z.literal(true),
});
export type MusicBrief = z.infer<typeof musicBriefSchema>;

const TONE_MUSIC: Record<VoiceTone, string> = {
  reflexiva: "calmada y espaciosa, con pulso lento y textura suave",
  entusiasta: "enérgica y luminosa, con pulso marcado y sensación de avance",
  comercial: "moderna y con impulso, decidida sin ser agresiva",
  cercana: "cálida y liviana, cotidiana, sin dramatismo",
  autoritaria: "sobria y firme, con peso y poco adorno",
  informativa: "neutra y discreta, que no compita con la voz",
};

const PLATFORM_FEEL: Record<string, string> = {
  tiktok: "para video vertical corto, que enganche en los primeros segundos",
  youtube_shorts: "para video vertical corto, que sostenga hasta el final",
  instagram: "para video vertical corto de marca",
  facebook: "para video de marca",
  linkedin: "para video profesional de marca",
};

/**
 * Clamps a requested length into what the vendor accepts.
 *
 * Asking for something outside the range is a rejected call that still took a round trip, and a
 * silently truncated one is worse: the piece would come back shorter than the script it was
 * written for with nothing saying so.
 */
export function clampMusicSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return MUSIC_MIN_SECONDS;
  return Math.min(MUSIC_MAX_SECONDS, Math.max(MUSIC_MIN_SECONDS, Math.round(seconds)));
}

export function clampSfxSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return SFX_MIN_SECONDS;
  return Math.min(SFX_MAX_SECONDS, Math.max(SFX_MIN_SECONDS, Math.round(seconds * 2) / 2));
}

/** How long the piece runs, according to its own script. */
export function scriptSeconds(variant: PlatformContentVariant): number | null {
  if (variant.detail.shape === "video") return variant.detail.script.estimatedDurationSeconds;
  if (variant.detail.shape === "story") {
    return variant.detail.story.frames.reduce((total, frame) => total + frame.durationSeconds, 0);
  }
  return null;
}

/**
 * The music brief, or nothing when the piece has no soundtrack to speak of.
 *
 * A carousel and a text post are read in silence; scoring them would be producing something
 * nobody asked for and charging for it, the same reason they get no voiceover.
 */
export function buildMusicBrief(
  variant: PlatformContentVariant,
  tone: VoiceTone,
  pillar: string,
  voiceoverSeconds?: number | null,
): MusicBrief | null {
  const scripted = scriptSeconds(variant);
  if (scripted === null) return null;

  // The voice is the fact and the script is the intent, so where a voiceover exists its real
  // length wins: music that ends before the narration is worse than music that was never made.
  const seconds = clampMusicSeconds(voiceoverSeconds && voiceoverSeconds > 0 ? voiceoverSeconds : scripted);

  const feel = PLATFORM_FEEL[variant.platform] ?? "para video de marca";
  const subject = pillar.trim() ? `sobre ${pillar.trim().toLowerCase()}` : "de marca";

  return {
    prompt: `Musica instrumental de fondo ${feel}, ${subject}. Caracter: ${TONE_MUSIC[tone]}. Sin voces, sin letra, mezcla que deje lugar a una narracion encima.`,
    seconds,
    instrumental: true,
  };
}
