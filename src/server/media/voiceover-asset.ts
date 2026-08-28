import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrandVoice, brandVoiceMessage } from "./brand-voice";
import { buildNarration } from "./narration";
import { buildMusicBrief } from "./soundtrack";
import { buildImageRequest } from "./image-brief";
import { getImageProvider } from "./pollinations-provider";
import { isDemoMode } from "@/lib/env";
import { getMediaProvider } from "./providers";
import { synthesizeVoiceover } from "./voiceover";
import { withBudget } from "../spend/ledger";
import { estimateCost, ratesFromEnv } from "../spend/pricing";
import type { PlatformContentVariant } from "../content/schemas/variant";

// Producing a piece's audio, and keeping it.
//
// The order is deliberate and each step earns its place:
//
//   1. An asset for this version already exists -> return it. Storage is what makes this
//      possible, and without it every look at the same audio would be a second charge.
//   2. Work out exactly what will be sent. That string, or that length, is what gets billed and
//      what the ceiling is checked against.
//   3. Resolve what the brand chose. A brand that has not chosen stops here rather than being
//      given a voice or a mood nobody picked.
//   4. Reserve, produce, store, settle.
//
// Files live under the organization's own folder, which is what the bucket policy derives
// membership from. Uploading goes through the service role: the bucket grants read to members
// and writes to nobody, because a browser never produces one of these.

export const VOICEOVER_SLOT = "voiceover";
export const MUSIC_SLOT = "music";

export type VoiceoverProblem =
  | { problem: "no_narration" }
  | { problem: "no_profile" }
  | { problem: "no_matching_voice"; message: string };

export type ImageProblem =
  | { problem: "no_direction" }
  | { problem: "unknown_slot" };

export type MusicProblem =
  | { problem: "no_soundtrack" }
  | { problem: "no_profile" }
  | { problem: "provider_cannot_compose" };

export interface MediaAsset {
  id: string;
  storagePath: string;
  mimeType: string;
  byteSize: number;
  durationSeconds: number | null;
  generatedBy: string;
  /** True when it was already there, so the caller can say nothing was spent. */
  reused: boolean;
}

interface ProduceInput {
  organizationId: string;
  campaignId: string | null;
  contentItemId: string;
  contentVersion: number;
  variant: PlatformContentVariant;
  /** Only music uses it, to say what the piece is about. */
  pillar?: string;
  /** Stable for one logical request; a retry must present the same one. */
  idempotencyKey: string;
}

const EXTENSION: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
};

export async function findAsset(db: SupabaseClient, contentItemId: string, contentVersion: number, slot: string): Promise<MediaAsset | null> {
  const { data } = await db
    .from("content_assets")
    .select("id,storage_path,mime_type,byte_size,duration_seconds,generated_by")
    .eq("content_item_id", contentItemId)
    .eq("content_version", contentVersion)
    .eq("slot", slot)
    .maybeSingle();
  if (!data) return null;
  return {
    id: data.id,
    storagePath: data.storage_path,
    mimeType: data.mime_type,
    byteSize: data.byte_size,
    durationSeconds: data.duration_seconds,
    generatedBy: data.generated_by,
    reused: true,
  };
}

export function findVoiceover(db: SupabaseClient, contentItemId: string, contentVersion: number) {
  return findAsset(db, contentItemId, contentVersion, VOICEOVER_SLOT);
}

export function findMusic(db: SupabaseClient, contentItemId: string, contentVersion: number) {
  return findAsset(db, contentItemId, contentVersion, MUSIC_SLOT);
}

/**
 * Uploads the bytes and records the row, as one step because they are one fact: a file in the
 * bucket with no row is invisible, and a row with no file is a broken link.
 */
async function storeAsset(
  admin: SupabaseClient,
  input: ProduceInput,
  slot: string,
  provider: string,
  result: { bytes: Uint8Array; mimeType: string; durationSeconds?: number; generatedBy: string },
): Promise<MediaAsset> {
  const extension = EXTENSION[result.mimeType] ?? "bin";
  // The first path segment is the organization: the bucket policy reads membership from it.
  const storagePath = `${input.organizationId}/${input.contentItemId}/v${input.contentVersion}/${slot}.${extension}`;

  const upload = await admin.storage.from("content-assets").upload(storagePath, result.bytes, {
    contentType: result.mimeType,
    upsert: true,
  });
  if (upload.error) throw new Error("storage_upload_failed");

  const { data, error } = await admin
    .from("content_assets")
    .upsert({
      organization_id: input.organizationId,
      campaign_id: input.campaignId,
      content_item_id: input.contentItemId,
      content_version: input.contentVersion,
      kind: "audio",
      slot,
      storage_path: storagePath,
      mime_type: result.mimeType,
      byte_size: result.bytes.length,
      duration_seconds: result.durationSeconds ?? null,
      generated_by: result.generatedBy,
      provider,
    }, { onConflict: "content_item_id,content_version,slot" })
    .select("id")
    .single();
  if (error) throw new Error("asset_record_failed");

  return {
    id: data.id,
    storagePath,
    mimeType: result.mimeType,
    byteSize: result.bytes.length,
    durationSeconds: result.durationSeconds ?? null,
    generatedBy: result.generatedBy,
    reused: false,
  };
}

/**
 * Produces the voiceover, or explains why it cannot.
 *
 * Every refusal is a distinct thing for a person to do next, so each is returned rather than
 * collapsed into one failure: there is nothing to narrate, the brand never chose a voice, or the
 * brand chose a region it has no voice for.
 */
export async function produceVoiceover(
  admin: SupabaseClient,
  input: ProduceInput,
): Promise<MediaAsset | VoiceoverProblem> {
  const existing = await findAsset(admin, input.contentItemId, input.contentVersion, VOICEOVER_SLOT);
  if (existing) return existing;

  const narration = buildNarration(input.variant);
  if (!narration) return { problem: "no_narration" };

  const resolution = await loadBrandVoice(admin, input.organizationId);
  if (!resolution.ok) {
    if (resolution.problem === "no_profile") return { problem: "no_profile" };
    return { problem: "no_matching_voice", message: brandVoiceMessage(resolution.problem, resolution.profile) };
  }

  const provider = getMediaProvider();
  const result = await synthesizeVoiceover(
    admin,
    {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contentItemId: input.contentItemId,
      text: narration.text,
      voiceId: resolution.resolved.voice.providerVoiceId,
      idempotencyKey: input.idempotencyKey,
      delivery: resolution.resolved.delivery,
    },
    provider,
  );

  return storeAsset(admin, input, VOICEOVER_SLOT, provider.name, result);
}

/**
 * Composes the backing track, or explains why it cannot.
 *
 * The brand's tone decides the character of the music, so a brand that has not chosen one stops
 * here: picking a mood for somebody else's brand is exactly the sort of decision nothing should
 * make on their behalf. It needs only the tone, not a voice — a piece can have music before it
 * has narration.
 *
 * Where a voiceover already exists its real length sets the music's, because the voice is a fact
 * and the script is an intention, and a track that ends before the narration is worse than none.
 */
export async function produceMusic(
  admin: SupabaseClient,
  input: ProduceInput,
): Promise<MediaAsset | MusicProblem> {
  const existing = await findAsset(admin, input.contentItemId, input.contentVersion, MUSIC_SLOT);
  if (existing) return existing;

  const resolution = await loadBrandVoice(admin, input.organizationId);
  const tone = resolution.ok ? resolution.resolved.profile.tone : resolution.profile?.tone;
  if (!tone) return { problem: "no_profile" };

  const voice = await findAsset(admin, input.contentItemId, input.contentVersion, VOICEOVER_SLOT);
  const brief = buildMusicBrief(input.variant, tone, input.pillar ?? "", voice?.durationSeconds ?? null);
  if (!brief) return { problem: "no_soundtrack" };

  const provider = getMediaProvider();
  if (!provider.composeMusic) return { problem: "provider_cannot_compose" };
  const compose = provider.composeMusic.bind(provider);

  const result = await withBudget(
    admin,
    {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contentItemId: input.contentItemId,
      operation: "media.music",
      provider: provider.name,
      // Billed by the seconds requested, so that is what the ceiling is checked against.
      estimateMicros: estimateCost({ operation: "media.music", seconds: brief.seconds }, ratesFromEnv(process.env)),
      idempotencyKey: input.idempotencyKey,
    },
    async () => {
      const composed = await compose(brief);
      return {
        result: composed,
        actualMicros: composed.costMicros,
        summary: `${brief.seconds}s de musica instrumental`,
      };
    },
  );

  return storeAsset(admin, input, MUSIC_SLOT, provider.name, result);
}


/**
 * Generates the picture for one frame, and keeps it.
 *
 * One frame at a time on purpose. The free provider rate limits an anonymous caller to roughly
 * one image every fifteen seconds, so a carousel generated in a single request would spend a
 * minute inside one function call and be killed by the platform before it finished. Asking for
 * one is a request that reliably completes.
 *
 * The picture is stored against the slot the composition already refers to, so nothing has to
 * agree on a name twice.
 */
export async function produceImage(
  admin: SupabaseClient,
  input: ProduceInput,
  slot: string,
): Promise<MediaAsset | ImageProblem> {
  const existing = await findAsset(admin, input.contentItemId, input.contentVersion, slot);
  if (existing) return existing;

  const { data: brand } = await admin
    .from("brands")
    .select("visual_instructions")
    .eq("organization_id", input.organizationId)
    .limit(1)
    .maybeSingle();

  const request = buildImageRequest(input.variant, slot, (brand as { visual_instructions: string | null } | null)?.visual_instructions ?? "");
  if (!request) return { problem: "no_direction" };

  const provider = getImageProvider(process.env, isDemoMode);

  // A provider that costs nothing does not touch the ceiling: a reservation worth nothing is a
  // ledger row that makes reconciling against an invoice harder, which is all the ledger is for.
  if (!provider.charges) {
    const image = await provider.generateImage(request);
    return storeImage(admin, input, slot, provider.name, image);
  }

  const image = await withBudget(
    admin,
    {
      organizationId: input.organizationId,
      campaignId: input.campaignId,
      contentItemId: input.contentItemId,
      operation: "media.image",
      provider: provider.name,
      estimateMicros: provider.costPerImageMicros,
      idempotencyKey: input.idempotencyKey,
    },
    async () => {
      const generated = await provider.generateImage(request);
      return { result: generated, summary: `1 imagen ${request.width}x${request.height}` };
    },
  );

  return storeImage(admin, input, slot, provider.name, image);
}

/** Images are stored the same way audio is, but recorded as the kind they actually are. */
async function storeImage(
  admin: SupabaseClient,
  input: ProduceInput,
  slot: string,
  provider: string,
  image: { bytes: Uint8Array; mimeType: string; generatedBy: string },
): Promise<MediaAsset> {
  const extension = image.mimeType.includes("png") ? "png" : image.mimeType.includes("webp") ? "webp" : "jpg";
  const storagePath = `${input.organizationId}/${input.contentItemId}/v${input.contentVersion}/${slot}.${extension}`;

  const upload = await admin.storage.from("content-assets").upload(storagePath, image.bytes, {
    contentType: image.mimeType,
    upsert: true,
  });
  if (upload.error) throw new Error("storage_upload_failed");

  const { data, error } = await admin
    .from("content_assets")
    .upsert({
      organization_id: input.organizationId,
      campaign_id: input.campaignId,
      content_item_id: input.contentItemId,
      content_version: input.contentVersion,
      kind: "image",
      slot,
      storage_path: storagePath,
      mime_type: image.mimeType,
      byte_size: image.bytes.length,
      generated_by: image.generatedBy,
      provider,
    }, { onConflict: "content_item_id,content_version,slot" })
    .select("id")
    .single();
  if (error) throw new Error("asset_record_failed");

  return {
    id: data.id,
    storagePath,
    mimeType: image.mimeType,
    byteSize: image.bytes.length,
    durationSeconds: null,
    generatedBy: image.generatedBy,
    reused: false,
  };
}
