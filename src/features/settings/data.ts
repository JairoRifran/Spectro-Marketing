import { getOrganizationContext } from "@/features/organizations/context";
import { automationIsEnabled, isDemoMode } from "@/lib/env";
import { credentialStatus } from "@/server/integrations/credentials";
import { SUPPORTED_PLATFORMS } from "@/server/content/platforms";

export type SettingsData={mode:"demo"|"live";orgName:string;role:string;company:{industry:string;country:string;language:string;timezone:string;description:string};brand:{name:string;tone:string;preferred:string[];forbiddenClaims:string[];colors:string[]}|null;members:Array<{id:string;name:string;role:string}>;schedules:Array<{id:string;name:string;status:string;cron:string;timezone:string;lastRun:string|null;nextRun:string}>;worker:{enabled:boolean;lastDispatch:string|null;lastSuccess:string|null;lastFailure:string|null;queued:number;running:number;stale:number};
  /** Whether a piece may go out without an authenticated decision. Never derived from anything else. */
  publishingMode:"human_review"|"autonomous";
  /** Whether each piece waits for a person before it is finished. Independent of publishing. */
  contentApprovalMode:"human"|"automatic";
  integrations:Array<{platform:string;status:string;handle:string|null;accountName:string|null;connectedAt:string|null;lastError:string|null}>;
  /** Whether each channel has an app behind it, and whose. Never the secret itself. */
  credentials:Record<string,{configured:boolean;source:"organization"|"platform"|null}>};

const demo:SettingsData={mode:"demo",orgName:"Northstar Urban",role:"owner",company:{industry:"SaaS B2B",country:"Uruguay",language:"Español",timezone:"America/Montevideo",description:"Datos de demostración explícitos."},brand:{name:"Northstar Urban",tone:"Claro, experto y cercano",preferred:["claridad","avance","evidencia"],forbiddenClaims:["resultados garantizados"],colors:["#102b2a","#16a47a","#f4f6f4"]},members:[{id:"demo-user",name:"Jairo Rifran",role:"owner"}],schedules:[{id:"demo-schedule",name:"CMO Daily Review",status:"active",cron:"0 9 * * *",timezone:"America/Montevideo",lastRun:null,nextRun:new Date(Date.now()+60_000).toISOString()}],worker:{enabled:false,lastDispatch:null,lastSuccess:null,lastFailure:null,queued:3,running:2,stale:0},publishingMode:"human_review",contentApprovalMode:"human",integrations:[],credentials:{}};

export async function getSettingsData():Promise<SettingsData>{
  if(isDemoMode)return demo;
  const ctx=await getOrganizationContext();
  const empty:SettingsData={mode:"live",orgName:"Sin organización",role:"viewer",company:{industry:"—",country:"—",language:"—",timezone:"—",description:""},brand:null,members:[],schedules:[],worker:{enabled:automationIsEnabled(),lastDispatch:null,lastSuccess:null,lastFailure:null,queued:0,running:0,stale:0},publishingMode:"human_review",contentApprovalMode:"human",integrations:[],credentials:{}};
  if(!ctx)return empty;
  const [organization,brand,members,schedules,tasks,health,integrations]=await Promise.all([
    ctx.db.from("organizations").select("name,description,industry,country,primary_language,timezone,publishing_mode,content_approval_mode").eq("id",ctx.orgId).single(),
    ctx.db.from("brands").select("name,tone_of_voice,preferred_words,forbidden_claims,colors").eq("organization_id",ctx.orgId).order("created_at").limit(1).maybeSingle(),
    ctx.db.from("organization_members").select("user_id,role,profiles(full_name)").eq("organization_id",ctx.orgId).order("created_at"),
    ctx.db.from("schedules").select("id,name,status,cron_expression,timezone,last_run_at,next_run_at").eq("organization_id",ctx.orgId).order("name"),
    ctx.db.from("tasks").select("status,lease_expires_at").eq("organization_id",ctx.orgId).in("status",["queued","running"]),
    ctx.db.from("worker_health").select("last_dispatch_at,last_successful_run_at,last_failed_run_at").eq("worker_name","dispatcher").maybeSingle(),
    ctx.db.from("social_integrations").select("platform,status,account_handle,account_name,connected_at,last_error").eq("organization_id",ctx.orgId),
  ]);
  const org=organization.data;const taskRows=tasks.data??[];const now=Date.now();
  return{mode:"live",orgName:org?.name??ctx.orgName,role:ctx.role,company:{industry:org?.industry??"—",country:org?.country??"—",language:org?.primary_language??"—",timezone:org?.timezone??"—",description:org?.description??""},brand:brand.data?{name:brand.data.name,tone:brand.data.tone_of_voice??"—",preferred:brand.data.preferred_words??[],forbiddenClaims:brand.data.forbidden_claims??[],colors:Array.isArray(brand.data.colors)?brand.data.colors.filter((item):item is string=>typeof item==="string"):[]}:null,members:(members.data??[]).map(member=>({id:member.user_id,name:(member.profiles as unknown as {full_name:string|null}|null)?.full_name??"Miembro",role:member.role})),schedules:(schedules.data??[]).map(schedule=>({id:schedule.id,name:schedule.name,status:schedule.status,cron:schedule.cron_expression,timezone:schedule.timezone,lastRun:schedule.last_run_at,nextRun:schedule.next_run_at})),worker:{enabled:automationIsEnabled(),lastDispatch:health.data?.last_dispatch_at??null,lastSuccess:health.data?.last_successful_run_at??null,lastFailure:health.data?.last_failed_run_at??null,queued:taskRows.filter(task=>task.status==="queued").length,running:taskRows.filter(task=>task.status==="running").length,stale:taskRows.filter(task=>task.status==="running"&&task.lease_expires_at&&new Date(task.lease_expires_at).getTime()<now).length},
    // Read, never inferred: a missing value means human review, because the safe reading of "we
    // do not know" is that nobody said anything may go out on its own.
    publishingMode:(org as {publishing_mode?:string}|null)?.publishing_mode==="autonomous"?"autonomous":"human_review",
    contentApprovalMode:(org as {content_approval_mode?:string}|null)?.content_approval_mode==="automatic"?"automatic":"human",
    integrations:(integrations.data??[]).map(row=>({platform:row.platform,status:row.status,handle:row.account_handle,accountName:row.account_name,connectedAt:row.connected_at,lastError:row.last_error})),
    // Resolved server-side, where the secret can be read and then not returned: the screen learns
    // that an app exists and whose it is, never what it is.
    credentials:Object.fromEntries(await Promise.all(SUPPORTED_PLATFORMS.map(async platform=>[platform,await credentialStatus(ctx.orgId,platform)] as const)))};
}
