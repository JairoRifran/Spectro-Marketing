import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {assertSafeRemoteTestEnvironment,remoteTestsConfigured} from "../helpers/remote-test-guard";

const run=remoteTestsConfigured(["SUPABASE_TEST_URL","SUPABASE_TEST_ANON_KEY","SUPABASE_TEST_SERVICE_KEY"]);
const url=process.env.SUPABASE_TEST_URL!;const anon=process.env.SUPABASE_TEST_ANON_KEY!;const service=process.env.SUPABASE_TEST_SERVICE_KEY!;
let admin:SupabaseClient;let userA:SupabaseClient;let adminUser:SupabaseClient;let member:SupabaseClient;let viewer:SupabaseClient;let orgA="";let orgB="";const userIds:string[]=[];const fixtureIds:Record<string,string>={};

describe.skipIf(!run)("RLS tenant and role matrix",()=>{
  beforeAll(async()=>{
    assertSafeRemoteTestEnvironment();admin=createClient(url,service,{auth:{persistSession:false}});
    const password=`M01!${crypto.randomUUID()}aA`;
    async function createUser(label:string){const email=`e2e_${label}_${crypto.randomUUID()}@spectro.invalid`;const{data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:`E2E ${label}`}});if(error||!data.user)throw error??new Error("Auth fixture missing");userIds.push(data.user.id);const client=createClient(url,anon,{auth:{persistSession:false}});const login=await client.auth.signInWithPassword({email,password});if(login.error)throw login.error;return{client,id:data.user.id};}
    const a=await createUser("owner_a");const b=await createUser("owner_b");const ad=await createUser("admin_b");const m=await createUser("member_b");const v=await createUser("viewer_b");userA=a.client;adminUser=ad.client;member=m.client;viewer=v.client;
    const createdA=await userA.rpc("create_organization",{org_name:"E2E Organization A",org_slug:`e2e-a-${crypto.randomUUID()}`,org_timezone:"UTC"});
    const createdB=await b.client.rpc("create_organization",{org_name:"E2E Organization B",org_slug:`e2e-b-${crypto.randomUUID()}`,org_timezone:"UTC"});
    if(createdA.error||createdB.error)throw createdA.error??createdB.error;orgA=createdA.data;orgB=createdB.data;
    await admin.from("organization_members").insert([{organization_id:orgB,user_id:ad.id,role:"admin"},{organization_id:orgB,user_id:m.id,role:"member"},{organization_id:orgB,user_id:v.id,role:"viewer"}]);
    const brand=await admin.from("brands").insert({organization_id:orgB,name:"Brand B"}).select("id").single();fixtureIds.brands=brand.data!.id;
    const product=await admin.from("products").insert({organization_id:orgB,name:"Product B"}).select("id").single();fixtureIds.products=product.data!.id;
    const persona=await admin.from("personas").insert({organization_id:orgB,name:"Persona B"}).select("id").single();fixtureIds.personas=persona.data!.id;
    const objective=await admin.from("objectives").insert({organization_id:orgB,title:"Objective B",metric:"leads",target:10}).select("id").single();fixtureIds.objectives=objective.data!.id;
    const agent=await admin.from("agents").insert({organization_id:orgB,role:"e2e_agent",display_name:"Agent B",autonomy_level:1}).select("id").single();fixtureIds.agents=agent.data!.id;
    const event=await admin.from("events").insert({organization_id:orgB,type:"e2e.event",source:"e2e",idempotency_key:`e2e-event-${crypto.randomUUID()}`}).select("id").single();fixtureIds.events=event.data!.id;
    const task=await admin.from("tasks").insert({organization_id:orgB,title:"Task B",type:"e2e",status:"waiting_approval",priority:"low",created_by_type:"system",assigned_agent_id:agent.data!.id,objective_id:objective.data!.id,source_event_id:event.data!.id,idempotency_key:`e2e-task-${crypto.randomUUID()}`}).select("id").single();fixtureIds.tasks=task.data!.id;
    fixtureIds.task_runs=(await admin.from("task_runs").insert({organization_id:orgB,task_id:task.data!.id,agent_id:agent.data!.id,attempt_number:1,worker_id:"e2e",status:"failed"}).select("id").single()).data!.id;
    fixtureIds.agent_runs=(await admin.from("agent_runs").insert({organization_id:orgB,agent_id:agent.data!.id,task_id:task.data!.id,event_id:event.data!.id,provider:"mock",status:"failed",idempotency_key:`e2e-run-${crypto.randomUUID()}`}).select("id").single()).data!.id;
    fixtureIds.schedules=(await admin.from("schedules").insert({organization_id:orgB,name:"Schedule B",cron_expression:"*/1 * * * *",event_type:"e2e.event",next_run_at:new Date(Date.now()+60_000).toISOString(),idempotency_prefix:`e2e-${crypto.randomUUID()}`}).select("id").single()).data!.id;
    fixtureIds.approvals=(await admin.from("approvals").insert({organization_id:orgB,task_id:task.data!.id,risk_level:"low",requested_by_type:"system",reason:"E2E"}).select("id").single()).data!.id;
    const knowledge=await admin.from("knowledge_items").insert({organization_id:orgB,title:"Knowledge B",content:"Tenant-private content",type:"other"}).select("id").single();fixtureIds.knowledge_items=knowledge.data!.id;
    fixtureIds.agent_memories=(await admin.from("agent_memories").insert({organization_id:orgB,agent_id:agent.data!.id,knowledge_item_id:knowledge.data!.id,kind:"semantic",content:"Memory B"}).select("id").single()).data!.id;
    fixtureIds.activity_log=(await admin.from("activity_log").insert({organization_id:orgB,action:"e2e.created",actor_type:"system",summary:"Activity B"}).select("id").single()).data!.id;
  },60_000);

  afterAll(async()=>{if(orgA)await admin.from("organizations").delete().eq("id",orgA);if(orgB)await admin.from("organizations").delete().eq("id",orgB);for(const id of userIds)await admin.auth.admin.deleteUser(id);});

  it("prevents Organization A from reading or updating Organization B",async()=>{
    const organizationRead=await userA.from("organizations").select("id").eq("id",orgB);expect(organizationRead.data).toEqual([]);
    const organizationWrite=await userA.from("organizations").update({name:"attacker"}).eq("id",orgB).select("id");expect(organizationWrite.data).toEqual([]);
    for(const[table,id]of Object.entries(fixtureIds)){
      const read=await userA.from(table).select("id").eq("id",id);expect(read.data,`${table} read isolation`).toEqual([]);
      if(table!=="activity_log"){const write=await userA.from(table).update({updated_at:new Date().toISOString()}).eq("id",id).select("id");expect(write.data,`${table} update isolation`).toEqual([]);}
    }
  });

  it("enforces viewer/member/admin-sensitive boundaries",async()=>{
    const viewerWrite=await viewer.from("knowledge_items").insert({organization_id:orgB,title:"Viewer write",content:"must fail",type:"other"});expect(viewerWrite.error).toBeTruthy();
    const memberKnowledge=await member.from("knowledge_items").insert({organization_id:orgB,title:"Member knowledge",content:"allowed operational content",type:"other"});expect(memberKnowledge.error).toBeNull();
    const memberBrand=await member.from("brands").insert({organization_id:orgB,name:"Member brand"});expect(memberBrand.error).toBeTruthy();
    const adminBrand=await adminUser.from("brands").insert({organization_id:orgB,name:"Admin brand"});expect(adminBrand.error).toBeNull();
  });
});
