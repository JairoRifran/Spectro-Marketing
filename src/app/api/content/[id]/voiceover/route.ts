import { z } from "zod";
import { getOrganizationContext } from "@/features/organizations/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { produceVoiceover, findVoiceover } from "@/server/media/voiceover-asset";
import { buildNarration } from "@/server/media/narration";
import { estimateCost, ratesFromEnv } from "@/server/spend/pricing";
import { formatMoney } from "@/server/spend/money";
import { SpendRefused, SpendUnavailable } from "@/server/spend/ledger";
import { MediaProviderError } from "@/server/media/provider";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";

// Producing the voiceover for a piece: the first thing in Spectro that spends real money.
//
// So it is an explicit, authenticated, per-piece action, and never a side effect of viewing
// anything. GET answers what it would cost and whether it already exists; POST is the only verb
// that can spend, which keeps a preflight from ever becoming a purchase by accident.

export const dynamic = "force-dynamic";

const bodySchema = z.object({
  /** Stable for one attempt, from the client, so a retried request does not pay twice. */
  requestId: z.string().trim().min(8).max(120),
});

async function loadPiece(db: Awaited<ReturnType<typeof getOrganizationContext>>, id: string) {
  if (!db) return null;
  const { data: item } = await db.db
    .from("content_items")
    .select("id,campaign_id,current_version")
    .eq("id", id)
    .eq("organization_id", db.orgId)
    .maybeSingle();
  if (!item) return null;

  const { data: variant } = await db.db
    .from("content_variants")
    .select("payload")
    .eq("content_item_id", id)
    .eq("version", item.current_version)
    .maybeSingle();
  if (!variant) return null;

  return { item, variant: variant.payload as PlatformContentVariant };
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });

  const piece = await loadPiece(context, id);
  if (!piece) return Response.json({ error: "content_not_found" }, { status: 404 });

  const narration = buildNarration(piece.variant);
  const existing = await findVoiceover(context.db, id, piece.item.current_version);

  return Response.json({
    hasNarration: Boolean(narration),
    lines: narration?.lines ?? [],
    characters: narration ? [...narration.text].length : 0,
    // What it would cost, shown before anything is spent rather than reported after.
    estimate: narration ? formatMoney(estimateCost({ operation: "media.tts", text: narration.text }, ratesFromEnv(process.env))) : null,
    existing: existing ? { id: existing.id, durationSeconds: existing.durationSeconds, generatedBy: existing.generatedBy } : null,
  });
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "validation" }, { status: 400 });

  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  // Spending is not a viewer's decision.
  if (context.role === "viewer") return Response.json({ error: "forbidden" }, { status: 403 });

  const piece = await loadPiece(context, id);
  if (!piece) return Response.json({ error: "content_not_found" }, { status: 404 });

  try {
    const result = await produceVoiceover(createAdminClient(), {
      organizationId: context.orgId,
      campaignId: piece.item.campaign_id,
      contentItemId: id,
      contentVersion: piece.item.current_version,
      variant: piece.variant,
      // Scoped to the piece and version so one client's retry cannot collide with another's.
      idempotencyKey: `tts:${id}:v${piece.item.current_version}:${parsed.data.requestId}`,
    });

    if ("problem" in result) {
      return Response.json({ error: result.problem, message: "message" in result ? result.message : undefined }, { status: 409 });
    }
    return Response.json({
      id: result.id,
      durationSeconds: result.durationSeconds,
      generatedBy: result.generatedBy,
      reused: result.reused,
    });
  } catch (error) {
    // Each of these is a different thing to do next, so none of them is collapsed into "failed".
    if (error instanceof SpendRefused) return Response.json({ error: "spend_refused", message: error.message }, { status: 402 });
    if (error instanceof SpendUnavailable) return Response.json({ error: "spend_unavailable" }, { status: 503 });
    if (error instanceof MediaProviderError) {
      return Response.json({ error: "provider_failed", message: error.message, retryable: error.retryable }, { status: 502 });
    }
    return Response.json({ error: "voiceover_failed" }, { status: 500 });
  }
}
