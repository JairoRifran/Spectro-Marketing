import { isDemoMode } from "@/lib/env";
import { getOrganizationContext } from "@/features/organizations/context";
import { buildPipeline, type PipelineSnapshot, type TaskRow } from "@/server/content-factory/pipeline";

// Read model for the live pipeline. One query for the tasks and one head count for the open
// content approvals; the shape of the picture is decided by the pure builder.

type TaskRecord = { type: string; status: string; title: string | null; updated_at: string | null };

/** The database speaks snake_case; the builder is pure and speaks its own shape. */
function toRows(rows: TaskRecord[] | null): TaskRow[] {
  return (rows ?? []).map((row) => ({ type: row.type, status: row.status, title: row.title, updatedAt: row.updated_at }));
}

export async function getCampaignPipeline(campaignId: string): Promise<PipelineSnapshot | null> {
  if (isDemoMode) return demoPipeline();
  const ctx = await getOrganizationContext();
  if (!ctx) return null;

  const [tasks, approvals] = await Promise.all([
    ctx.db.from("tasks").select("type,status,title,updated_at").eq("organization_id", ctx.orgId).eq("campaign_id", campaignId).limit(300),
    ctx.db.from("approvals").select("id", { count: "exact", head: true }).eq("organization_id", ctx.orgId).eq("campaign_id", campaignId).eq("status", "requested").not("content_item_id", "is", null),
  ]);

  return buildPipeline(toRows(tasks.data), approvals.count ?? 0, new Date().toISOString());
}

/**
 * A demo snapshot with work genuinely in flight, so the visualisation can be exercised without
 * a database. Only reachable while isDemoMode is true.
 */
function demoPipeline(): PipelineSnapshot {
  const tasks: TaskRow[] = [
    { type: "campaign.strategy.draft", status: "completed", title: "Desarrollar estrategia", updatedAt: "2026-08-27T18:00:00.000Z" },
    { type: "campaign.research", status: "completed", title: "Investigar oportunidad", updatedAt: "2026-08-27T18:05:00.000Z" },
    { type: "campaign.channel_strategy", status: "completed", title: "Priorizar canales", updatedAt: "2026-08-27T18:10:00.000Z" },
    { type: "campaign.content_plan", status: "completed", title: "Crear pilares", updatedAt: "2026-08-27T18:15:00.000Z" },
    { type: "campaign.strategy.finalize", status: "completed", title: "Consolidar brief", updatedAt: "2026-08-27T18:20:00.000Z" },
    { type: "content.plan", status: "completed", title: "Planificar contenido", updatedAt: "2026-08-27T18:25:00.000Z" },
    { type: "content.copy", status: "completed", title: "Escribir instagram", updatedAt: "2026-08-27T18:30:00.000Z" },
    { type: "content.copy", status: "running", title: "Escribir tiktok: Proceso antes que herramienta", updatedAt: "2026-08-27T18:40:00.000Z" },
    { type: "content.copy", status: "queued", title: "Escribir linkedin", updatedAt: "2026-08-27T18:35:00.000Z" },
  ];
  return buildPipeline(tasks, 1, new Date().toISOString());
}

/**
 * The same read model across every campaign in the organization. Marketing HQ is where a person
 * lands, so the question "where is my work right now?" has to be answerable there, not only
 * after drilling into one campaign.
 */
export async function getOrganizationPipeline(): Promise<PipelineSnapshot | null> {
  if (isDemoMode) return demoPipeline();
  const ctx = await getOrganizationContext();
  if (!ctx) return null;

  const [tasks, approvals] = await Promise.all([
    ctx.db.from("tasks").select("type,status,title,updated_at").eq("organization_id", ctx.orgId).limit(500),
    ctx.db.from("approvals").select("id", { count: "exact", head: true }).eq("organization_id", ctx.orgId).eq("status", "requested").not("content_item_id", "is", null),
  ]);

  return buildPipeline(toRows(tasks.data), approvals.count ?? 0, new Date().toISOString());
}
