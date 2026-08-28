import { isDemoMode } from "@/lib/env";
import { getOrganizationContext } from "@/features/organizations/context";
import { buildNarration } from "@/server/media/narration";
import { findVoiceover } from "@/server/media/voiceover-asset";
import { estimateCost, ratesFromEnv } from "@/server/spend/pricing";
import { formatMoney } from "@/server/spend/money";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";

// What producing a voiceover for this piece would involve, worked out before the page renders.
//
// Read on the server rather than fetched from an effect: the answer is already available where
// the piece is loaded, and going back for it would add a round trip, a loading flash, and a
// second place that decides what gets narrated.

export interface VoiceoverPreflight {
  hasNarration: boolean;
  characters: number;
  /** What it would cost, in words, shown before anything is spent. */
  estimate: string | null;
  existing: {
    durationSeconds: number | null;
    generatedBy: string;
    /**
     * A short-lived signed link. The bucket is private, so there is no address that works
     * without one, and minting it per view keeps a copied URL from outliving the session.
     */
    url: string | null;
  } | null;
}

export async function getVoiceoverPreflight(
  contentItemId: string,
  contentVersion: number,
  variant: PlatformContentVariant | null,
): Promise<VoiceoverPreflight> {
  const empty: VoiceoverPreflight = { hasNarration: false, characters: 0, estimate: null, existing: null };
  if (!variant) return empty;

  const narration = buildNarration(variant);
  if (!narration) return empty;

  const characters = [...narration.text].length;
  const estimate = formatMoney(estimateCost({ operation: "media.tts", text: narration.text }, ratesFromEnv(process.env)));

  // Demo has no database behind it, so it reports the cost without claiming anything exists.
  if (isDemoMode) return { hasNarration: true, characters, estimate, existing: null };

  const ctx = await getOrganizationContext();
  if (!ctx) return { hasNarration: true, characters, estimate, existing: null };

  const existing = await findVoiceover(ctx.db, contentItemId, contentVersion);
  if (!existing) return { hasNarration: true, characters, estimate, existing: null };

  // Signed with the member's own client, not the service role: the bucket policy already grants
  // read to members of the organization the path belongs to, so nothing needs elevating.
  const signed = await ctx.db.storage.from("content-assets").createSignedUrl(existing.storagePath, 3600);

  return {
    hasNarration: true,
    characters,
    estimate,
    existing: {
      durationSeconds: existing.durationSeconds,
      generatedBy: existing.generatedBy,
      url: signed.data?.signedUrl ?? null,
    },
  };
}
