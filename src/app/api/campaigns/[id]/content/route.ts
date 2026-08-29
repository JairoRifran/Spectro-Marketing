import { getOrganizationContext } from "@/features/organizations/context";
import { resumeContentFactoryForCampaign, runContentFactoryForCampaign } from "@/server/content-factory/workflow";
import { publicError } from "@/server/errors";

// Generating content is an explicit human action. There is no generic run-agent endpoint:
// this route only ever starts the Content Factory for one campaign the caller can already
// see, and the workflow itself refuses a campaign whose strategy was not approved.
//
// It advances a piece at a time, for the same reason the campaign endpoint does: with a model
// writing, a plan plus a copy and a review for every piece is twenty-five calls, and none of
// that fits in one invocation. Each call does what it can and says whether work remains.

export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  if (context.role === "viewer") return Response.json({ error: "forbidden" }, { status: 403 });

  // Read through the caller's own session so RLS proves the campaign belongs to their
  // organization before any service-role work begins.
  const { data: campaign } = await context.db.from("campaigns").select("id").eq("id", id).eq("organization_id", context.orgId).maybeSingle();
  if (!campaign) return Response.json({ error: "campaign_not_found" }, { status: 404 });

  try {
    // Work already queued means this is a continuation. Asking the database rather than trusting
    // the client keeps a second press from planning a second batch of pieces.
    const { count } = await context.db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("organization_id", context.orgId)
      .in("status", ["queued", "running"]);

    return Response.json(count
      ? await resumeContentFactoryForCampaign(context.orgId, id)
      : await runContentFactoryForCampaign(context.orgId, id, context.user.id));
  } catch (error) {
    return Response.json({ error: publicError(error) }, { status: 400 });
  }
}
