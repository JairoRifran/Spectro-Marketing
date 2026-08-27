import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runManualCampaignTasks } from "@/server/workers/dispatcher";
import { DomainError } from "@/server/errors";
import { canTransitionContent, nextContentVersion, type ContentStatus } from "./lifecycle";
import type { ContentCopyTaskInput } from "./mock-content";

// Requesting a revision never overwrites what was already written. The rejected version stays
// exactly as it was, a new version is created alongside it, and the human feedback travels with
// the task so the next draft answers it.

export async function requestContentRevision(organizationId: string, contentItemId: string, userId: string, feedback: string) {
  const db = createAdminClient();

  const { data: item, error } = await db
    .from("content_items")
    .select("id,status,current_version,campaign_id,objective_id,platform,format,brief,concept_id,title,content_concepts!inner(concept_key)")
    .eq("id", contentItemId)
    .eq("organization_id", organizationId)
    .single();
  if (error || !item) throw new DomainError("authorization", "Contenido no disponible.", "content_not_found", false);

  const status = item.status as ContentStatus;
  if (!canTransitionContent(status, "needs_revision")) {
    throw new DomainError("validation", `No se puede pedir una revisión desde el estado ${status}.`, "content_transition_invalid", false);
  }

  const { count: running } = await db
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("content_item_id", contentItemId)
    .in("status", ["queued", "running"]);
  if (running) throw new DomainError("validation", "Ya hay trabajo en curso para esta pieza.", "content_already_running", false);

  const copywriter = await db.from("agents").select("id").eq("organization_id", organizationId).eq("role", "copywriter").eq("status", "active").maybeSingle();
  if (!copywriter.data) throw new DomainError("validation", "Clara no está disponible en esta organización.", "copywriter_unavailable", false);

  const version = nextContentVersion(item.current_version);
  await db.from("content_items").update({ status: "needs_revision" }).eq("id", contentItemId).eq("organization_id", organizationId);

  await db.from("activity_log").insert({
    organization_id: organizationId,
    campaign_id: item.campaign_id,
    content_item_id: contentItemId,
    action: "content.revision_requested",
    actor_type: "user",
    actor_id: userId,
    entity_type: "content_item",
    entity_id: contentItemId,
    summary: "Una persona pidió una revisión del contenido",
    metadata: { feedback, from_version: item.current_version, to_version: version },
  });

  const brief = item.brief as ContentCopyTaskInput["brief"];
  const conceptKey = (item.content_concepts as unknown as { concept_key: string }).concept_key;

  // The concept is rebuilt from the brief so the rewrite starts from the idea, not from the
  // version being replaced. Clara answers the feedback rather than editing the old text.
  const copyInput: ContentCopyTaskInput = {
    contentItemId,
    conceptId: conceptKey,
    version,
    brief,
    concept: {
      conceptId: conceptKey,
      title: item.title,
      internalName: item.title,
      pillar: brief.pillar,
      angle: brief.angle,
      objective: brief.contentType,
      audience: { persona: brief.audience.persona, problem: brief.audience.problem, promise: brief.message },
      coreIdea: brief.message,
      hookDirection: { preferredTypes: ["problem"], note: "Revisión pedida por una persona." },
      format: brief.format,
      platforms: [brief.platform],
      cta: brief.desiredAction,
      evidenceRequired: brief.evidence,
      creativeNotes: brief.constraints,
    },
    campaignObjective: brief.objective,
    campaignId: item.campaign_id,
    campaignName: "",
    revisionFeedback: feedback,
  };

  const { data: task, error: taskError } = await db
    .from("tasks")
    .insert({
      organization_id: organizationId,
      campaign_id: item.campaign_id,
      content_item_id: contentItemId,
      objective_id: item.objective_id,
      title: `Reescribir ${item.platform}: versión ${version}`,
      description: "Clara escribe una nueva versión atendiendo el pedido de revisión.",
      type: "content.copy",
      status: "queued",
      priority: "high",
      created_by_type: "user",
      created_by_id: userId,
      assigned_agent_id: copywriter.data.id,
      reason: "Revisión solicitada por una persona",
      expected_impact: "Producir una nueva versión sin sobrescribir la anterior",
      risk_level: "low",
      requires_approval: false,
      idempotency_key: `content:${contentItemId}:copy:${version}`,
      input: copyInput,
    })
    .select("id")
    .single();
  if (taskError || !task) throw new DomainError("non_retryable", "No se pudo crear la nueva versión.", "revision_task_failed", false);

  const report = await runManualCampaignTasks({ campaignId: item.campaign_id, maxSteps: 6, leaseSeconds: 120 });
  return { taskId: task.id, version, report };
}
