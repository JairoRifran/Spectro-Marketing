import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_KEY;
const run = Boolean(url && key);
let db: SupabaseClient;
let orgId = "";
let agentId = "";

describe.skipIf(!run)("Postgres task engine", () => {
  beforeAll(async () => {
    db = createClient(url!, key!, { auth: { persistSession: false } });
    const { data: org, error } = await db.from("organizations").insert({ name: "M01 Integration", slug: `m01-${crypto.randomUUID()}` }).select("id").single();
    if (error) throw error;
    orgId = org.id;
    const { data: agent } = await db.from("agents").insert({ organization_id: orgId, role: "test", display_name: "Test Agent", autonomy_level: 1 }).select("id").single();
    if (!agent) throw new Error("Agent fixture was not created");
    agentId = agent.id;
  });

  afterAll(async () => { if (orgId) await db.from("organizations").delete().eq("id", orgId); });

  it("claims a task once under concurrent dispatchers", async () => {
    await db.from("tasks").insert({ organization_id: orgId, title: "Race", type: "test", status: "queued", priority: "high", created_by_type: "system", assigned_agent_id: agentId, idempotency_key: "race" });
    const [a, b] = await Promise.all([
      db.rpc("claim_ready_tasks", { p_worker_id: "a", p_batch_size: 1, p_lease_seconds: 30 }),
      db.rpc("claim_ready_tasks", { p_worker_id: "b", p_batch_size: 1, p_lease_seconds: 30 }),
    ]);
    expect((a.data?.length ?? 0) + (b.data?.length ?? 0)).toBe(1);
  });

  it("does not claim work with an incomplete required dependency", async () => {
    const { data: parent } = await db.from("tasks").insert({ organization_id: orgId, title: "Parent", type: "test", status: "queued", priority: "low", created_by_type: "system", assigned_agent_id: agentId, idempotency_key: "parent" }).select("id").single();
    const { data: child } = await db.from("tasks").insert({ organization_id: orgId, title: "Child", type: "test", status: "queued", priority: "urgent", created_by_type: "system", assigned_agent_id: agentId, idempotency_key: "child" }).select("id").single();
    if (!parent || !child) throw new Error("Task fixtures were not created");
    await db.from("task_dependencies").insert({ organization_id: orgId, task_id: child.id, depends_on_task_id: parent.id });
    const { data } = await db.rpc("claim_ready_tasks", { p_worker_id: "deps", p_batch_size: 10, p_lease_seconds: 30 });
    expect(data?.some((task: { id: string }) => task.id === child.id)).toBe(false);
  });
});
