import { getOrganizationContext } from "@/features/organizations/context";
import { runContentFactoryForCampaign } from "@/server/content-factory/workflow";
import { publicError } from "@/server/errors";

// Generating content is an explicit human action. There is no generic run-agent endpoint:
// this route only ever starts the Content Factory for one campaign the caller can already
// see, and the workflow itself refuses a campaign whose strategy was not approved.

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
    return Response.json(await runContentFactoryForCampaign(context.orgId, id, context.user.id));
  } catch (error) {
    return Response.json({ error: publicError(error) }, { status: 400 });
  }
}
