import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { runManualCampaignTasks } from "@/server/workers/dispatcher";
import { DomainError } from "@/server/errors";

export async function runCampaignBrainForOrganization(organizationId:string,campaignId:string,userId:string){
  const db=createAdminClient();
  const {data:campaign,error}=await db.from("campaigns").select("id,name,status,strategy_version,objective_id,target_audience,constraints,objectives(title,description,metric,target)").eq("id",campaignId).eq("organization_id",organizationId).single();
  if(error||!campaign)throw new DomainError("authorization","Campaign unavailable.","campaign_not_found",false);
  if(!["draft","strategy"].includes(campaign.status))throw new DomainError("validation","Campaign Brain can only run for a draft or rejected strategy.","campaign_not_runnable",false);
  const {count:running}=await db.from("tasks").select("id",{count:"exact",head:true}).eq("campaign_id",campaignId).in("status",["queued","running"]);
  if(running)throw new DomainError("validation","Campaign Brain is already running.","campaign_already_running",false);
  const [brand,products,personas,knowledge,cmo]=await Promise.all([
    db.from("brands").select("name,tone_of_voice,forbidden_claims,forbidden_words").eq("organization_id",organizationId).limit(1).maybeSingle(),
    db.from("products").select("name").eq("organization_id",organizationId).limit(10),
    db.from("personas").select("name").eq("organization_id",organizationId).limit(10),
    db.from("knowledge_items").select("title").eq("organization_id",organizationId).limit(20),
    db.from("agents").select("id").eq("organization_id",organizationId).eq("role","cmo").eq("status","active").single(),
  ]);
  if(cmo.error||!cmo.data)throw new DomainError("validation","Sofía is not available for this organization.","cmo_unavailable",false);
  const objective=campaign.objectives as unknown as {title:string;description:string|null;metric:string;target:number};const version=campaign.strategy_version+1;
  const input={campaignId,campaignName:campaign.name,strategyVersion:version,objectiveTitle:objective.title,objectiveDescription:objective.description,metric:objective.metric,target:objective.target,audienceHint:campaign.target_audience??"",brandName:brand.data?.name,brandTone:brand.data?.tone_of_voice,forbiddenClaims:brand.data?.forbidden_claims??[],forbiddenWords:brand.data?.forbidden_words??[],productNames:(products.data??[]).map(item=>item.name),personaNames:(personas.data??[]).map(item=>item.name),knowledgeTitles:(knowledge.data??[]).map(item=>item.title),constraints:campaign.constraints};
  const {data:task,error:taskError}=await db.from("tasks").insert({organization_id:organizationId,campaign_id:campaignId,objective_id:campaign.objective_id,title:`Desarrollar estrategia: ${campaign.name}`,description:"Sofía coordina Campaign Brain a partir del objetivo y el conocimiento del tenant.",type:"campaign.strategy.draft",status:"queued",priority:"high",created_by_type:"user",created_by_id:userId,assigned_agent_id:cmo.data.id,reason:"Ejecución manual solicitada por un usuario autorizado",expected_impact:"Crear un Campaign Brief sin efectos externos",risk_level:"low",requires_approval:false,scheduled_for:new Date().toISOString(),idempotency_key:`campaign:${campaignId}:strategy:${version}:draft`,input,context_snapshot:{organization_id:organizationId,objective_id:campaign.objective_id,strategy_version:version}}).select("id").single();
  if(taskError||!task)throw new DomainError("non_retryable","Could not start Campaign Brain.","campaign_task_create_failed",false);
  await db.from("campaigns").update({status:"researching"}).eq("id",campaignId).eq("organization_id",organizationId);
  await db.from("activity_log").insert({organization_id:organizationId,campaign_id:campaignId,action:"campaign.research_started",actor_type:"user",actor_id:userId,entity_type:"campaign",entity_id:campaignId,task_id:task.id,summary:"Campaign Brain started manually",metadata:{strategy_version:version,automation_enabled:false}});
  const report=await runManualCampaignTasks({campaignId,maxSteps:6,leaseSeconds:120});
  if(report.failed>0||report.completed!==5)throw new DomainError("non_retryable","Campaign Brain did not complete every strategic stage.","campaign_workflow_incomplete",false);
  const {data:finished}=await db.from("campaigns").select("status,strategy_version").eq("id",campaignId).single();
  return{taskId:task.id,status:finished?.status??"researching",strategyVersion:finished?.strategy_version??campaign.strategy_version,report};
}
