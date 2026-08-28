import type { SupabaseClient } from "@supabase/supabase-js";
import { loadBrandVoice, brandVoiceMessage } from "./brand-voice";
import { buildNarration } from "./narration";
import { getMediaProvider } from "./providers";
import { synthesizeVoiceover } from "./voiceover";
import type { PlatformContentVariant } from "../content/schemas/variant";

// Producing the voiceover for one piece, and keeping it.
//
// The order is deliberate and each step earns its place:
//
//   1. An asset for this version already exists -> return it. Storage is what makes this
//      possible, and without it every look at the same audio would be a second charge.
//   2. Build the narration. This is the exact string billed and estimated.
//   3. Resolve the brand's voice. A brand that has not chosen, or has chosen a region it has no
//      voice for, stops here rather than being given a voice nobody picked.
//   4. Reserve, synthesise, store, settle.
//
// The audio is stored under the organization's own folder, which is what the bucket policy
// derives membership from. Uploading goes through the service role: the bucket grants read to
// members and writes to nobody, because a browser never produces one of these.

export const VOICEOVER_SLOT = "voiceover";

export type VoiceoverProblem =
  | { problem: "no_narration" }
  | { problem: "no_profile" }
  | { problem: "no_matching_voice"; message: string };

export interface VoiceoverAsset {
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
  /** Stable for one logical request; a retry must present the same one. */
  idempotencyKey: string;
}

const EXTENSION: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/wav": "wav",
  "audio/mp4": "m4a",
};

export async function findVoiceover(db: SupabaseClient, contentItemId: string, contentVersion: number): Promise<VoiceoverAsset | null> {
  const { data } = await db
    .from("content_assets")
    .select("id,storage_path,mime_type,byte_size,duration_seconds,generated_by")
    .eq("content_item_id", contentItemId)
    .eq("content_version", contentVersion)
    .eq("slot", VOICEOVER_SLOT)
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
): Promise<VoiceoverAsset | VoiceoverProblem> {
  const existing = await findVoiceover(admin, input.contentItemId, input.contentVersion);
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

  const extension = EXTENSION[result.mimeType] ?? "bin";
  // The first path segment is the organization: the bucket policy reads membership from it.
  const storagePath = `${input.organizationId}/${input.contentItemId}/v${input.contentVersion}/${VOICEOVER_SLOT}.${extension}`;

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
      slot: VOICEOVER_SLOT,
      storage_path: storagePath,
      mime_type: result.mimeType,
      byte_size: result.bytes.length,
      duration_seconds: result.durationSeconds ?? null,
      generated_by: result.generatedBy,
      provider: provider.name,
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
