import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect, type APIRequestContext } from "@playwright/test";

const configured = Boolean(process.env.SUPABASE_TEST_URL && process.env.SUPABASE_TEST_SERVICE_KEY && process.env.CRON_SECRET);
let db: SupabaseClient;
let orgId = "";
let cmoId = "";
let marketId = "";

test.describe("M01 live autonomous flows", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!configured, "requires an isolated migrated Supabase project and CRON_SECRET");

  test.beforeAll(async () => {
    db = createClient(process.env.SUPABASE_TEST_URL!, process.env.SUPABASE_TEST_SERVICE_KEY!, { auth: { persistSession: false } });
    const { data: org } = await db.from("organizations").insert({ name: "M01 E2E", slug: `m01-e2e-${crypto.randomUUID()}` }).select("id").single();
    if (!org) throw new Error("Could not create E2E organization");
    orgId = org.id;
    const { data: agents } = await db.from("agents").insert([
      { organization_id: orgId, role: "cmo", display_name: "Sofía", autonomy_level: 2 },
      { organization_id: orgId, role: "market_intelligence", display_name: "Mateo", autonomy_level: 1 },
    ]).select("id,role");
    cmoId = agents?.find(agent => agent.role === "cmo")?.id ?? "";
    marketId = agents?.find(agent => agent.role === "market_intelligence")?.id ?? "";
  });

  test.afterAll(async () => { if (orgId) await db.from("organizations").delete().eq("id", orgId); });

  async function wake(request: APIRequestContext, workerId: string) {
    const response = await request.post("/api/internal/jobs/dispatch", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, data: { workerId } });
    expect(response.ok()).toBe(true);
  }

  test("create task → queued → dispatch → completed", async ({ request }) => {
    const { data: task } = await db.from("tasks").insert({ organization_id: orgId, title: "E2E dispatch", type: "generic.analysis", status: "queued", priority: "high", created_by_type: "system", assigned_agent_id: marketId, idempotency_key: "e2e-dispatch" }).select("id").single();
    if (!task) throw new Error("Dispatch fixture missing");
    await wake(request, "e2e-worker-1");
    const { data: completed } = await db.from("tasks").select("status,output").eq("id", task.id).single();
    if (!completed) throw new Error("Dispatch result missing");
    expect(completed.status).toBe("completed");
  });

  test("waiting approval → approved → dispatch → completed", async ({ request }) => {
    const { data: task } = await db.from("tasks").insert({ organization_id: orgId, title: "E2E approval", type: "generic.analysis", status: "waiting_approval", priority: "high", risk_level: "high", requires_approval: true, created_by_type: "system", assigned_agent_id: marketId, idempotency_key: "e2e-approval" }).select("id").single();
    if (!task) throw new Error("Approval task fixture missing");
    const { data: approval } = await db.from("approvals").insert({ organization_id: orgId, task_id: task.id, risk_level: "high", requested_by_type: "system", reason: "High-risk E2E policy" }).select("id").single();
    if (!approval) throw new Error("Approval fixture missing");
    await db.from("approvals").update({ status: "approved" }).eq("id", approval.id);
    await wake(request, "e2e-worker-2");
    const { data: completed } = await db.from("tasks").select("status").eq("id", task.id).single();
    if (!completed) throw new Error("Approved task result missing");
    expect(completed.status).toBe("completed");
  });

  test("agent A delegates dependent work and agent B executes", async ({ request }) => {
    const { data: parent } = await db.from("tasks").insert({ organization_id: orgId, title: "E2E CMO review", type: "cmo.daily_review", status: "queued", priority: "high", created_by_type: "system", assigned_agent_id: cmoId, idempotency_key: "e2e-delegation" }).select("id").single();
    if (!parent) throw new Error("Delegation parent missing");
    await wake(request, "e2e-worker-3a");
    const { data: child } = await db.from("tasks").select("id,status,assigned_agent_id").eq("parent_task_id", parent.id).single();
    if (!child) throw new Error("Delegated child missing");
    expect(child.assigned_agent_id).toBe(marketId);
    await wake(request, "e2e-worker-3b");
    const { data: completed } = await db.from("tasks").select("status").eq("id", child.id).single();
    if (!completed) throw new Error("Delegated task result missing");
    expect(completed.status).toBe("completed");
  });
});
