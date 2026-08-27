import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentResult } from "@/server/agents/contracts";
import type { RuntimeTask } from "@/server/tasks/types";
import { DomainError } from "@/server/errors";
import { getAdapter } from "@/server/content/adapters";
import { evaluateContent } from "@/server/content/quality/evaluator";
import { checkDuplication } from "@/server/content/quality/duplication";
import type { ContentBrief } from "@/server/content/schemas/brief";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";
import { contentCopyOutputSchema, contentPlanOutputSchema, creativeReviewOutputSchema, type QualitySummary } from "./schemas";
import { CONTENT_PROMPTS } from "./prompts";
import type { ContentCopyTaskInput, CreativeReviewTaskInput } from "./mock-content";

// Persistence for the Content Factory chain. Mirrors the M02.1 outcome writer: the dispatcher
// calls this after an agent run, the output is validated against a schema before anything is
// written, and every stage records user-facing activity rather than a reasoning trace.

type AgentRef = { id: string; role: string };

const fail = (message: string): never => {
  throw new DomainError("validation", message, "content_output_invalid", false);
};

async function checked(query: PromiseLike<{ error: { code?: string; message?: string } | null }>) {
  const { error } = await query;
  if (error) throw new Error(`Content persistence failed: ${error.code ?? error.message}`);
}

async function activity(
  db: SupabaseClient,
  row: { organizationId: string; campaignId: string; contentItemId: string | null; action: string; agentId: string | null; taskId: string; summary: string; metadata: Record<string, unknown> },
) {
  await checked(
    db.from("activity_log").insert({
      organization_id: row.organizationId,
      campaign_id: row.campaignId,
      content_item_id: row.contentItemId,
      action: row.action,
      actor_type: "agent",
      actor_id: row.agentId,
      entity_type: row.contentItemId ? "content_item" : "campaign",
      entity_id: row.contentItemId ?? row.campaignId,
      task_id: row.taskId,
      agent_id: row.agentId,
      summary: row.summary,
      metadata: row.metadata,
    }),
  );
}

async function agentByRole(db: SupabaseClient, organizationId: string, role: string) {
  const { data } = await db.from("agents").select("id").eq("organization_id", organizationId).eq("role", role).eq("status", "active").maybeSingle();
  if (!data) throw new DomainError("validation", `El agente con rol ${role} no está disponible en la organización.`, "agent_unavailable", false);
  return data.id as string;
}

function summarizeQuality(result: ReturnType<typeof evaluateContent>): QualitySummary {
  return {
    passed: result.passed,
    checksPassed: result.score.passed,
    checksTotal: result.score.total,
    errors: result.errors,
    warnings: result.warnings,
    recommendations: result.recommendations,
  };
}

export async function persistContentOutcome(db: SupabaseClient, task: RuntimeTask, result: AgentResult, agent: AgentRef) {
  if (!task.campaign_id || !task.type.startsWith("content.")) return;
  if (task.type === "content.plan") return persistPlan(db, task, result, agent);
  if (task.type === "content.copy") return persistCopy(db, task, result, agent);
  if (task.type === "content.creative_review") return persistReview(db, task, result, agent);
}

/** Bruno: concepts become durable ideas, each with one reviewable item per target platform. */
async function persistPlan(db: SupabaseClient, task: RuntimeTask, result: AgentResult, agent: AgentRef) {
  const parsed = contentPlanOutputSchema.safeParse(result.output);
  if (!parsed.success) fail("Bruno devolvió un plan de contenido inválido.");
  const value = parsed.data!;
  const campaignId = task.campaign_id!;
  const organizationId = task.organization_id;
  const strategyVersion = Number(task.input.strategyVersion) || 1;
  const copywriterId = await agentByRole(db, organizationId, "copywriter");

  for (const concept of value.concepts) {
    const { data: conceptRow, error } = await db
      .from("content_concepts")
      .upsert(
        {
          organization_id: organizationId,
          campaign_id: campaignId,
          objective_id: task.objective_id,
          strategy_version: strategyVersion,
          concept_key: concept.conceptId,
          title: concept.title,
          internal_name: concept.internalName,
          pillar: concept.pillar,
          angle: concept.angle,
          content_type: concept.objective,
          core_idea: concept.coreIdea,
          audience_persona: concept.audience.persona,
          audience_problem: concept.audience.problem,
          audience_promise: concept.audience.promise,
          hook_direction: concept.hookDirection,
          desired_action: concept.cta,
          evidence: concept.evidenceRequired,
          creative_notes: concept.creativeNotes,
          platforms: concept.platforms,
          created_by_agent_id: agent.id,
        },
        { onConflict: "campaign_id,concept_key" },
      )
      .select("id")
      .single();
    if (error || !conceptRow) throw new Error(`Content concept persistence failed: ${error?.code ?? error?.message}`);

    for (const platform of concept.platforms) {
      const adapter = getAdapter(platform);
      const brief: ContentBrief = adapter.brief({
        concept,
        brand: (task.input.brand ?? {}) as ContentBrief["brand"],
        campaign: { campaignId, name: String(task.input.campaignName ?? ""), objective: brief0(task) },
      });

      const { data: item, error: itemError } = await db
        .from("content_items")
        .upsert(
          {
            organization_id: organizationId,
            campaign_id: campaignId,
            objective_id: task.objective_id,
            concept_id: conceptRow.id,
            platform,
            format: brief.format,
            status: "brief",
            title: concept.title,
            brief,
            created_by_agent_id: agent.id,
          },
          { onConflict: "concept_id,platform,format" },
        )
        .select("id,status")
        .single();
      if (itemError || !item) throw new Error(`Content item persistence failed: ${itemError?.code ?? itemError?.message}`);

      const copyInput: ContentCopyTaskInput = {
        contentItemId: item.id,
        conceptId: concept.conceptId,
        version: 1,
        brief,
        concept,
        campaignObjective: brief.objective,
        campaignId,
        campaignName: String(task.input.campaignName ?? ""),
      };

      await checked(
        db.from("tasks").upsert(
          {
            organization_id: organizationId,
            campaign_id: campaignId,
            content_item_id: item.id,
            objective_id: task.objective_id,
            title: `Escribir ${platform}: ${concept.title}`,
            description: `Clara redacta la ejecución nativa de ${platform} en formato ${brief.format}.`,
            type: "content.copy",
            status: "queued",
            priority: "medium",
            created_by_type: "agent",
            created_by_id: agent.id,
            assigned_agent_id: copywriterId,
            parent_task_id: task.id,
            reason: "Plan editorial aprobado por Bruno",
            expected_impact: "Producir la pieza nativa para revisión creativa",
            risk_level: "low",
            requires_approval: false,
            idempotency_key: `content:${item.id}:copy:1`,
            input: copyInput,
          },
          { onConflict: "organization_id,idempotency_key" },
        ),
      );
    }
  }

  await activity(db, {
    organizationId,
    campaignId,
    contentItemId: null,
    action: "content.plan_created",
    agentId: agent.id,
    taskId: task.id,
    summary: `Bruno planificó ${value.concepts.length} conceptos editoriales`,
    metadata: { concepts: value.concepts.length, warnings: value.planWarnings, prompt_version: value.promptVersion, provider: value.provider },
  });
}

/** The campaign objective travels on the task input; the brief needs it to keep the CTA coherent. */
function brief0(task: RuntimeTask) {
  const objective = String(task.input.objective ?? "awareness");
  return (["awareness", "engagement", "traffic", "lead_generation", "sales", "loyalty"].includes(objective) ? objective : "awareness") as ContentBrief["objective"];
}

/** Clara: the native execution is stored as a version and handed to Emilia. */
async function persistCopy(db: SupabaseClient, task: RuntimeTask, result: AgentResult, agent: AgentRef) {
  const parsed = contentCopyOutputSchema.safeParse(result.output);
  if (!parsed.success) fail("Clara devolvió una variante inválida.");
  const value = parsed.data!;
  const input = task.input as unknown as ContentCopyTaskInput;
  const organizationId = task.organization_id;
  const campaignId = task.campaign_id!;
  const contentItemId = input.contentItemId;
  const version = input.version;
  const creativeDirectorId = await agentByRole(db, organizationId, "creative_director");

  const { data: variantRow, error } = await db
    .from("content_variants")
    .upsert(
      {
        organization_id: organizationId,
        campaign_id: campaignId,
        content_item_id: contentItemId,
        version,
        payload: value.variant,
        hook_variants: value.hookVariants ?? [],
        generated_by: value.variant.generatedBy,
        provider: value.provider,
        model: value.model,
        prompt_version: value.promptVersion,
        created_by_agent_id: agent.id,
      },
      { onConflict: "content_item_id,version" },
    )
    .select("id")
    .single();
  if (error || !variantRow) throw new Error(`Content variant persistence failed: ${error?.code ?? error?.message}`);

  await checked(
    db.from("content_versions").upsert(
      {
        organization_id: organizationId,
        campaign_id: campaignId,
        content_item_id: contentItemId,
        version,
        reason: value.reason,
        feedback: input.revisionFeedback ?? null,
        created_by_agent_id: agent.id,
      },
      { onConflict: "content_item_id,version" },
    ),
  );

  await checked(db.from("content_items").update({ current_version: version, status: "generating" }).eq("id", contentItemId).eq("organization_id", organizationId));
  await checked(db.from("content_items").update({ status: "creative_review" }).eq("id", contentItemId).eq("organization_id", organizationId));

  const reviewInput: CreativeReviewTaskInput = {
    contentItemId,
    version,
    platform: input.brief.platform,
    format: input.brief.format,
    brief: input.brief,
  };

  await checked(
    db.from("tasks").upsert(
      {
        organization_id: organizationId,
        campaign_id: campaignId,
        content_item_id: contentItemId,
        objective_id: task.objective_id,
        title: `Revisar dirección creativa: ${input.brief.platform}`,
        description: "Emilia revisa dirección visual, coherencia creativa y consistencia de marca.",
        type: "content.creative_review",
        status: "queued",
        priority: "medium",
        created_by_type: "agent",
        created_by_id: agent.id,
        assigned_agent_id: creativeDirectorId,
        parent_task_id: task.id,
        reason: "La pieza tiene copy y necesita dirección creativa antes de aprobación",
        expected_impact: "Validar la traducción visual de la estrategia",
        risk_level: "low",
        requires_approval: false,
        idempotency_key: `content:${contentItemId}:review:${version}`,
        input: reviewInput,
      },
      { onConflict: "organization_id,idempotency_key" },
    ),
  );

  await activity(db, {
    organizationId,
    campaignId,
    contentItemId,
    action: "content.copy_written",
    agentId: agent.id,
    taskId: task.id,
    summary: `Clara escribió la versión ${version} para ${input.brief.platform}`,
    metadata: { platform: input.brief.platform, format: input.brief.format, version, provider: value.provider, prompt_version: value.promptVersion },
  });
}

/**
 * Emilia: the review is stored, the deterministic quality gate runs, and only a piece that
 * clears it is offered for human approval. A piece with errors goes back for revision instead.
 */
async function persistReview(db: SupabaseClient, task: RuntimeTask, result: AgentResult, agent: AgentRef) {
  const parsed = creativeReviewOutputSchema.safeParse(result.output);
  if (!parsed.success) fail("Emilia devolvió una revisión creativa inválida.");
  const value = parsed.data!;
  const input = task.input as unknown as CreativeReviewTaskInput;
  const organizationId = task.organization_id;
  const campaignId = task.campaign_id!;
  const contentItemId = input.contentItemId;

  const { data: variant, error: variantError } = await db
    .from("content_variants")
    .select("id,payload")
    .eq("content_item_id", contentItemId)
    .eq("version", input.version)
    .single();
  if (variantError || !variant) throw new Error(`Content variant unavailable for review: ${variantError?.code}`);

  // The quality gate compares this piece against its brief, and against the other platforms of
  // the same concept so a set that is really one text cannot pass as native.
  const { data: siblings } = await db
    .from("content_variants")
    .select("payload,content_items!inner(concept_id)")
    .eq("organization_id", organizationId)
    .eq("campaign_id", campaignId)
    .limit(50);

  const payload = variant.payload as PlatformContentVariant;
  const evaluation = evaluateContent({ items: [{ brief: input.brief, variant: payload }] });
  const conceptPeers = (siblings ?? [])
    .map((row) => row.payload as PlatformContentVariant)
    .filter((peer) => peer.conceptId === payload.conceptId && peer.platform !== payload.platform);
  const duplication = conceptPeers.length ? checkDuplication([payload, ...conceptPeers]) : [];

  const quality = summarizeQuality({
    ...evaluation,
    errors: [...evaluation.errors, ...duplication.filter((finding) => finding.severity === "error")],
    warnings: [...evaluation.warnings, ...duplication.filter((finding) => finding.severity === "warning")],
    score: { passed: evaluation.score.passed, total: evaluation.score.total + (conceptPeers.length ? 1 : 0) },
  });
  const gatePassed = quality.errors.length === 0 && value.approved;

  await checked(
    db.from("content_reviews").upsert(
      {
        organization_id: organizationId,
        campaign_id: campaignId,
        content_item_id: contentItemId,
        variant_id: variant.id,
        version: input.version,
        visual_direction: value.visualDirection,
        storyboard: value.storyboard,
        motion_notes: value.motionNotes,
        composition_notes: value.compositionNotes,
        brand_consistency: value.brandConsistency,
        findings: value.findings,
        quality,
        approved: gatePassed,
        reason: value.reason,
        reviewed_by_agent_id: agent.id,
      },
      { onConflict: "content_item_id,version" },
    ),
  );

  await checked(
    db
      .from("content_items")
      .update({
        quality,
        quality_passed: quality.passed && quality.errors.length === 0,
        quality_checks_passed: quality.checksPassed,
        quality_checks_total: quality.checksTotal,
        reviewed_by_agent_id: agent.id,
        status: gatePassed ? "ready" : "needs_revision",
      })
      .eq("id", contentItemId)
      .eq("organization_id", organizationId),
  );

  if (!gatePassed) {
    await activity(db, {
      organizationId, campaignId, contentItemId, action: "content.needs_revision", agentId: agent.id, taskId: task.id,
      summary: `La pieza de ${input.platform} no superó el control de calidad`,
      metadata: { errors: quality.errors.map((finding) => finding.check), checks: `${quality.checksPassed}/${quality.checksTotal}` },
    });
    return;
  }

  await checked(db.from("content_items").update({ status: "waiting_approval" }).eq("id", contentItemId).eq("organization_id", organizationId));

  const { data: openApproval, error: approvalReadError } = await db
    .from("approvals")
    .select("id")
    .eq("content_item_id", contentItemId)
    .eq("status", "requested")
    .maybeSingle();
  if (approvalReadError) throw new Error(`Content approval read failed: ${approvalReadError.code}`);

  if (!openApproval) {
    await checked(
      db.from("approvals").insert({
        organization_id: organizationId,
        campaign_id: campaignId,
        content_item_id: contentItemId,
        task_id: task.id,
        status: "requested",
        risk_level: "low",
        requested_by_type: "agent",
        requested_by_id: agent.id,
        reason: `Contenido de ${input.platform} listo para revisión humana`,
        proposed_change: {
          artifact: "content_item",
          content_item_id: contentItemId,
          platform: input.platform,
          format: input.format,
          version: input.version,
          external_side_effects: false,
        },
        expected_impact: "Aprobar la pieza editorial; no se publica, agenda ni gasta presupuesto.",
      }),
    );
  }

  await activity(db, {
    organizationId, campaignId, contentItemId, action: "content.ready", agentId: agent.id, taskId: task.id,
    summary: `Emilia aprobó la dirección creativa de la pieza de ${input.platform}`,
    metadata: { checks: `${quality.checksPassed}/${quality.checksTotal}`, warnings: quality.warnings.length, prompt_version: CONTENT_PROMPTS.creativeReview.version },
  });
  await activity(db, {
    organizationId, campaignId, contentItemId, action: "content.approval_requested", agentId: agent.id, taskId: task.id,
    summary: "La pieza está esperando aprobación humana",
    metadata: { platform: input.platform, version: input.version },
  });
}
