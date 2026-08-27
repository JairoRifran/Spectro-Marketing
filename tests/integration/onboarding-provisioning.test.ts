import {createClient,type SupabaseClient} from "@supabase/supabase-js";
import {afterAll,beforeAll,describe,expect,it} from "vitest";
import {assertSafeRemoteTestEnvironment,remoteTestsConfigured} from "../helpers/remote-test-guard";

const run=remoteTestsConfigured(["SUPABASE_TEST_URL","SUPABASE_TEST_ANON_KEY","SUPABASE_TEST_SERVICE_KEY"]);
const url=process.env.SUPABASE_TEST_URL!;const anon=process.env.SUPABASE_TEST_ANON_KEY!;const service=process.env.SUPABASE_TEST_SERVICE_KEY!;
let admin:SupabaseClient;let owner:SupabaseClient;let orgId="";const userIds:string[]=[];

const payload=(organization_id:string)=>({
  organization_id,
  company:{name:"E2E Onboarding Co",description:"Empresa de prueba para onboarding.",industry:"SaaS",website:"",country:"UY",primary_language:"es",timezone:"UTC"},
  products:[{name:"Plan Base",description:"Suscripción mensual.",kind:"product",category:"",value_proposition:"Ahorra tiempo operativo.",price_text:"",url:""}],
  personas:[{name:"Líder de operaciones",description:"Coordina equipos comerciales.",pains:["trabajo manual"],needs:["visibilidad"],motivations:[],objections:[],channels:[],metadata:{}}],
  brand:{name:"E2E Brand",description:"Marca de prueba.",slogan:"",tone_of_voice:"claro",personality:[],preferred_words:[],forbidden_words:[],colors:[],visual_instructions:"",communication_examples:[],forbidden_claims:[]},
  objective:{title:"Aumentar registros calificados",description:"Objetivo de prueba.",metric:"registros",baseline:100,target:200,deadline:"",budget:null,market:"",constraints:[],priority:"high"},
});

describe.skipIf(!run)("onboarding provisioning",()=>{
  beforeAll(async()=>{
    assertSafeRemoteTestEnvironment();admin=createClient(url,service,{auth:{persistSession:false}});
    const email=`e2e_onboarding_${crypto.randomUUID()}@spectro.invalid`;const password=`M01!${crypto.randomUUID()}aA`;
    const{data,error}=await admin.auth.admin.createUser({email,password,email_confirm:true,user_metadata:{full_name:"E2E Onboarding"}});
    if(error||!data.user)throw error??new Error("Auth fixture missing");userIds.push(data.user.id);
    owner=createClient(url,anon,{auth:{persistSession:false}});
    const login=await owner.auth.signInWithPassword({email,password});if(login.error)throw login.error;
    const created=await owner.rpc("create_organization",{org_name:"E2E Onboarding Co",org_slug:`e2e-onb-${crypto.randomUUID()}`,org_timezone:"UTC"});
    if(created.error)throw created.error;orgId=created.data;
  },60_000);

  afterAll(async()=>{
    if(!run)return;
    if(orgId)await admin.from("organizations").delete().eq("id",orgId);
    for(const id of userIds)await admin.auth.admin.deleteUser(id);
  },60_000);

  it("provisions the eight M01 agents exactly once",async()=>{
    const first=await owner.rpc("complete_onboarding",{payload:payload(orgId)});
    expect(first.error).toBeNull();
    const{data,error}=await admin.from("agents").select("role,display_name").eq("organization_id",orgId);
    expect(error).toBeNull();
    expect(data).toHaveLength(8);
    expect(new Set((data??[]).map(agent=>agent.role)).size).toBe(8);
    expect((data??[]).map(agent=>agent.display_name).sort()).toEqual(["Bruno","Clara","Emilia","Mateo","Sofía","Tomás","Valentina","Vera"]);
  },60_000);

  it("marks the organization as onboarded and exposes the first objective",async()=>{
    const organization=await admin.from("organizations").select("onboarding_completed_at").eq("id",orgId).single();
    expect(organization.data?.onboarding_completed_at).toBeTruthy();
    const objectives=await admin.from("objectives").select("id,title,status").eq("organization_id",orgId);
    expect(objectives.data).toHaveLength(1);
    expect(objectives.data?.[0].title).toBe("Aumentar registros calificados");
  },60_000);

  it("stays idempotent when onboarding is retried",async()=>{
    const retry=await owner.rpc("complete_onboarding",{payload:payload(orgId)});
    expect(retry.error).toBeNull();
    const agents=await admin.from("agents").select("id").eq("organization_id",orgId);
    expect(agents.data).toHaveLength(8);
    const objectives=await admin.from("objectives").select("id").eq("organization_id",orgId);
    expect(objectives.data).toHaveLength(1);
    const brands=await admin.from("brands").select("id").eq("organization_id",orgId);
    expect(brands.data).toHaveLength(1);
    const products=await admin.from("products").select("id").eq("organization_id",orgId);
    expect(products.data).toHaveLength(1);
    const personas=await admin.from("personas").select("id").eq("organization_id",orgId);
    expect(personas.data).toHaveLength(1);
    const schedules=await admin.from("schedules").select("id").eq("organization_id",orgId);
    expect(schedules.data).toHaveLength(1);
  },60_000);

  it("keeps the pending approval count and the objective consistent for the organization",async()=>{
    const approvals=await admin.from("approvals").select("id",{count:"exact",head:true}).eq("organization_id",orgId).eq("status","requested");
    expect(approvals.count ?? 0).toBe(0);
  },60_000);
});
