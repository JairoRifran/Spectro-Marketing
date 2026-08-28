import { z } from "zod";
import { getOrganizationContext } from "@/features/organizations/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { produceImage } from "@/server/media/voiceover-asset";
import { composeFrames } from "@/server/media/compose";
import { SpendRefused, SpendUnavailable } from "@/server/spend/ledger";
import { MediaProviderError } from "@/server/media/provider";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";

// Generating the picture for one frame.
//
// One frame per request on purpose. The free provider rate limits an anonymous caller to roughly
// one image every fifteen seconds, so generating a carousel in a single call would sit inside one
// function for a minute and be killed by the platform before finishing. One is a request that
// reliably completes, and the caller decides how many to ask for.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Which frame to draw. Validated against the piece's own composition, never trusted. */
  slot: z.string().trim().min(1).max(60),
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
    .select("id,campaign_id,current_version")
    .eq("id", id)
    .eq("organization_id", context.orgId)
    .maybeSingle();
  if (!item) return Response.json({ error: "content_not_found" }, { status: 404 });

  const { data: variantRow } = await context.db
    .from("content_variants")
    .select("payload")
    .eq("content_item_id", id)
    .eq("version", item.current_version)
    .maybeSingle();
  if (!variantRow) return Response.json({ error: "content_not_found" }, { status: 404 });

  const variant = variantRow.payload as PlatformContentVariant;
  // A slot the composition does not produce would store a file nothing ever renders, so the
  // request is checked against the piece rather than taken on trust.
  const known = composeFrames(variant).some((frame) => frame.key === parsed.data.slot);
  if (!known) return Response.json({ error: "unknown_slot" }, { status: 409 });

  try {
    const result = await produceImage(
      createAdminClient(),
      {
        organizationId: context.orgId,
        campaignId: item.campaign_id,
        contentItemId: id,
        contentVersion: item.current_version,
        variant,
        idempotencyKey: `image:${id}:v${item.current_version}:${parsed.data.slot}:${parsed.data.requestId}`,
      },
      parsed.data.slot,
    );

    if ("problem" in result) return Response.json({ error: result.problem }, { status: 409 });
    return Response.json({ id: result.id, slot: parsed.data.slot, generatedBy: result.generatedBy, reused: result.reused });
  } catch (error) {
    // Each of these is a different thing to do next, so none is collapsed into "failed".
    if (error instanceof SpendRefused) return Response.json({ error: "spend_refused", message: error.message }, { status: 402 });
    if (error instanceof SpendUnavailable) return Response.json({ error: "spend_unavailable" }, { status: 503 });
    if (error instanceof MediaProviderError) {
      return Response.json({ error: "provider_failed", message: error.message, retryable: error.retryable }, { status: 502 });
    }
    return Response.json({ error: "image_failed" }, { status: 500 });
  }
}
