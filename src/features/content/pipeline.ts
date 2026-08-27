import { isDemoMode } from "@/lib/env";
import { getOrganizationContext } from "@/features/organizations/context";
import { buildPipeline, type PipelineSnapshot, type TaskRow } from "@/server/content-factory/pipeline";

// Read model for the live pipeline. One query for the campaign's tasks and one head count for
// its open content approvals; the shape of the picture is decided by the pure builder.

export async function getCampaignPipeline(campaignId: string): Promise<PipelineSnapshot | null> {
  if (isDemoMode) return demoPipeline();
  const ctx = await getOrganizationContext();
  if (!ctx) return null;

  const [tasks, approvals] = await Promise.all([
    ctx.db.from("tasks").select("type,status,title").eq("organization_id", ctx.orgId).eq("campaign_id", campaignId).limit(300),
    ctx.db.from("approvals").select("id", { count: "exact", head: true }).eq("organization_id", ctx.orgId).eq("campaign_id", campaignId).eq("status", "requested").not("content_item_id", "is", null),
  ]);

  return buildPipeline((tasks.data ?? []) as TaskRow[], approvals.count ?? 0, new Date().toISOString());
}

/**
 * A demo snapshot with work genuinely in flight, so the visualisation can be exercised without
 * a database. Only reachable while isDemoMode is true.
 */
function demoPipeline(): PipelineSnapshot {
  const tasks: TaskRow[] = [
    { type: "campaign.strategy.draft", status: "completed", title: "Desarrollar estrategia" },
    { type: "campaign.research", status: "completed", title: "Investigar oportunidad" },
    { type: "campaign.channel_strategy", status: "completed", title: "Priorizar canales" },
    { type: "campaign.content_plan", status: "completed", title: "Crear pilares" },
    { type: "campaign.strategy.finalize", status: "completed", title: "Consolidar brief" },
    { type: "content.plan", status: "completed", title: "Planificar contenido" },
    { type: "content.copy", status: "completed", title: "Escribir instagram" },
    { type: "content.copy", status: "running", title: "Escribir tiktok: Proceso antes que herramienta" },
    { type: "content.copy", status: "queued", title: "Escribir linkedin" },
  ];
  return buildPipeline(tasks, 1, new Date().toISOString());
}
