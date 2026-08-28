import { z } from "zod";
import { getOrganizationContext } from "@/features/organizations/context";
import { voiceGenderSchema, voiceRegionSchema, voiceToneSchema } from "@/server/media/voice-profile";

// Two writes for the voice settings screen: adding a voice to the organization's list, and
// choosing how the brand wants to be read.
//
// Both are ordinary configuration, not spending: listing and assigning voices costs nothing.
// Neither writes a vendor credential, and the provider's voice identifier is the only vendor
// detail that crosses this boundary.

const addVoiceSchema = z.object({
  action: z.literal("add_voice"),
  providerVoiceId: z.string().trim().min(1).max(200),
  region: voiceRegionSchema,
  gender: voiceGenderSchema,
  label: z.string().trim().min(1).max(120),
});

const removeVoiceSchema = z.object({
  action: z.literal("remove_voice"),
  id: z.string().uuid(),
});

const setProfileSchema = z.object({
  action: z.literal("set_profile"),
  tone: voiceToneSchema,
  region: voiceRegionSchema,
  gender: voiceGenderSchema,
});

const schema = z.discriminatedUnion("action", [addVoiceSchema, removeVoiceSchema, setProfileSchema]);

export async function POST(request: Request) {
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation", issues: parsed.error.flatten() }, { status: 400 });

  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  // Choosing the voice of the brand is not a viewer's decision.
  if (context.role === "viewer") return Response.json({ error: "forbidden" }, { status: 403 });

  if (parsed.data.action === "add_voice") {
    const { error } = await context.db.from("brand_voices").insert({
      organization_id: context.orgId,
      provider: "elevenlabs",
      provider_voice_id: parsed.data.providerVoiceId,
      region: parsed.data.region,
      gender: parsed.data.gender,
      label: parsed.data.label,
    });
    // Told apart on purpose. A duplicate is not a failure, and a policy refusal is a
    // configuration problem that looks identical to an empty table if it is not named.
    if (error) {
      if (error.code === "23505") return Response.json({ error: "already_added" }, { status: 409 });
      if (error.code === "42501") return Response.json({ error: "forbidden_by_policy" }, { status: 403 });
      return Response.json({ error: "insert_failed" }, { status: 400 });
    }
    return Response.json({ ok: true });
  }

  if (parsed.data.action === "remove_voice") {
    const { error } = await context.db.from("brand_voices").delete().eq("id", parsed.data.id).eq("organization_id", context.orgId);
    if (error) {
      if (error.code === "42501") return Response.json({ error: "forbidden_by_policy" }, { status: 403 });
      return Response.json({ error: "delete_failed" }, { status: 400 });
    }
    return Response.json({ ok: true });
  }

  const { error } = await context.db
    .from("brands")
    .update({ voice_tone: parsed.data.tone, voice_region: parsed.data.region, voice_gender: parsed.data.gender })
    .eq("organization_id", context.orgId);
  if (error) return Response.json({ error: "update_failed" }, { status: 400 });
  return Response.json({ ok: true });
}
