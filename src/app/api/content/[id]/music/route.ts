import { z } from "zod";
import { getOrganizationContext } from "@/features/organizations/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { produceMusic } from "@/server/media/voiceover-asset";
import { SpendRefused, SpendUnavailable } from "@/server/spend/ledger";
import { MediaProviderError } from "@/server/media/provider";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";

// Composing a piece's backing track. Same shape as the voiceover route and for the same reasons:
// POST is the only verb that can spend, a viewer cannot, and every refusal is named rather than
// collapsed into one failure.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  requestId: z.string().trim().min(8).max(120),
});

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation" }, { status: 400 });

  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  if (context.role === "viewer") return Response.json({ error: "forbidden" }, { status: 403 });

  const { data: item } = await context.db
    .from("content_items")
    .select("id,campaign_id,current_version,content_concepts(pillar)")
    .eq("id", id)
    .eq("organization_id", context.orgId)
    .maybeSingle();
  if (!item) return Response.json({ error: "content_not_found" }, { status: 404 });

  const { data: variant } = await context.db
    .from("content_variants")
    .select("payload")
    .eq("content_item_id", id)
    .eq("version", item.current_version)
    .maybeSingle();
  if (!variant) return Response.json({ error: "content_not_found" }, { status: 404 });

  try {
    const result = await produceMusic(createAdminClient(), {
      organizationId: context.orgId,
      campaignId: item.campaign_id,
      contentItemId: id,
      contentVersion: item.current_version,
      variant: variant.payload as PlatformContentVariant,
      pillar: (item.content_concepts as unknown as { pillar: string } | null)?.pillar ?? "",
      idempotencyKey: `music:${id}:v${item.current_version}:${parsed.data.requestId}`,
    });

    if ("problem" in result) return Response.json({ error: result.problem }, { status: 409 });
    return Response.json({ id: result.id, durationSeconds: result.durationSeconds, generatedBy: result.generatedBy, reused: result.reused });
  } catch (error) {
    // Each of these is a different thing to do next, so none is collapsed into "failed".
    if (error instanceof SpendRefused) return Response.json({ error: "spend_refused", message: error.message }, { status: 402 });
    if (error instanceof SpendUnavailable) return Response.json({ error: "spend_unavailable" }, { status: 503 });
    if (error instanceof MediaProviderError) {
      return Response.json({ error: "provider_failed", message: error.message, retryable: error.retryable }, { status: 502 });
    }
    return Response.json({ error: "music_failed" }, { status: 500 });
  }
}
