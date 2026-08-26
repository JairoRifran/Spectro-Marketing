import { createClient } from "@/lib/supabase/server";
import { isDemoMode } from "@/lib/env";

export type HqAgent = { id:string; initials:string; name:string; role:string; state:"Working"|"Queued"|"Idle"; task:string; tone:string };
export type HqData = {
  mode:"demo"|"live"; organizationName:string; objective:null|{title:string;metric:string;baseline:number|null;target:number;market:string|null;priority:string;deadline:string|null};
  agents:HqAgent[]; counts:{completed:number;running:number;queued:number;approval:number;failed:number};
  approval:null|{id:string;title:string;reason:string;risk:string;agentName:string;agentRole:string};
  activity:Array<{id:string;summary:string;action:string;createdAt:string}>; health:{healthy:boolean;lastDispatch:string|null};
};

const demoData: HqData = {
  mode:"demo", organizationName:"Northstar Urban", objective:{title:"Aumentar registros calificados un 30%",metric:"Registros calificados",baseline:1240,target:1612,market:"Uruguay",priority:"high",deadline:"2026-10-12"},
  agents:[
    {id:"00000000-0000-0000-0000-000000000101",initials:"SO",name:"Sofía",role:"CMO",state:"Working",task:"Revisando prioridades del trimestre",tone:"coral"},
    {id:"00000000-0000-0000-0000-000000000102",initials:"MA",name:"Mateo",role:"Market Intelligence",state:"Queued",task:"Análisis de señales de mercado",tone:"blue"},
    {id:"00000000-0000-0000-0000-000000000103",initials:"VA",name:"Valentina",role:"Social Media",state:"Idle",task:"Sin trabajo asignado",tone:"violet"},
    {id:"00000000-0000-0000-0000-000000000107",initials:"TO",name:"Tomás",role:"Analytics",state:"Idle",task:"Sin trabajo asignado",tone:"green"},
  ], counts:{completed:8,running:2,queued:3,approval:1,failed:0},
  approval:{id:"demo-approval",title:"Aprobar brief de campaña “Vuelta a la rutina”",reason:"Bruno preparó el enfoque editorial y necesita validación antes de delegar la producción.",risk:"medium",agentName:"Bruno",agentRole:"Content Strategist"},
  activity:[
    {id:"a1",summary:"Sofía revisó 4 objetivos activos",action:"task.completed",createdAt:new Date(Date.now()-8*60_000).toISOString()},
    {id:"a2",summary:"Sofía delegó análisis de mercado a Mateo",action:"agent.created_task",createdAt:new Date(Date.now()-11*60_000).toISOString()},
    {id:"a3",summary:"Tomás registró un nuevo aprendizaje",action:"learning.created",createdAt:new Date(Date.now()-60*60_000).toISOString()},
    {id:"a4",summary:"Vera completó auditoría semanal",action:"task.completed",createdAt:new Date(Date.now()-2*60*60_000).toISOString()},
  ], health:{healthy:true,lastDispatch:new Date(Date.now()-42_000).toISOString()},
};

export async function getHqData(): Promise<HqData> {
  if (isDemoMode || !process.env.NEXT_PUBLIC_SUPABASE_URL || !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) return demoData;
  const db = await createClient();
  const { data:{ user } } = await db.auth.getUser();
  const empty: HqData = { ...demoData, mode:"live", organizationName:"Sin organización", objective:null, agents:[], counts:{completed:0,running:0,queued:0,approval:0,failed:0}, approval:null, activity:[], health:{healthy:false,lastDispatch:null} };
  if (!user) return empty;
  const { data:membership } = await db.from("organization_members").select("organization_id,organizations(name)").eq("user_id",user.id).limit(1).maybeSingle();
  if (!membership) return empty;
  const orgId=membership.organization_id;
  const [objectiveResult,agentsResult,tasksResult,approvalResult,activityResult,healthResult] = await Promise.all([
    db.from("objectives").select("title,metric,baseline,target,market,priority,deadline").eq("organization_id",orgId).eq("status","active").order("created_at",{ascending:false}).limit(1).maybeSingle(),
    db.from("agents").select("id,display_name,description,role").eq("organization_id",orgId).eq("status","active").order("display_name").limit(8),
    db.from("tasks").select("id,title,status,assigned_agent_id,created_at").eq("organization_id",orgId).gte("created_at",new Date(new Date().setHours(0,0,0,0)).toISOString()).limit(200),
    db.from("approvals").select("id,reason,risk_level,tasks(title,assigned_agent_id)").eq("organization_id",orgId).eq("status","requested").order("created_at").limit(1).maybeSingle(),
    db.from("activity_log").select("id,summary,action,created_at").eq("organization_id",orgId).order("created_at",{ascending:false}).limit(8),
    db.from("worker_health").select("last_dispatch_at").eq("worker_name","dispatcher").maybeSingle(),
  ]);
  const tasks=tasksResult.data ?? []; const tones=["coral","blue","violet","green"];
  const agents=(agentsResult.data ?? []).map((agent,index) => { const current=tasks.find(task=>task.assigned_agent_id===agent.id&&task.status==="running")??tasks.find(task=>task.assigned_agent_id===agent.id&&task.status==="queued"); return {id:agent.id,initials:agent.display_name.slice(0,2).toUpperCase(),name:agent.display_name,role:agent.description??agent.role,state:(current?.status==="running"?"Working":current?"Queued":"Idle") as HqAgent["state"],task:current?.title??"Sin trabajo asignado",tone:tones[index%tones.length]}; });
  const approvalTask=approvalResult.data?.tasks as unknown as {title:string;assigned_agent_id:string|null}|null; const proposer=agents.find(agent=>agent.id===approvalTask?.assigned_agent_id); const orgRelation=membership.organizations as unknown as {name:string}|null;
  const objective=objectiveResult.data?{...objectiveResult.data,baseline:objectiveResult.data.baseline===null?null:Number(objectiveResult.data.baseline),target:Number(objectiveResult.data.target)}:null;
  return {mode:"live",organizationName:orgRelation?.name??"Organización",objective,agents,counts:{completed:tasks.filter(t=>t.status==="completed").length,running:tasks.filter(t=>t.status==="running").length,queued:tasks.filter(t=>t.status==="queued").length,approval:approvalResult.data?1:0,failed:tasks.filter(t=>t.status==="failed").length},approval:approvalResult.data?{id:approvalResult.data.id,title:approvalTask?.title??"Solicitud de aprobación",reason:approvalResult.data.reason,risk:approvalResult.data.risk_level,agentName:proposer?.name??"Agente",agentRole:proposer?.role??"Equipo"}:null,activity:(activityResult.data??[]).map(item=>({id:item.id,summary:item.summary,action:item.action,createdAt:item.created_at})),health:{healthy:Boolean(healthResult.data?.last_dispatch_at),lastDispatch:healthResult.data?.last_dispatch_at??null}};
}

export function relativeTime(value: string|null) { if(!value)return "sin ejecuciones";const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(seconds<60)return `hace ${seconds} s`;if(seconds<3600)return `hace ${Math.floor(seconds/60)} min`;if(seconds<86400)return `hace ${Math.floor(seconds/3600)} h`;return `hace ${Math.floor(seconds/86400)} d`; }
