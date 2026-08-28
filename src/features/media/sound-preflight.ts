import { isDemoMode } from "@/lib/env";
import { getOrganizationContext } from "@/features/organizations/context";
import { buildNarration } from "@/server/media/narration";
import { buildMusicBrief } from "@/server/media/soundtrack";
import { findAsset, MUSIC_SLOT, VOICEOVER_SLOT } from "@/server/media/voiceover-asset";
import { toProfile } from "@/server/media/brand-voice";
import { estimateCost, ratesFromEnv } from "@/server/spend/pricing";
import { formatMoney } from "@/server/spend/money";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";

// What a piece's audio would involve, worked out before the page renders.
//
// Read on the server rather than fetched from an effect: the answer is already available where
// the piece is loaded, and going back for it would add a round trip, a loading flash, and a
// second place deciding what gets produced.
//
// Voice and music are reported separately because they are separate decisions with separate
// prices. A piece can reasonably have one and not the other, and a single "audio" state would
// hide which.

export interface TrackState {
  /** False when the piece has nothing of this kind to produce at all. */
  possible: boolean;
  /** What producing it would cost, in words, shown before anything is spent. */
  estimate: string | null;
  existing: { durationSeconds: number | null; generatedBy: string; url: string | null } | null;
}

export interface SoundPreflight {
  voice: TrackState;
  music: TrackState;
  /** The brand has not said how it wants to be read, which blocks both. */
  needsProfile: boolean;
}

const NOTHING: TrackState = { possible: false, estimate: null, existing: null };

export async function getSoundPreflight(
  contentItemId: string,
  contentVersion: number,
  variant: PlatformContentVariant | null,
  pillar: string,
): Promise<SoundPreflight> {
  if (!variant) return { voice: NOTHING, music: NOTHING, needsProfile: false };

  const rates = ratesFromEnv(process.env);
  const narration = buildNarration(variant);

  if (isDemoMode) {
    // Demo has no database behind it, so it prices what it can and claims nothing exists.
    const brief = buildMusicBrief(variant, "cercana", pillar);
    return {
      voice: narration
        ? { possible: true, estimate: formatMoney(estimateCost({ operation: "media.tts", text: narration.text }, rates)), existing: null }
        : NOTHING,
      music: brief
        ? { possible: true, estimate: formatMoney(estimateCost({ operation: "media.music", seconds: brief.seconds }, rates)), existing: null }
        : NOTHING,
      needsProfile: false,
    };
  }

  const ctx = await getOrganizationContext();
  if (!ctx) return { voice: NOTHING, music: NOTHING, needsProfile: false };

  const [brand, voiceAsset, musicAsset] = await Promise.all([
    ctx.db.from("brands").select("voice_tone,voice_region,voice_gender").eq("organization_id", ctx.orgId).limit(1).maybeSingle(),
    findAsset(ctx.db, contentItemId, contentVersion, VOICEOVER_SLOT),
    findAsset(ctx.db, contentItemId, contentVersion, MUSIC_SLOT),
  ]);

  const profile = toProfile(brand.data as { voice_tone: string | null; voice_region: string | null; voice_gender: string | null } | null);
  const brief = profile ? buildMusicBrief(variant, profile.tone, pillar, voiceAsset?.durationSeconds ?? null) : null;

  // One signing call for whatever actually exists.
  const paths = [voiceAsset?.storagePath, musicAsset?.storagePath].filter(Boolean) as string[];
  const signed = paths.length > 0 ? await ctx.db.storage.from("content-assets").createSignedUrls(paths, 3600) : null;
  const urlFor = (path?: string) =>
    (path && signed?.data?.find((entry) => entry.path === path)?.signedUrl) ?? null;

  return {
    voice: narration
      ? {
          possible: true,
          estimate: formatMoney(estimateCost({ operation: "media.tts", text: narration.text }, rates)),
          existing: voiceAsset
            ? { durationSeconds: voiceAsset.durationSeconds, generatedBy: voiceAsset.generatedBy, url: urlFor(voiceAsset.storagePath) }
            : null,
        }
      : NOTHING,
    music: brief
      ? {
          possible: true,
          estimate: formatMoney(estimateCost({ operation: "media.music", seconds: brief.seconds }, rates)),
          existing: musicAsset
            ? { durationSeconds: musicAsset.durationSeconds, generatedBy: musicAsset.generatedBy, url: urlFor(musicAsset.storagePath) }
            : null,
        }
      : NOTHING,
    // Music needs only the tone; both are blocked when the brand has chosen nothing at all.
    needsProfile: !profile,
  };
}
