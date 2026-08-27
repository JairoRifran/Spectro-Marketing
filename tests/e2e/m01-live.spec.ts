import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { test, expect, type APIRequestContext } from "@playwright/test";
import {assertSafeRemoteTestEnvironment,remoteTestsConfigured} from "../helpers/remote-test-guard";

const configured = remoteTestsConfigured(["SUPABASE_TEST_URL","SUPABASE_TEST_ANON_KEY","SUPABASE_TEST_SERVICE_KEY","NEXT_PUBLIC_SUPABASE_URL","NEXT_PUBLIC_SUPABASE_ANON_KEY","SUPABASE_SERVICE_ROLE_KEY","CRON_SECRET"])
  && process.env.NEXT_PUBLIC_SUPABASE_URL===process.env.SUPABASE_TEST_URL
  && process.env.SUPABASE_SERVICE_ROLE_KEY===process.env.SUPABASE_TEST_SERVICE_KEY
  && process.env.AUTOMATION_ENABLED==="true";
let db: SupabaseClient;
let orgId = "";
let cmoId = "";
let marketId = "";
let authUserId="";
let authOrgId="";

test.describe("M01 live autonomous flows", () => {
  test.describe.configure({ mode: "serial" });
  test.skip(!configured, "requires an isolated migrated Supabase project and CRON_SECRET");

  test.beforeAll(async () => {
    assertSafeRemoteTestEnvironment();
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

  test.afterAll(async () => { if (orgId) await db.from("organizations").delete().eq("id", orgId);if(authOrgId)await db.from("organizations").delete().eq("id",authOrgId);if(authUserId)await db.auth.admin.deleteUser(authUserId); });

  async function wake(request: APIRequestContext, workerId: string) {
    const response = await request.post("/api/internal/jobs/dispatch", { headers: { authorization: `Bearer ${process.env.CRON_SECRET}` }, data: { workerId } });
    expect(response.ok()).toBe(true);
  }

  test("signup → onboarding → refresh → logout → protected route",async({page})=>{
    const email=`e2e_auth_${crypto.randomUUID()}@spectro.invalid`;const password=`M01!${crypto.randomUUID()}aA`;
    await page.goto("/signup");await page.getByLabel("Nombre completo").fill("M01 Auth E2E");await page.getByLabel("Email").fill(email);await page.getByLabel("Contraseña").fill(password);await page.getByRole("button",{name:"Crear cuenta"}).click();
    await page.waitForURL(/\/(login|onboarding)/);
    const users=await db.auth.admin.listUsers();const created=users.data.users.find(user=>user.email===email);if(!created)throw new Error("Signup user not found");authUserId=created.id;
    await db.auth.admin.updateUserById(created.id,{email_confirm:true});
    if(new URL(page.url()).pathname!=="/onboarding"){await page.goto("/login?next=/onboarding");await page.getByLabel("Email").fill(email);await page.getByLabel("Contraseña").fill(password);await page.getByRole("button",{name:"Ingresar"}).click();}
    await page.waitForURL(/\/onboarding/);
    await page.getByLabel("Nombre de la empresa").fill("E2E Auth Company");await page.getByLabel("Industria").fill("Testing");await page.getByLabel("Descripción").fill("Isolated authentication test company");await page.getByRole("button",{name:"Continuar"}).click();
    await page.getByLabel("Nombre",{exact:true}).fill("E2E Service");await page.getByLabel("Descripción").fill("A deterministic test service");await page.getByLabel("Propuesta de valor").fill("Reliable validation");await page.getByRole("button",{name:"Continuar"}).click();
    await page.getByLabel("Nombre de la persona / ICP").fill("E2E Buyer");await page.getByLabel("Descripción").fill("A test buyer persona");await page.getByRole("button",{name:"Continuar"}).click();
    await page.getByLabel("Nombre de marca").fill("E2E Brand");await page.getByLabel("Descripción").fill("A test brand");await page.getByRole("button",{name:"Continuar"}).click();
    await page.getByLabel("Título del objetivo").fill("E2E objective");await page.getByLabel("Descripción").fill("Validate authenticated onboarding");await page.getByRole("button",{name:"Entrar a Marketing HQ"}).click();
    await expect(page.getByText("E2E objective",{exact:true})).toBeVisible();await page.reload();await expect(page.getByRole("heading",{name:"Marketing HQ"})).toBeVisible();
    const membership=await db.from("organization_members").select("organization_id").eq("user_id",authUserId).single();authOrgId=membership.data?.organization_id??"";
    await page.getByRole("button",{name:"Cerrar sesión"}).click();await expect(page).toHaveURL(/\/login/);await page.goto("/tasks");await expect(page).toHaveURL(/\/login/);
  });

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
