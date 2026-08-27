import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {assertSafeRemoteTestEnvironment,remoteTestsConfigured} from "../helpers/remote-test-guard";

const url = process.env.SUPABASE_TEST_URL;
const key = process.env.SUPABASE_TEST_SERVICE_KEY;
const run = remoteTestsConfigured(["SUPABASE_TEST_URL","SUPABASE_TEST_SERVICE_KEY"]);
let db: SupabaseClient;
let orgId = "";
let agentId = "";

describe.skipIf(!run)("Postgres task engine", () => {
  beforeAll(async () => {
    assertSafeRemoteTestEnvironment();
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
    const [a, b, c] = await Promise.all([
      db.rpc("claim_ready_tasks", { p_worker_id: "a", p_batch_size: 1, p_lease_seconds: 30 }),
      db.rpc("claim_ready_tasks", { p_worker_id: "b", p_batch_size: 1, p_lease_seconds: 30 }),
      db.rpc("claim_ready_tasks", { p_worker_id: "c", p_batch_size: 1, p_lease_seconds: 30 }),
    ]);
    expect((a.data?.length ?? 0) + (b.data?.length ?? 0) + (c.data?.length ?? 0)).toBe(1);
  });

  it("does not claim work with an incomplete required dependency", async () => {
    const { data: parent } = await db.from("tasks").insert({ organization_id: orgId, title: "Parent", type: "test", status: "queued", priority: "low", created_by_type: "system", assigned_agent_id: agentId, idempotency_key: "parent" }).select("id").single();
    const { data: child } = await db.from("tasks").insert({ organization_id: orgId, title: "Child", type: "test", status: "queued", priority: "urgent", created_by_type: "system", assigned_agent_id: agentId, idempotency_key: "child" }).select("id").single();
    if (!parent || !child) throw new Error("Task fixtures were not created");
    await db.from("task_dependencies").insert({ organization_id: orgId, task_id: child.id, depends_on_task_id: parent.id });
    const { data } = await db.rpc("claim_ready_tasks", { p_worker_id: "deps", p_batch_size: 10, p_lease_seconds: 30 });
    expect(data?.some((task: { id: string }) => task.id === child.id)).toBe(false);
    await db.from("tasks").update({status:"completed"}).eq("id",parent.id);
    const eligible=await db.rpc("claim_ready_tasks",{p_worker_id:"deps-after",p_batch_size:10,p_lease_seconds:30});
    expect(eligible.data?.some((task:{id:string})=>task.id===child.id)).toBe(true);
  });

  it("rejects pending → running and permits pending → queued → running",async()=>{
    const{data:task}=await db.from("tasks").insert({organization_id:orgId,title:"State machine",type:"test",status:"pending",priority:"medium",created_by_type:"system",assigned_agent_id:agentId,idempotency_key:"state-machine"}).select("id").single();
    if(!task)throw new Error("State fixture missing");
    const invalid=await db.from("tasks").update({status:"running"}).eq("id",task.id);
    expect(invalid.error).toBeTruthy();
    expect((await db.from("tasks").update({status:"queued"}).eq("id",task.id)).error).toBeNull();
    const claimed=await db.rpc("claim_ready_tasks",{p_worker_id:"state",p_batch_size:1,p_lease_seconds:30});
    expect(claimed.data?.some((row:{id:string})=>row.id===task.id)).toBe(true);
  });

  it("deduplicates logical task and event deliveries",async()=>{
    const task={organization_id:orgId,title:"Duplicate",type:"test",status:"queued",priority:"low",created_by_type:"system",assigned_agent_id:agentId,idempotency_key:"duplicate-task"};
    await Promise.all([db.from("tasks").upsert(task,{onConflict:"organization_id,idempotency_key",ignoreDuplicates:true}),db.from("tasks").upsert(task,{onConflict:"organization_id,idempotency_key",ignoreDuplicates:true})]);
    const event={organization_id:orgId,type:"test.event",source:"test",payload:{},idempotency_key:"duplicate-event"};
    await Promise.all([db.from("events").upsert(event,{onConflict:"organization_id,idempotency_key",ignoreDuplicates:true}),db.from("events").upsert(event,{onConflict:"organization_id,idempotency_key",ignoreDuplicates:true})]);
    expect((await db.from("tasks").select("id",{count:"exact"}).eq("organization_id",orgId).eq("idempotency_key","duplicate-task")).count).toBe(1);
    expect((await db.from("events").select("id",{count:"exact"}).eq("organization_id",orgId).eq("idempotency_key","duplicate-event")).count).toBe(1);
  });

  it("recovers an expired lease and records activity",async()=>{
    const{data:task}=await db.from("tasks").insert({organization_id:orgId,title:"Expired lease",type:"test",status:"running",priority:"urgent",created_by_type:"system",assigned_agent_id:agentId,attempt_count:1,max_attempts:3,locked_by:"dead-worker",locked_at:new Date(Date.now()-60_000).toISOString(),lease_expires_at:new Date(Date.now()-30_000).toISOString(),idempotency_key:"expired-lease"}).select("id").single();
    if(!task)throw new Error("Lease fixture missing");
    const{data}=await db.rpc("claim_ready_tasks",{p_worker_id:"recovery",p_batch_size:10,p_lease_seconds:30});
    expect(data?.some((row:{id:string})=>row.id===task.id)).toBe(true);
    const activity=await db.from("activity_log").select("id").eq("task_id",task.id).eq("action","task.lease_recovered");
    expect(activity.data).toHaveLength(1);
  });

  it("rejects a circular dependency",async()=>{
    const{data:rows}=await db.from("tasks").insert([{organization_id:orgId,title:"Cycle A",type:"test",status:"queued",priority:"low",created_by_type:"system",assigned_agent_id:agentId,idempotency_key:"cycle-a"},{organization_id:orgId,title:"Cycle B",type:"test",status:"queued",priority:"low",created_by_type:"system",assigned_agent_id:agentId,idempotency_key:"cycle-b"}]).select("id");
    if(!rows?.[0]||!rows[1])throw new Error("Cycle fixtures missing");
    await db.from("task_dependencies").insert({organization_id:orgId,task_id:rows[1].id,depends_on_task_id:rows[0].id});
    const cycle=await db.from("task_dependencies").insert({organization_id:orgId,task_id:rows[0].id,depends_on_task_id:rows[1].id});
    expect(cycle.error).toBeTruthy();
  });

  it("honors a batch size of five while draining twenty tasks",async()=>{
    await db.from("tasks").update({status:"cancelled"}).eq("organization_id",orgId).eq("status","queued");
    const rows=Array.from({length:20},(_,index)=>({organization_id:orgId,title:`Batch ${index}`,type:"test",status:"queued",priority:"urgent",created_by_type:"system",assigned_agent_id:agentId,idempotency_key:`batch-${index}`}));
    expect((await db.from("tasks").insert(rows)).error).toBeNull();let claimed=0;
    for(let run=0;run<4;run+=1){const result=await db.rpc("claim_ready_tasks",{p_worker_id:`batch-${run}`,p_batch_size:5,p_lease_seconds:30});expect(result.data?.length).toBeLessThanOrEqual(5);claimed+=result.data?.length??0;const ids=(result.data??[]).map((row:{id:string})=>row.id);if(ids.length)await db.from("tasks").update({status:"completed"}).in("id",ids);}
    expect(claimed).toBe(20);
  });
});
