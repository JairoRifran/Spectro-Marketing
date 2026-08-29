import { getOrganizationContext } from "@/features/organizations/context";
import { runCampaignBrainForOrganization, resumeCampaignBrainForOrganization } from "@/server/campaigns/workflow";
import { publicError } from "@/server/errors";

// Running Campaign Brain, one bite at a time.
//
// With a real model answering, a single strategic stage can take most of a minute, so the chain
// cannot finish inside one request. Each call advances what it can and reports whether the chain
// is drained; the caller asks again while `done` is false. The work itself is in the database, so
// a request that dies mid-chain costs one stage, not the campaign.

export const maxDuration = 60;

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const context = await getOrganizationContext();
  if (!context) return Response.json({ error: "organization_required" }, { status: 401 });
  if (context.role === "viewer") return Response.json({ error: "forbidden" }, { status: 403 });

  try {
    // A campaign with work already queued is being continued, not started. Asking the database
    // rather than trusting a flag from the client keeps a second tab from opening a second
    // strategy version.
    const { count } = await context.db
      .from("tasks")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", id)
      .eq("organization_id", context.orgId)
      .in("status", ["queued", "running"]);

    const result = count
      ? await resumeCampaignBrainForOrganization(context.orgId, id)
      : await runCampaignBrainForOrganization(context.orgId, id, context.user.id);

    return Response.json(result);
  } catch (error) {
    return Response.json({ error: publicError(error) }, { status: 400 });
  }
}
