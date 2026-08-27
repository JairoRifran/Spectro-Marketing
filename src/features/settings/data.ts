import { getOrganizationContext } from "@/features/organizations/context";
import { automationIsEnabled, isDemoMode } from "@/lib/env";

export type SettingsData={mode:"demo"|"live";orgName:string;role:string;company:{industry:string;country:string;language:string;timezone:string;description:string};brand:{name:string;tone:string;preferred:string[];forbiddenClaims:string[];colors:string[]}|null;members:Array<{id:string;name:string;role:string}>;schedules:Array<{id:string;name:string;status:string;cron:string;timezone:string;lastRun:string|null;nextRun:string}>;worker:{enabled:boolean;lastDispatch:string|null;lastSuccess:string|null;lastFailure:string|null;queued:number;running:number;stale:number}};

const demo:SettingsData={mode:"demo",orgName:"Northstar Urban",role:"owner",company:{industry:"SaaS B2B",country:"Uruguay",language:"Español",timezone:"America/Montevideo",description:"Datos de demostración explícitos."},brand:{name:"Northstar Urban",tone:"Claro, experto y cercano",preferred:["claridad","avance","evidencia"],forbiddenClaims:["resultados garantizados"],colors:["#102b2a","#16a47a","#f4f6f4"]},members:[{id:"demo-user",name:"Jairo Rifran",role:"owner"}],schedules:[{id:"demo-schedule",name:"CMO Daily Review",status:"active",cron:"0 9 * * *",timezone:"America/Montevideo",lastRun:null,nextRun:new Date(Date.now()+60_000).toISOString()}],worker:{enabled:false,lastDispatch:null,lastSuccess:null,lastFailure:null,queued:3,running:2,stale:0}};

export async function getSettingsData():Promise<SettingsData>{
  if(isDemoMode)return demo;
  const ctx=await getOrganizationContext();
  const empty:SettingsData={mode:"live",orgName:"Sin organización",role:"viewer",company:{industry:"—",country:"—",language:"—",timezone:"—",description:""},brand:null,members:[],schedules:[],worker:{enabled:automationIsEnabled(),lastDispatch:null,lastSuccess:null,lastFailure:null,queued:0,running:0,stale:0}};
  if(!ctx)return empty;
  const [organization,brand,members,schedules,tasks,health]=await Promise.all([
    ctx.db.from("organizations").select("name,description,industry,country,primary_language,timezone").eq("id",ctx.orgId).single(),
    ctx.db.from("brands").select("name,tone_of_voice,preferred_words,forbidden_claims,colors").eq("organization_id",ctx.orgId).order("created_at").limit(1).maybeSingle(),
    ctx.db.from("organization_members").select("user_id,role,profiles(full_name)").eq("organization_id",ctx.orgId).order("created_at"),
    ctx.db.from("schedules").select("id,name,status,cron_expression,timezone,last_run_at,next_run_at").eq("organization_id",ctx.orgId).order("name"),
    ctx.db.from("tasks").select("status,lease_expires_at").eq("organization_id",ctx.orgId).in("status",["queued","running"]),
    ctx.db.from("worker_health").select("last_dispatch_at,last_successful_run_at,last_failed_run_at").eq("worker_name","dispatcher").maybeSingle(),
  ]);
  const org=organization.data;const taskRows=tasks.data??[];const now=Date.now();
  return{mode:"live",orgName:org?.name??ctx.orgName,role:ctx.role,company:{industry:org?.industry??"—",country:org?.country??"—",language:org?.primary_language??"—",timezone:org?.timezone??"—",description:org?.description??""},brand:brand.data?{name:brand.data.name,tone:brand.data.tone_of_voice??"—",preferred:brand.data.preferred_words??[],forbiddenClaims:brand.data.forbidden_claims??[],colors:Array.isArray(brand.data.colors)?brand.data.colors.filter((item):item is string=>typeof item==="string"):[]}:null,members:(members.data??[]).map(member=>({id:member.user_id,name:(member.profiles as unknown as {full_name:string|null}|null)?.full_name??"Miembro",role:member.role})),schedules:(schedules.data??[]).map(schedule=>({id:schedule.id,name:schedule.name,status:schedule.status,cron:schedule.cron_expression,timezone:schedule.timezone,lastRun:schedule.last_run_at,nextRun:schedule.next_run_at})),worker:{enabled:automationIsEnabled(),lastDispatch:health.data?.last_dispatch_at??null,lastSuccess:health.data?.last_successful_run_at??null,lastFailure:health.data?.last_failed_run_at??null,queued:taskRows.filter(task=>task.status==="queued").length,running:taskRows.filter(task=>task.status==="running").length,stale:taskRows.filter(task=>task.status==="running"&&task.lease_expires_at&&new Date(task.lease_expires_at).getTime()<now).length}};
}
