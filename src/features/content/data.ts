import { isDemoMode } from "@/lib/env";
import { getOrganizationContext } from "@/features/organizations/context";
import type { ContentStatus } from "@/server/content-factory/lifecycle";
import type { QualitySummary } from "@/server/content-factory/schemas";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";
import type { ContentBrief, BrandContext } from "@/server/content/schemas/brief";
import { getAdapter } from "@/server/content/adapters";
import type { ContentConcept } from "@/server/content/schemas/concept";

// Read models for the Content Studio. Every list query embeds its relations so the page
// renders from one round trip per surface instead of one per row.

export type ContentFilters = { campaign?: string; platform?: string; format?: string; pillar?: string; status?: string; agent?: string; date?: string; page?: string };

export type ContentListItem = {
  id: string; title: string; platform: string; format: string; status: ContentStatus;
  pillar: string; angle: string; campaignId: string; campaignName: string;
  qualityPassed: boolean | null; checksPassed: number | null; checksTotal: number | null;
  agentName: string | null; currentVersion: number; updatedAt: string;
};

export const CONTENT_PAGE_SIZE = 25;

const dateFloor = (value: string | undefined) => {
  const days = value === "today" ? 1 : value === "week" ? 7 : value === "month" ? 30 : 0;
  return days ? new Date(Date.now() - days * 86_400_000).toISOString() : null;
};


// --- demo fixtures -----------------------------------------------------------------------
// Reachable only while isDemoMode is true. Live mode never reads any of this, which is what
// keeps DEMO_MODE=false free of demo content. Payloads come from the real adapters so the
// previews render genuine shapes rather than hand-written stand-ins.

const DEMO_CAMPAIGN = { id: "00000000-0000-0000-0000-000000000401", name: "Tu equipo de marketing coordinado", business_goal: "awareness", objective_id: "00000000-0000-0000-0000-000000000501", objectives: { title: "Aumentar registros calificados un 30%", metric: "qualified_leads", target: 200 } };

const demoBrand: BrandContext = { name: "Northstar Urban", toneOfVoice: "Claro, experto y cercano", personality: ["directa"], preferredWords: ["equipo", "proceso"], forbiddenWords: ["revolucionario"], forbiddenClaims: ["resultados garantizados"], informalityCeiling: "conversational", visualInstructions: "Paleta sobria, sin stock genérico." };

const demoConcept: ContentConcept = {
  conceptId: "CONCEPT-DEMO-001", title: "Educación: Proceso antes que herramienta", internalName: "demo-proceso-antes-que-herramienta",
  pillar: "Educación", angle: "Proceso antes que herramienta", objective: "educational",
  audience: { persona: "Responsable de marketing en una PyME B2B", problem: "Su equipo dedica gran parte de la semana a tareas repetitivas que nadie documentó nunca.", promise: "Con el proceso escrito esas tareas se vuelven delegables y el equipo recupera tiempo." },
  coreIdea: "Antes de automatizar cualquier tarea hay que poder describirla en voz alta de principio a fin. Las tareas que no se pueden describir no están listas para automatizarse.",
  hookDirection: { preferredTypes: ["problem", "mistake"] }, format: "carousel", platforms: ["instagram", "tiktok"], cta: "save", evidenceRequired: [], creativeNotes: ["Evitar jerga de producto."],
};

const demoCampaignContext = { campaignId: DEMO_CAMPAIGN.id, name: DEMO_CAMPAIGN.name, objective: "awareness" as const };

function demoPiece(platform: "instagram" | "tiktok", id: string, status: ContentStatus, version: number) {
  const concept = { ...demoConcept, platforms: [platform] as ContentConcept["platforms"] };
  const adapter = getAdapter(platform);
  const context = { concept, brand: demoBrand, campaign: demoCampaignContext };
  const brief = adapter.brief(context);
  const variant = adapter.draft(context);
  const quality: QualitySummary = { passed: true, checksPassed: platform === "tiktok" ? 20 : 21, checksTotal: 21, errors: [], warnings: platform === "tiktok" ? [{ check: "duplication.repeated_hook", severity: "warning", message: "TikTok e Instagram presentan una adaptación demasiado similar en la apertura.", platform: "tiktok" }] : [], recommendations: platform === "tiktok" ? ["Reescribí cada variante desde el playbook de su plataforma en vez de adaptar un texto único."] : [] };
  return { id, platform, format: brief.format, status, version, brief, variant, quality, concept };
}

const DEMO_PIECES = [
  demoPiece("instagram", "00000000-0000-0000-0000-000000000601", "waiting_approval", 1),
  demoPiece("tiktok", "00000000-0000-0000-0000-000000000602", "creative_review", 1),
];

function demoListItems(): ContentListItem[] {
  return DEMO_PIECES.map((piece) => ({
    id: piece.id, title: demoConcept.title, platform: piece.platform, format: piece.format, status: piece.status,
    pillar: demoConcept.pillar, angle: demoConcept.angle, campaignId: DEMO_CAMPAIGN.id, campaignName: DEMO_CAMPAIGN.name,
    qualityPassed: piece.quality.passed, checksPassed: piece.quality.checksPassed, checksTotal: piece.quality.checksTotal,
    agentName: "Clara", currentVersion: piece.version, updatedAt: new Date().toISOString(),
  }));
}

/** The subset of filters that is meaningful without a database behind it. */
function applyDemoFilters(items: ContentListItem[], filters: ContentFilters) {
  return items.filter((item) =>
    (!filters.campaign || item.campaignId === filters.campaign)
    && (!filters.platform || item.platform === filters.platform)
    && (!filters.format || item.format === filters.format)
    && (!filters.status || item.status === filters.status)
    && (!filters.pillar || item.pillar === filters.pillar)
    && (!filters.agent || item.agentName === filters.agent));
}

type ConceptJoin = { pillar: string; angle: string } | null;
type CampaignJoin = { id: string; name: string } | null;
type AgentJoin = { display_name: string } | null;

export async function getContentList(filters: ContentFilters) {
  const ctx = isDemoMode ? null : await getOrganizationContext();
  if (!ctx) {
    // Demo has to honour the same filters as live, or the filter bar reads as broken.
    const items = isDemoMode ? applyDemoFilters(demoListItems(), filters) : [];
    return { mode: (isDemoMode ? "demo" : "live") as "demo" | "live", orgName: isDemoMode ? "Northstar Urban" : "Sin organización", items, total: items.length, page: 1, pageSize: CONTENT_PAGE_SIZE, campaigns: (isDemoMode ? [{ id: DEMO_CAMPAIGN.id, name: DEMO_CAMPAIGN.name }] : []) as CampaignJoin[] };
  }

  const page = Math.max(1, Number(filters.page) || 1);
  const from = (page - 1) * CONTENT_PAGE_SIZE;

  let query = ctx.db
    .from("content_items")
    .select("id,title,platform,format,status,current_version,updated_at,quality_passed,quality_checks_passed,quality_checks_total,campaign_id,content_concepts!inner(pillar,angle),campaigns!inner(id,name),agents:created_by_agent_id(display_name)", { count: "exact" })
    .eq("organization_id", ctx.orgId);

  if (filters.campaign) query = query.eq("campaign_id", filters.campaign);
  if (filters.platform) query = query.eq("platform", filters.platform);
  if (filters.format) query = query.eq("format", filters.format);
  if (filters.status) query = query.eq("status", filters.status);
  if (filters.pillar) query = query.eq("content_concepts.pillar", filters.pillar);
  const floor = dateFloor(filters.date);
  if (floor) query = query.gte("updated_at", floor);

  const [{ data, count }, { data: campaigns }] = await Promise.all([
    query.order("updated_at", { ascending: false }).range(from, from + CONTENT_PAGE_SIZE - 1),
    ctx.db.from("campaigns").select("id,name").eq("organization_id", ctx.orgId).order("created_at", { ascending: false }).limit(50),
  ]);

  const items: ContentListItem[] = (data ?? []).map((row) => {
    const concept = row.content_concepts as unknown as ConceptJoin;
    const campaign = row.campaigns as unknown as CampaignJoin;
    const agent = row.agents as unknown as AgentJoin;
    return {
      id: row.id, title: row.title, platform: row.platform, format: row.format, status: row.status as ContentStatus,
      pillar: concept?.pillar ?? "—", angle: concept?.angle ?? "—",
      campaignId: campaign?.id ?? row.campaign_id, campaignName: campaign?.name ?? "Campaña",
      qualityPassed: row.quality_passed, checksPassed: row.quality_checks_passed, checksTotal: row.quality_checks_total,
      agentName: agent?.display_name ?? null, currentVersion: row.current_version, updatedAt: row.updated_at,
    };
  });

  const filtered = filters.agent ? items.filter((item) => item.agentName === filters.agent) : items;
  return { mode: "live" as const, orgName: ctx.orgName, items: filtered, total: count ?? filtered.length, page, pageSize: CONTENT_PAGE_SIZE, campaigns: (campaigns ?? []) as CampaignJoin[] };
}


function demoDetail(id: string, requestedVersion?: number) {
  const piece = DEMO_PIECES.find((entry) => entry.id === id);
  if (!piece) return null;
  const versions = [1];
  const selected = requestedVersion && versions.includes(requestedVersion) ? requestedVersion : 1;
  const now = new Date().toISOString();
  return {
    mode: "demo" as const,
    orgName: "Northstar Urban",
    role: "owner",
    item: {
      id: piece.id, title: demoConcept.title, platform: piece.platform, format: piece.format, status: piece.status,
      current_version: piece.version, brief: piece.brief, quality: piece.quality, updated_at: now,
    } as unknown as Record<string, string> & { status: ContentStatus; platform: string; format: string; title: string; current_version: number; brief: ContentBrief },
    concept: { concept_key: demoConcept.conceptId, pillar: demoConcept.pillar, angle: demoConcept.angle, core_idea: demoConcept.coreIdea, audience_persona: demoConcept.audience.persona },
    campaign: DEMO_CAMPAIGN,
    brief: piece.brief,
    variant: { id: "demo-variant", version: 1, payload: piece.variant, hook_variants: [], generated_by: "mock", provider: "mock", prompt_version: "content-copy.v1", created_at: now, agents: { display_name: "Clara" } },
    review: {
      visual_direction: "Sistema visual consistente; legibilidad por encima de la decoración.",
      storyboard: [{ beat: "Beat 1", visual: "Problema en pantalla", motion: "Corte seco" }],
      motion_notes: ["Cambio de plano antes del segundo 2."],
      composition_notes: ["Texto fuera del tercio inferior."],
      brand_consistency: "consistent",
      findings: [],
      quality: piece.quality,
      approved: true,
    } as unknown as Record<string, unknown>,
    quality: piece.quality,
    versions: [{ version: 1, reason: "Primera versión escrita desde el playbook de la plataforma.", feedback: null, createdAt: now, agentName: "Clara", requestedBy: null }] as ContentVersionRow[],
    availableVersions: versions,
    selectedVersion: selected,
    tasks: [
      { id: "demo-task-plan", title: "Planificar contenido", type: "content.plan", status: "completed", created_at: now, agents: { display_name: "Bruno" } },
      { id: "demo-task-copy", title: "Escribir variante nativa", type: "content.copy", status: "completed", created_at: now, agents: { display_name: "Clara" } },
      { id: "demo-task-review", title: "Revisar dirección creativa", type: "content.creative_review", status: "completed", created_at: now, agents: { display_name: "Emilia" } },
    ],
    approval: piece.status === "waiting_approval" ? { id: "00000000-0000-0000-0000-000000000701", status: "requested", decision_note: null, created_at: now } : null,
    activity: [
      { id: "d1", action: "content.ready", summary: "Emilia aprobó la dirección creativa", created_at: now, agents: { display_name: "Emilia" } },
      { id: "d2", action: "content.copy_written", summary: "Clara escribió la versión 1", created_at: now, agents: { display_name: "Clara" } },
      { id: "d3", action: "content.plan_created", summary: "Bruno planificó los conceptos editoriales", created_at: now, agents: { display_name: "Bruno" } },
    ],
  };
}

export type ContentVersionRow = { version: number; reason: string; feedback: string | null; createdAt: string; agentName: string | null; requestedBy: string | null };

export async function getContentDetail(id: string, requestedVersion?: number) {
  if (isDemoMode) return demoDetail(id, requestedVersion);
  const ctx = await getOrganizationContext();
  if (!ctx) return null;

  const { data: item } = await ctx.db
    .from("content_items")
    .select("*,content_concepts!inner(*),campaigns!inner(id,name,business_goal,objective_id,objectives(title,metric,target)),creator:created_by_agent_id(display_name),reviewer:reviewed_by_agent_id(display_name)")
    .eq("id", id)
    .eq("organization_id", ctx.orgId)
    .maybeSingle();
  if (!item) return null;

  const [variants, reviews, versions, tasks, approval, activity] = await Promise.all([
    ctx.db.from("content_variants").select("id,version,payload,hook_variants,generated_by,provider,prompt_version,created_at,agents:created_by_agent_id(display_name)").eq("content_item_id", id).order("version", { ascending: false }),
    ctx.db.from("content_reviews").select("*,agents:reviewed_by_agent_id(display_name)").eq("content_item_id", id).order("version", { ascending: false }),
    ctx.db.from("content_versions").select("version,reason,feedback,created_at,requested_by,agents:created_by_agent_id(display_name)").eq("content_item_id", id).order("version", { ascending: false }),
    ctx.db.from("tasks").select("id,title,type,status,created_at,agents(display_name)").eq("content_item_id", id).order("created_at"),
    ctx.db.from("approvals").select("id,status,decision_note,created_at").eq("content_item_id", id).order("created_at", { ascending: false }).limit(1).maybeSingle(),
    ctx.db.from("activity_log").select("id,action,summary,created_at,agents(display_name)").eq("content_item_id", id).order("created_at", { ascending: false }).limit(40),
  ]);

  const versionRows = (variants.data ?? []).map((row) => row.version);
  const version = requestedVersion && versionRows.includes(requestedVersion) ? requestedVersion : (versionRows[0] ?? item.current_version);
  const variant = (variants.data ?? []).find((row) => row.version === version) ?? null;
  const review = (reviews.data ?? []).find((row) => row.version === version) ?? null;

  return {
    mode: "live" as const,
    orgName: ctx.orgName,
    role: ctx.role,
    item,
    concept: item.content_concepts as unknown as Record<string, unknown>,
    campaign: item.campaigns as unknown as { id: string; name: string; business_goal: string; objective_id: string | null; objectives: { title: string; metric: string; target: number } | null },
    brief: item.brief as ContentBrief,
    variant: variant ? { ...variant, payload: variant.payload as PlatformContentVariant } : null,
    review,
    quality: (review?.quality ?? item.quality) as QualitySummary | null,
    versions: (versions.data ?? []).map((row) => ({
      version: row.version, reason: row.reason, feedback: row.feedback, createdAt: row.created_at,
      agentName: (row.agents as unknown as AgentJoin)?.display_name ?? null, requestedBy: row.requested_by,
    })) as ContentVersionRow[],
    availableVersions: versionRows,
    selectedVersion: version,
    tasks: tasks.data ?? [],
    approval: approval.data,
    activity: activity.data ?? [],
  };
}

export type CampaignContentProgress = { total: number; byStatus: Record<string, number> };

/** Real counts for the campaign detail panel. One grouped read, never a per-status query. */
export async function getCampaignContentProgress(campaignId: string): Promise<CampaignContentProgress> {
  const ctx = isDemoMode ? null : await getOrganizationContext();
  if (!ctx) return { total: 0, byStatus: {} };
  const { data } = await ctx.db.from("content_items").select("status").eq("organization_id", ctx.orgId).eq("campaign_id", campaignId).limit(500);
  const byStatus: Record<string, number> = {};
  for (const row of data ?? []) byStatus[row.status] = (byStatus[row.status] ?? 0) + 1;
  return { total: (data ?? []).length, byStatus };
}

/** Operational counters for Marketing HQ. No reach, engagement or conversion: nothing is published. */
export async function getContentOperationalCounts() {
  const ctx = isDemoMode ? null : await getOrganizationContext();
  if (!ctx) return { inCreation: 0, waitingApproval: 0, ready: 0 };
  const { data } = await ctx.db.from("content_items").select("status").eq("organization_id", ctx.orgId).limit(1000);
  const rows = data ?? [];
  const count = (statuses: string[]) => rows.filter((row) => statuses.includes(row.status)).length;
  return {
    inCreation: count(["concept", "brief", "generating", "creative_review", "needs_revision"]),
    waitingApproval: count(["waiting_approval"]),
    ready: count(["ready", "approved"]),
  };
}

export type GalleryItem = ContentListItem & {
  variant: PlatformContentVariant | null;
  /** Short-lived links to whatever audio the piece already has. */
  audioUrl: string | null;
  musicUrl: string | null;
};

/**
 * The list, plus the written version of each piece, so the gallery can render every one inside
 * the chrome of its own platform. One extra query for the whole page rather than one per card.
 *
 * A piece with no variant yet is kept in the result rather than dropped: "planned but not
 * written" is a real state, and hiding it would misreport how much exists.
 */
export async function getContentGallery(filters: ContentFilters): Promise<Omit<Awaited<ReturnType<typeof getContentList>>, "items"> & { items: GalleryItem[] }> {
  const list = await getContentList(filters);
  if (list.items.length === 0) return { ...list, items: [] };

  if (list.mode === "demo") {
    return { ...list, items: list.items.map((item) => ({ ...item, variant: DEMO_PIECES.find((piece) => piece.id === item.id)?.variant ?? null, audioUrl: null, musicUrl: null })) };
  }

  const ctx = await getOrganizationContext();
  if (!ctx) return { ...list, items: list.items.map((item) => ({ ...item, variant: null, audioUrl: null, musicUrl: null })) };

  const ids = list.items.map((item) => item.id);
  const [{ data }, assets] = await Promise.all([
    ctx.db.from("content_variants").select("content_item_id,version,payload").eq("organization_id", ctx.orgId).in("content_item_id", ids),
    ctx.db.from("content_assets").select("content_item_id,content_version,storage_path,slot").eq("organization_id", ctx.orgId).in("slot", ["voiceover", "music"]).in("content_item_id", ids),
  ]);

  // One signing call for the whole page. Signing per card would be a storage round trip per
  // piece, which is what kept the sequence collapsed and silent until now.
  const assetRows = (assets.data ?? []) as Array<{ content_item_id: string; content_version: number; storage_path: string; slot: string }>;
  const signedByPath = new Map<string, string>();
  if (assetRows.length > 0) {
    const signed = await ctx.db.storage.from("content-assets").createSignedUrls(assetRows.map((row) => row.storage_path), 3600);
    for (const entry of signed.data ?? []) {
      if (entry.path && entry.signedUrl) signedByPath.set(entry.path, entry.signedUrl);
    }
  }

  const rows = (data ?? []) as Array<{ content_item_id: string; version: number; payload: unknown }>;
  const items = list.items.map((item) => {
    const forItem = rows.filter((row) => row.content_item_id === item.id);
    // The version the item currently points at; if that row is missing, the newest one written.
    const chosen = forItem.find((row) => row.version === item.currentVersion)
      ?? [...forItem].sort((a, b) => b.version - a.version)[0];
    const assetFor = (slot: string) => {
      const row = assetRows.find((entry) => entry.content_item_id === item.id && entry.content_version === item.currentVersion && entry.slot === slot);
      return row ? signedByPath.get(row.storage_path) ?? null : null;
    };
    return {
      ...item,
      variant: (chosen?.payload as PlatformContentVariant | undefined) ?? null,
      audioUrl: assetFor("voiceover"),
      musicUrl: assetFor("music"),
    };
  });

  return { ...list, items };
}
