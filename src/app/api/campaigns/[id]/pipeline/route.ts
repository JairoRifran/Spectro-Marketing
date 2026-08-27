import { getCampaignPipeline } from "@/features/content/pipeline";
import { getOrganizationContext } from "@/features/organizations/context";
import { isDemoMode } from "@/lib/env";

// Read-only progress for one campaign. The visualisation polls this while work is in flight
// and stops as soon as it is not, so an idle workspace makes no requests at all.

export const dynamic = "force-dynamic";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;

  if (!isDemoMode) {
    const context = await getOrganizationContext();
    if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
    // RLS decides visibility; a campaign from another organization is simply not there.
    const { data: campaign } = await context.db.from("campaigns").select("id").eq("id", id).eq("organization_id", context.orgId).maybeSingle();
    if (!campaign) return Response.json({ error: "campaign_not_found" }, { status: 404 });
  }

  const snapshot = await getCampaignPipeline(id);
  if (!snapshot) return Response.json({ error: "unavailable" }, { status: 404 });
  return Response.json(snapshot, { headers: { "cache-control": "no-store" } });
}
