import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pendingCampaignWork, runManualCampaignTasks } from "@/server/workers/dispatcher";
import { configuredAgentProviderName } from "@/server/agents/provider";
import { DomainError } from "@/server/errors";
import type { BrandContext } from "@/server/content/schemas/brief";
import type { CampaignObjective } from "@/server/content/ctas";
import type { ContentPlanTaskInput } from "./mock-content";
import type { CampaignChannel, PillarWeight } from "./planning";

// Content Factory runs only when a person asks for it. There is no schedule, no Cron
// dependency and no background trigger: the kill switch stays off and this path is the sole
// way production content is produced, which is why it validates the campaign first.

/** Upper bound on pieces produced by one run, so a long campaign cannot create an unbounded plan. */
export const MAX_PIECES_PER_RUN = 12;

// How much of the factory runs in one HTTP request.
//
// It used to be all of it: one plan step plus a copy and a review per piece, twenty-nine steps
// in a single call, written when every step returned in milliseconds. A model answering turns
// that into twenty-five paid calls attempted inside a function that stops at sixty seconds --
// most of them killed halfway, each one charged for.
//
// So a model claims one step per request and the caller asks again. The plan step stays
// deterministic and costs nothing, but it is not worth a special case.
const stepsPerCall = () => (configuredAgentProviderName() === "mock" ? 1 + MAX_PIECES_PER_RUN * 2 + 4 : 1);
/** Leaves room inside the platform's limit for the reads and the response after the last step. */
const BUDGET_MS = 45_000;
const LEASE_SECONDS = 75;
/** Matches the runtime's own bound, so a step is re-asked rather than handed to a person. */
const STAGE_ATTEMPTS = 6;

const OBJECTIVE_BY_GOAL: Record<string, CampaignObjective> = {
  awareness: "awareness",
  engagement: "engagement",
  traffic: "traffic",
  leads: "lead_generation",
  lead_generation: "lead_generation",
  sales: "sales",
  retention: "loyalty",
  loyalty: "loyalty",
};

function campaignObjective(businessGoal: string | null): CampaignObjective {
  const key = (businessGoal ?? "").toLowerCase().trim();
  return OBJECTIVE_BY_GOAL[key] ?? "awareness";
}

export async function runContentFactoryForCampaign(organizationId: string, campaignId: string, userId: string) {
  const db = createAdminClient();

  const { data: campaign, error } = await db
    .from("campaigns")
    .select("id,name,status,approved_at,strategy_version,objective_id,business_goal,target_audience,problem,promise,constraints")
    .eq("id", campaignId)
    .eq("organization_id", organizationId)
    .single();
  if (error || !campaign) throw new DomainError("authorization", "Campaign unavailable.", "campaign_not_found", false);

  // Only an approved strategy may become content. A ready-but-unapproved campaign is still
  // waiting on a person, and producing content for it would bypass that decision.
  if (campaign.status !== "ready" || !campaign.approved_at) {
    throw new DomainError("validation", "Content Factory requires an approved campaign strategy.", "campaign_not_approved", false);
  }

  const { count: running } = await db
    .from("tasks")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId)
    .in("status", ["queued", "running"]);
  if (running) throw new DomainError("validation", "Ya hay trabajo en curso para esta campaña.", "content_already_running", false);

  const version = campaign.strategy_version;
  const [pillars, angles, channels, audience, brand, strategist] = await Promise.all([
    db.from("campaign_content_pillars").select("name,weight").eq("campaign_id", campaignId).eq("strategy_version", version),
    db.from("campaign_angles").select("name,description").eq("campaign_id", campaignId).eq("strategy_version", version).order("confidence", { ascending: false }),
    db.from("campaign_channels").select("channel,enabled,priority,formats,publishing_frequency").eq("campaign_id", campaignId).eq("strategy_version", version),
    db.from("campaign_audiences").select("name,description").eq("campaign_id", campaignId).eq("strategy_version", version).maybeSingle(),
    db.from("brands").select("name,tone_of_voice,personality,preferred_words,forbidden_words,forbidden_claims,visual_instructions").eq("organization_id", organizationId).limit(1).maybeSingle(),
    db.from("agents").select("id").eq("organization_id", organizationId).eq("role", "content_strategist").eq("status", "active").single(),
  ]);

  if (strategist.error || !strategist.data) throw new DomainError("validation", "Bruno no está disponible en esta organización.", "strategist_unavailable", false);
  if (!pillars.data?.length) throw new DomainError("validation", "La campaña no tiene pilares de contenido.", "campaign_pillars_missing", false);
  if (!channels.data?.some((channel) => channel.enabled)) throw new DomainError("validation", "La campaña no tiene canales habilitados.", "campaign_channels_missing", false);

  const brandContext: BrandContext = {
    name: brand.data?.name ?? "Marca",
    toneOfVoice: brand.data?.tone_of_voice ?? "Claro y directo",
    personality: brand.data?.personality ?? [],
    preferredWords: brand.data?.preferred_words ?? [],
    forbiddenWords: brand.data?.forbidden_words ?? [],
    forbiddenClaims: brand.data?.forbidden_claims ?? [],
    informalityCeiling: "conversational",
    visualInstructions: brand.data?.visual_instructions ?? "",
  };

  const objective = campaignObjective(campaign.business_goal);
  const input: ContentPlanTaskInput & { campaignName: string; objective: CampaignObjective; brand: BrandContext; strategyVersion: number } = {
    campaignId,
    strategyVersion: version,
    campaignName: campaign.name,
    objective,
    objectiveTitle: campaign.name,
    durationWeeks: 4,
    maxPieces: MAX_PIECES_PER_RUN,
    audiencePersona: audience.data?.name ?? campaign.target_audience ?? "Audiencia de la campaña",
    audienceProblem: campaign.problem ?? audience.data?.description ?? "Problema declarado en la estrategia.",
    audiencePromise: campaign.promise ?? "Promesa declarada en la estrategia.",
    pillars: (pillars.data ?? []).map((pillar) => ({ name: pillar.name, weight: Number(pillar.weight) })) as PillarWeight[],
    angles: (angles.data ?? []).map((angle) => ({ name: angle.name, description: angle.description ?? angle.name })),
    channels: (channels.data ?? []).map((channel) => ({
      channel: channel.channel,
      enabled: channel.enabled,
      priority: channel.priority ?? 0,
      formats: channel.formats ?? [],
      publishingFrequency: channel.publishing_frequency,
    })) as CampaignChannel[],
    brand: brandContext,
    constraints: campaign.constraints ?? [],
  };

  const { data: task, error: taskError } = await db
    .from("tasks")
    .insert({
      organization_id: organizationId,
      campaign_id: campaignId,
      objective_id: campaign.objective_id,
      title: `Planificar contenido: ${campaign.name}`,
      description: "Bruno convierte la estrategia aprobada en conceptos editoriales por canal.",
      type: "content.plan",
      status: "queued",
      priority: "high",
      created_by_type: "user",
      created_by_id: userId,
      assigned_agent_id: strategist.data.id,
      reason: "Ejecución manual solicitada por un usuario autorizado",
      expected_impact: "Crear conceptos y piezas para revisión, sin publicar ni gastar",
      risk_level: "low",
      requires_approval: false,
      max_attempts: STAGE_ATTEMPTS,
      scheduled_for: new Date().toISOString(),
      idempotency_key: `content:${campaignId}:plan:${version}:${Date.now()}`,
      input,
      context_snapshot: { organization_id: organizationId, campaign_id: campaignId, strategy_version: version },
    })
    .select("id")
    .single();
  if (taskError || !task) throw new DomainError("non_retryable", "No se pudo iniciar Content Factory.", "content_task_create_failed", false);

  await db.from("activity_log").insert({
    organization_id: organizationId,
    campaign_id: campaignId,
    action: "content.plan_started",
    actor_type: "user",
    actor_id: userId,
    entity_type: "campaign",
    entity_id: campaignId,
    task_id: task.id,
    summary: "Content Factory iniciada manualmente",
    metadata: { strategy_version: version, automation_enabled: false, max_pieces: MAX_PIECES_PER_RUN },
  });

  const report = await runManualCampaignTasks({ campaignId, maxSteps: stepsPerCall(), leaseSeconds: LEASE_SECONDS, budgetMs: BUDGET_MS });

  const { count: items } = await db
    .from("content_items")
    .select("id", { count: "exact", head: true })
    .eq("campaign_id", campaignId);

  const left = await pendingCampaignWork(db, campaignId);
  return { taskId: task.id, report, items: items ?? 0, done: left.count === 0, nextAttemptAt: left.nextAttemptAt };
}

/**
 * Continue a factory run already under way.
 *
 * Separate from starting one for the same reason the campaign paths are: starting refuses while
 * tasks are queued, and continuing is only meaningful when they are. One entry point doing both
 * would let a second press plan a second batch of pieces.
 */
export async function resumeContentFactoryForCampaign(organizationId: string, campaignId: string) {
  const db = createAdminClient();
  const { data: campaign, error } = await db
    .from("campaigns").select("id").eq("id", campaignId).eq("organization_id", organizationId).single();
  if (error || !campaign) throw new DomainError("authorization", "Campaign unavailable.", "campaign_not_found", false);

  const report = await runManualCampaignTasks({ campaignId, maxSteps: stepsPerCall(), leaseSeconds: LEASE_SECONDS, budgetMs: BUDGET_MS });
  const { count: items } = await db.from("content_items").select("id", { count: "exact", head: true }).eq("campaign_id", campaignId);
  const left = await pendingCampaignWork(db, campaignId);
  return { taskId: null, report, items: items ?? 0, done: left.count === 0, nextAttemptAt: left.nextAttemptAt };
}
