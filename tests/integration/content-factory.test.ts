import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { assertSafeRemoteTestEnvironment, remoteTestsConfigured } from "../helpers/remote-test-guard";

// The persisted Content Factory chain against an isolated project. Skipped unless
// TEST_ENVIRONMENT=true and the SUPABASE_TEST_* variables point at a disposable database;
// the guard refuses production outright.

const run = remoteTestsConfigured(["SUPABASE_TEST_URL", "SUPABASE_TEST_ANON_KEY", "SUPABASE_TEST_SERVICE_KEY"]);
const url = process.env.SUPABASE_TEST_URL!;
const service = process.env.SUPABASE_TEST_SERVICE_KEY!;

let admin: SupabaseClient;
let organizationId = "";
let campaignId = "";
let objectiveId = "";
const userIds: string[] = [];

const AGENTS = [
  ["cmo", "Sofía"], ["market_intelligence", "Mateo"], ["social_media_director", "Valentina"],
  ["content_strategist", "Bruno"], ["copywriter", "Clara"], ["creative_director", "Emilia"],
  ["analytics", "Tomás"], ["marketing_auditor", "Vera"],
] as const;

describe.skipIf(!run)("content factory persisted chain", () => {
  beforeAll(async () => {
    assertSafeRemoteTestEnvironment();
    admin = createClient(url, service, { auth: { persistSession: false } });

    const email = `e2e_content_${crypto.randomUUID()}@spectro.invalid`;
    const password = `M01!${crypto.randomUUID()}aA`;
    const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { full_name: "E2E Content" } });
    if (error || !created.user) throw error ?? new Error("Auth fixture missing");
    userIds.push(created.user.id);

    const org = await admin.from("organizations").insert({ name: "E2E Content Org", slug: `e2e-content-${crypto.randomUUID()}`, created_by: created.user.id }).select("id").single();
    organizationId = org.data!.id;
    await admin.from("organization_members").insert({ organization_id: organizationId, user_id: created.user.id, role: "owner" });
    await admin.from("brands").insert({ organization_id: organizationId, name: "E2E Brand", tone_of_voice: "Claro", forbidden_words: ["revolucionario"], forbidden_claims: ["resultados garantizados"] });

    const objective = await admin.from("objectives").insert({ organization_id: organizationId, title: "Aumentar registros", metric: "leads", target: 100 }).select("id").single();
    objectiveId = objective.data!.id;

    await admin.from("agents").insert(AGENTS.map(([role, name]) => ({ organization_id: organizationId, role, display_name: name, autonomy_level: 1 })));

    // A campaign whose strategy a person already approved: the only state the factory accepts.
    const campaign = await admin.from("campaigns").insert({
      organization_id: organizationId, objective_id: objectiveId, name: "E2E Content Campaign", slug: `e2e-c-${crypto.randomUUID()}`,
      status: "ready", business_goal: "awareness", approved_at: new Date().toISOString(), strategy_version: 1,
      problem: "El equipo pierde tiempo en tareas repetitivas que nadie documentó.",
      promise: "Con el proceso escrito el trabajo se vuelve delegable.",
    }).select("id").single();
    campaignId = campaign.data!.id;

    await admin.from("campaign_audiences").insert({ organization_id: organizationId, campaign_id: campaignId, strategy_version: 1, name: "Head of Marketing", description: "Responsable de crecimiento en PyME B2B." });
    await admin.from("campaign_content_pillars").insert([
      { organization_id: organizationId, campaign_id: campaignId, strategy_version: 1, name: "Educación", weight: 60 },
      { organization_id: organizationId, campaign_id: campaignId, strategy_version: 1, name: "Producto", weight: 40 },
    ]);
    await admin.from("campaign_angles").insert([
      { organization_id: organizationId, campaign_id: campaignId, strategy_version: 1, name: "Proceso antes que herramienta", description: "Describir la tarea antes de automatizarla.", confidence: 0.8 },
    ]);
    await admin.from("campaign_channels").insert([
      { organization_id: organizationId, campaign_id: campaignId, strategy_version: 1, channel: "tiktok", enabled: true, priority: 2, formats: ["short_video"], publishing_frequency: "semanal", score: 80, confidence: 0.8 },
      { organization_id: organizationId, campaign_id: campaignId, strategy_version: 1, channel: "linkedin", enabled: true, priority: 1, formats: ["text_post"], publishing_frequency: "semanal", score: 75, confidence: 0.8 },
    ]);
  }, 120_000);

  afterAll(async () => {
    if (!run) return;
    if (organizationId) await admin.from("organizations").delete().eq("id", organizationId);
    for (const id of userIds) await admin.auth.admin.deleteUser(id);
  }, 120_000);

  it("runs the whole chain from an approved campaign to content waiting for approval", async () => {
    const { runContentFactoryForCampaign } = await import("@/server/content-factory/workflow");
    const result = await runContentFactoryForCampaign(organizationId, campaignId, userIds[0]);
    expect(result.items).toBeGreaterThan(0);

    const concepts = await admin.from("content_concepts").select("id,concept_key,pillar").eq("campaign_id", campaignId);
    expect(concepts.data!.length).toBeGreaterThan(0);

    const items = await admin.from("content_items").select("id,status,platform,quality_checks_passed,quality_checks_total").eq("campaign_id", campaignId);
    expect(items.data!.length).toBeGreaterThan(0);
    expect(items.data!.every((item) => ["waiting_approval", "needs_revision"].includes(item.status))).toBe(true);

    const variants = await admin.from("content_variants").select("id,version,generated_by").eq("campaign_id", campaignId);
    expect(variants.data!.every((variant) => variant.version === 1)).toBe(true);
    expect(variants.data!.every((variant) => variant.generated_by === "mock")).toBe(true);

    const reviews = await admin.from("content_reviews").select("id,approved,quality").eq("campaign_id", campaignId);
    expect(reviews.data!.length).toBe(items.data!.length);

    const tasks = await admin.from("tasks").select("type,status").eq("campaign_id", campaignId);
    const types = tasks.data!.map((task) => task.type);
    expect(types).toContain("content.plan");
    expect(types).toContain("content.copy");
    expect(types).toContain("content.creative_review");
  }, 300_000);

  it("plans each channel natively rather than repeating one text", async () => {
    const variants = await admin.from("content_variants").select("payload,content_items!inner(platform)").eq("campaign_id", campaignId);
    const byPlatform = new Map<string, string>();
    for (const row of variants.data ?? []) {
      const platform = (row.content_items as unknown as { platform: string }).platform;
      const payload = row.payload as { hook: string };
      if (!byPlatform.has(platform)) byPlatform.set(platform, payload.hook);
    }
    expect(byPlatform.size).toBeGreaterThan(1);
    expect(new Set(byPlatform.values()).size).toBe(byPlatform.size);
  }, 60_000);

  it("opens exactly one approval per piece that cleared the quality gate", async () => {
    const ready = await admin.from("content_items").select("id").eq("campaign_id", campaignId).eq("status", "waiting_approval");
    const approvals = await admin.from("approvals").select("id,content_item_id,status").eq("campaign_id", campaignId).not("content_item_id", "is", null);
    expect(approvals.data!.length).toBe(ready.data!.length);
    expect(approvals.data!.every((approval) => approval.status === "requested")).toBe(true);
  }, 60_000);

  it("approves a piece through the M01 approval engine", async () => {
    const approval = await admin.from("approvals").select("id,content_item_id").eq("campaign_id", campaignId).eq("status", "requested").limit(1).single();
    await admin.from("approvals").update({ status: "approved", decided_by: userIds[0], decided_at: new Date().toISOString() }).eq("id", approval.data!.id);
    const item = await admin.from("content_items").select("status,approved_at").eq("id", approval.data!.content_item_id).single();
    expect(item.data!.status).toBe("approved");
    expect(item.data!.approved_at).toBeTruthy();
  }, 60_000);

  it("creates a second version on revision without touching the first", async () => {
    const { requestContentRevision } = await import("@/server/content-factory/revision");
    const target = await admin.from("content_items").select("id,current_version").eq("campaign_id", campaignId).eq("status", "waiting_approval").limit(1).maybeSingle();
    if (!target.data) return;

    const first = await admin.from("content_variants").select("payload").eq("content_item_id", target.data.id).eq("version", 1).single();
    await admin.from("content_items").update({ status: "rejected" }).eq("id", target.data.id);

    const result = await requestContentRevision(organizationId, target.data.id, userIds[0], "El hook es demasiado corporativo. Quiero algo más directo.");
    expect(result.version).toBe(2);

    const versions = await admin.from("content_versions").select("version,feedback,requested_by").eq("content_item_id", target.data.id).order("version");
    expect(versions.data!.map((row) => row.version)).toEqual([1, 2]);
    expect(versions.data![1].feedback).toMatch(/corporativo/);

    const unchanged = await admin.from("content_variants").select("payload").eq("content_item_id", target.data.id).eq("version", 1).single();
    expect(unchanged.data!.payload).toEqual(first.data!.payload);
  }, 300_000);

  it("refuses an out-of-order lifecycle transition at the database", async () => {
    const item = await admin.from("content_items").select("id").eq("campaign_id", campaignId).limit(1).single();
    await admin.from("content_items").update({ status: "concept" }).eq("id", item.data!.id);
    const { error } = await admin.from("content_items").update({ status: "approved" }).eq("id", item.data!.id);
    expect(error).toBeTruthy();
    expect(`${error?.message}`).toMatch(/Invalid content transition/);
  }, 60_000);

  it("refuses to produce content for a campaign whose strategy was never approved", async () => {
    const { runContentFactoryForCampaign } = await import("@/server/content-factory/workflow");
    const draft = await admin.from("campaigns").insert({
      organization_id: organizationId, objective_id: objectiveId, name: "E2E Draft Campaign", slug: `e2e-d-${crypto.randomUUID()}`,
      status: "draft", business_goal: "awareness",
    }).select("id").single();
    await expect(runContentFactoryForCampaign(organizationId, draft.data!.id, userIds[0])).rejects.toThrowError(/approved/i);
  }, 60_000);

  it("keeps content invisible to another organization", async () => {
    const otherEmail = `e2e_other_${crypto.randomUUID()}@spectro.invalid`;
    const password = `M01!${crypto.randomUUID()}aA`;
    const other = await admin.auth.admin.createUser({ email: otherEmail, password, email_confirm: true });
    userIds.push(other.data.user!.id);
    const client = createClient(url, process.env.SUPABASE_TEST_ANON_KEY!, { auth: { persistSession: false } });
    await client.auth.signInWithPassword({ email: otherEmail, password });
    const { data } = await client.from("content_items").select("id").eq("campaign_id", campaignId);
    expect(data ?? []).toEqual([]);
  }, 120_000);
});
