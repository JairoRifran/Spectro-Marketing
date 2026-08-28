import { isDemoMode } from "@/lib/env";
import { getOrganizationContext } from "@/features/organizations/context";
import { MUSIC_SLOT, VOICEOVER_SLOT } from "@/server/media/voiceover-asset";

// The pictures a piece already has, keyed by the slot its composition refers to.
//
// One query and one signing call for the whole piece. Signing per frame would be a storage round
// trip per slide just to open a carousel, which is the same mistake the gallery made with audio.

export type FrameImages = Record<string, string>;

export async function getFrameImages(contentItemId: string, contentVersion: number): Promise<FrameImages> {
  // Demo has no bucket behind it, and a walkthrough that reaches for one would just fail slowly.
  if (isDemoMode) return {};

  const ctx = await getOrganizationContext();
  if (!ctx) return {};

  const { data } = await ctx.db
    .from("content_assets")
    .select("slot,storage_path")
    .eq("organization_id", ctx.orgId)
    .eq("content_item_id", contentItemId)
    .eq("content_version", contentVersion)
    .eq("kind", "image");

  const rows = (data ?? []) as Array<{ slot: string; storage_path: string }>;
  // Audio shares the asset table, so a slot that is a track is skipped rather than offered as a
  // picture no renderer could draw.
  const pictures = rows.filter((row) => row.slot !== VOICEOVER_SLOT && row.slot !== MUSIC_SLOT);
  if (pictures.length === 0) return {};

  const signed = await ctx.db.storage.from("content-assets").createSignedUrls(pictures.map((row) => row.storage_path), 3600);

  const images: FrameImages = {};
  for (const row of pictures) {
    const url = signed.data?.find((entry) => entry.path === row.storage_path)?.signedUrl;
    if (url) images[row.slot] = url;
  }
  return images;
}
