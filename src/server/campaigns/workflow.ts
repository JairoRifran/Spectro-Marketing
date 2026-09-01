import "server-only";
import { createAdminClient } from "@/lib/supabase/admin";
import { pendingCampaignWork, runManualCampaignTasks } from "@/server/workers/dispatcher";
import { configuredAgentProviderName } from "@/server/agents/provider";
import { DomainError } from "@/server/errors";
import { log } from "@/lib/logging/logger";
import { CAMPAIGN_STRATEGY_TASK_TYPES, retryAttemptCeiling } from "@/server/campaigns/task-types";

// How much of Campaign Brain runs in one HTTP request.
//
// The deterministic provider answers in milliseconds, so the whole five-stage chain fit in one
// call and the endpoint was written assuming it always would. A real model does not: one stage
// can take most of a minute on its own, and five of them exceed any serverless limit. So when a
// model is answering, an invocation claims a single stage and returns what it did; the caller
// asks again until the chain is drained. Nothing about the chain lives in memory between calls,
// which is what makes that safe.
const STRATEGY_STAGES = 5;
/** Matches the runtime's own bound, so a stage is re-asked rather than handed to a person. */
const STAGE_ATTEMPTS = 6;
const stepsPerCall = () => (configuredAgentProviderName() === "mock" ? STRATEGY_STAGES + 1 : 1);
/** Leaves room inside the platform's limit for the reads and the response after the last stage. */
const BUDGET_MS = 45_000;
/**
 * Just longer than an invocation can live.
 *
 * The lease is how long a task stays claimed after its worker stops existing. Set far above the
 * function's own limit, a worker killed by the platform left the campaign looking busy for the
 * remainder -- refusing to start and refusing to resume -- for no reason other than the number
 * being large. Just above the limit is enough to be sure a live worker is never robbed.
 */
const LEASE_SECONDS = 75;
/** Keep rich tenant knowledge useful without crowding later stages' upstream output out of context. */
const KNOWLEDGE_ITEM_LIMIT = 16;
const KNOWLEDGE_CONTENT_LIMIT = 2_500;

/** Delegated to the shared helper so both manual paths answer this the same way. */
const pending=(db:ReturnType<typeof createAdminClient>,campaignId:string)=>pendingCampaignWork(db,campaignId);

/**
 * Start the chain without waiting for it.
 *
 * Creating a campaign used to run the first strategic stage inside the same HTTP request. That
 * was free when the deterministic provider answered in milliseconds and is a forty-second model
 * call now -- inside a route that declared no duration at all, so the platform killed it, the
 * browser saw a rejected fetch, and pressing "Crear campaña" did nothing and said nothing.
 *
 * The work itself is unchanged: the task is queued exactly as before. What changes is who drives
 * it -- the campaign page picks up pending work on mount, which is the same loop that already
 * carries the chain from one stage to the next.
 */
export async function runCampaignBrainForOrganization(organizationId:string,campaignId:string,userId:string,options:{execute?:boolean}={}){
  const db=createAdminClient();
  const {data:campaign,error}=await db.from("campaigns").select("id,name,status,strategy_version,objective_id,target_audience,constraints,preferred_platforms,objectives(title,description,metric,target)").eq("id",campaignId).eq("organization_id",organizationId).single();
  if(error||!campaign)throw new DomainError("authorization","Campaign unavailable.","campaign_not_found",false);
  if(!["draft","strategy"].includes(campaign.status))throw new DomainError("validation","Campaign Brain can only run for a draft or rejected strategy.","campaign_not_runnable",false);
  const {count:running}=await db.from("tasks").select("id",{count:"exact",head:true}).eq("campaign_id",campaignId).in("status",["queued","running"]);
  if(running)throw new DomainError("validation","Campaign Brain is already running.","campaign_already_running",false);
  const [brand,products,personas,knowledge,cmo]=await Promise.all([
    db.from("brands").select("name,description,slogan,tone_of_voice,personality,preferred_words,forbidden_claims,forbidden_words,visual_instructions,communication_examples").eq("organization_id",organizationId).limit(1).maybeSingle(),
    db.from("products").select("name,description,kind,category,value_proposition,price_text,url").eq("organization_id",organizationId).limit(10),
    db.from("personas").select("name,description,pains,needs,motivations,objections,channels,metadata").eq("organization_id",organizationId).limit(10),
    db.from("knowledge_items").select("title,content,type,source,updated_at").eq("organization_id",organizationId).order("updated_at",{ascending:false}).limit(KNOWLEDGE_ITEM_LIMIT),
    db.from("agents").select("id").eq("organization_id",organizationId).eq("role","cmo").eq("status","active").single(),
  ]);
  if(cmo.error||!cmo.data)throw new DomainError("validation","Sofía is not available for this organization.","cmo_unavailable",false);
  const objective=campaign.objectives as unknown as {title:string;description:string|null;metric:string;target:number};const version=campaign.strategy_version+1;
  const knowledgeItems=(knowledge.data??[]).map(({title,content,type,source})=>({title,type,source,content:content.slice(0,KNOWLEDGE_CONTENT_LIMIT)}));
  const input={campaignId,campaignName:campaign.name,strategyVersion:version,objectiveTitle:objective.title,objectiveDescription:objective.description,metric:objective.metric,target:objective.target,audienceHint:campaign.target_audience??"",brandName:brand.data?.name,brandTone:brand.data?.tone_of_voice,forbiddenClaims:brand.data?.forbidden_claims??[],forbiddenWords:brand.data?.forbidden_words??[],productNames:(products.data??[]).map(item=>item.name),personaNames:(personas.data??[]).map(item=>item.name),knowledgeTitles:knowledgeItems.map(item=>item.title),brandContext:brand.data??null,products:products.data??[],personas:personas.data??[],knowledgeItems,constraints:campaign.constraints,
    // Empty means the strategist chooses freely, which is what it always did. With a list it
    // still decides priority, role and weight -- it simply cannot propose a channel the
    // organization already ruled out.
    allowedPlatforms:(campaign as {preferred_platforms?:string[]}).preferred_platforms??[]};
  const {data:task,error:taskError}=await db.from("tasks").insert({organization_id:organizationId,campaign_id:campaignId,objective_id:campaign.objective_id,title:`Desarrollar estrategia: ${campaign.name}`,description:"Sofía coordina Campaign Brain a partir del objetivo y el conocimiento del tenant.",type:"campaign.strategy.draft",status:"queued",priority:"high",created_by_type:"user",created_by_id:userId,assigned_agent_id:cmo.data.id,reason:"Ejecución manual solicitada por un usuario autorizado",expected_impact:"Crear un Campaign Brief sin efectos externos",risk_level:"low",requires_approval:false,max_attempts:STAGE_ATTEMPTS,scheduled_for:new Date().toISOString(),idempotency_key:`campaign:${campaignId}:strategy:${version}:draft`,input,context_snapshot:{organization_id:organizationId,objective_id:campaign.objective_id,strategy_version:version}}).select("id").single();
  if(taskError||!task)throw new DomainError("non_retryable","Could not start Campaign Brain.","campaign_task_create_failed",false);
  await db.from("campaigns").update({status:"researching"}).eq("id",campaignId).eq("organization_id",organizationId);
  await db.from("activity_log").insert({organization_id:organizationId,campaign_id:campaignId,action:"campaign.research_started",actor_type:"user",actor_id:userId,entity_type:"campaign",entity_id:campaignId,task_id:task.id,summary:"Campaign Brain started manually",metadata:{strategy_version:version,automation_enabled:false}});
  // Queued and handed back by default. Executing here is kept only for callers that want the
  // whole thing inline, which is safe exclusively while a deterministic provider answers.
  if(options.execute===false||(options.execute===undefined&&configuredAgentProviderName()!=="mock")){
    const pendingNow=await pending(db,campaignId);
    return{taskId:task.id,done:false,nextAttemptAt:pendingNow.nextAttemptAt,status:"researching",strategyVersion:version,report:{workerId:"",claimed:0,completed:0,retried:0,failed:0,exhausted:false}};
  }

  const report=await runManualCampaignTasks({campaignId,maxSteps:stepsPerCall(),leaseSeconds:LEASE_SECONDS,budgetMs:BUDGET_MS});
  // A stage that failed is a real failure and stops the run. A stage not reached yet is not:
  // the caller continues from where this invocation left off.
  if(report.failed>0)throw new DomainError("non_retryable","Campaign Brain no pudo completar una etapa estratégica.","campaign_workflow_incomplete",false);
  const {data:finished}=await db.from("campaigns").select("status,strategy_version").eq("id",campaignId).single();
  const left=await pending(db,campaignId);
  return{taskId:task.id,done:left.count===0,nextAttemptAt:left.nextAttemptAt,status:finished?.status??"researching",strategyVersion:finished?.strategy_version??campaign.strategy_version,report};
}

/**
 * Continue a chain that is already under way.
 *
 * Separate from starting one because the guards are opposite: starting refuses when tasks are
 * already queued, and continuing is only meaningful when they are. Collapsing the two would mean
 * a resume could silently open a second strategy version.
 */
export async function resumeCampaignBrainForOrganization(organizationId:string,campaignId:string){
  const db=createAdminClient();
  const {data:campaign,error}=await db.from("campaigns").select("id,status,strategy_version").eq("id",campaignId).eq("organization_id",organizationId).single();
  if(error||!campaign)throw new DomainError("authorization","Campaign unavailable.","campaign_not_found",false);
  const report=await runManualCampaignTasks({campaignId,maxSteps:stepsPerCall(),leaseSeconds:LEASE_SECONDS,budgetMs:BUDGET_MS});
  if(report.failed>0)throw new DomainError("non_retryable","Campaign Brain no pudo completar una etapa estratégica.","campaign_workflow_incomplete",false);
  const {data:finished}=await db.from("campaigns").select("status,strategy_version").eq("id",campaignId).single();
  const left=await pending(db,campaignId);
  return{taskId:null,done:left.count===0,nextAttemptAt:left.nextAttemptAt,status:finished?.status??campaign.status,strategyVersion:finished?.strategy_version??campaign.strategy_version,report};
}

/**
 * Reopen exactly the failed strategy stage a person chose to retry.
 *
 * A non-retryable provider failure used to leave the campaign in `researching` with no queued
 * work. Starting refused that status and resuming found nothing, so the only apparent escape was
 * creating a duplicate campaign. Requeueing the same task preserves its idempotency key,
 * dependencies, input, completed predecessors and complete run history.
 */
export async function requeueFailedCampaignStageForOrganization(organizationId:string,campaignId:string,userId:string){
  const db=createAdminClient();
  const {data:campaign,error:campaignError}=await db.from("campaigns").select("id,status").eq("id",campaignId).eq("organization_id",organizationId).maybeSingle();
  if(campaignError||!campaign)throw new DomainError("authorization","Campaign unavailable.","campaign_not_found",false);
  if(!["researching","strategy"].includes(campaign.status))return false;

  const {data:failed,error:failedError}=await db.from("tasks")
    .select("id,title,type,attempt_count,max_attempts,error,scheduled_for,locked_at,locked_by,lease_expires_at")
    .eq("organization_id",organizationId)
    .eq("campaign_id",campaignId)
    .eq("status","failed")
    .in("type",[...CAMPAIGN_STRATEGY_TASK_TYPES])
    .order("created_at",{ascending:false})
    .limit(1)
    .maybeSingle();
  if(failedError)throw new DomainError("dependency",`No se pudo leer la etapa fallida: ${failedError.code??failedError.message}`,"campaign_failed_stage_read_failed",true);
  if(!failed)return false;

  const maxAttempts=retryAttemptCeiling(failed.attempt_count,failed.max_attempts);
  if(maxAttempts===null)throw new DomainError("validation","Esta etapa alcanzó el límite de reintentos manuales.","campaign_retry_limit",false);
  const {data:requeued,error:requeueError}=await db.from("tasks").update({status:"queued",scheduled_for:new Date().toISOString(),max_attempts:maxAttempts,error:null,locked_at:null,locked_by:null,lease_expires_at:null})
    .eq("id",failed.id)
    .eq("organization_id",organizationId)
    .eq("campaign_id",campaignId)
    .eq("status","failed")
    .eq("attempt_count",failed.attempt_count)
    .select("id")
    .maybeSingle();
  if(requeueError)throw new DomainError("dependency",`No se pudo reabrir la etapa: ${requeueError.code??requeueError.message}`,"campaign_failed_stage_requeue_failed",true);
  if(!requeued)return false;

  const previousError=failed.error as {code?:string}|null;
  const {error:auditError}=await db.from("activity_log").insert({organization_id:organizationId,campaign_id:campaignId,action:"campaign.stage_retry_requested",actor_type:"user",actor_id:userId,entity_type:"task",entity_id:failed.id,task_id:failed.id,summary:`Reintento solicitado: ${failed.title}`,metadata:{task_type:failed.type,previous_error_code:previousError?.code??null,previous_attempt_count:failed.attempt_count}});
  if(auditError){
    // Cron is disabled, so nothing should claim this between the update and the audit. Put it
    // back if the audit cannot be written rather than creating unaudited work. The status guard
    // also keeps this rollback from stealing a task another explicit request already claimed.
    const {error:rollbackError}=await db.from("tasks").update({status:"failed",error:failed.error,scheduled_for:failed.scheduled_for,max_attempts:failed.max_attempts,locked_at:failed.locked_at,locked_by:failed.locked_by,lease_expires_at:failed.lease_expires_at})
      .eq("id",failed.id).eq("organization_id",organizationId).eq("status","queued").eq("attempt_count",failed.attempt_count);
    log("error","campaign.stage_retry_audit_failed",{organizationId,taskId:failed.id},{campaignId,code:auditError.code,message:auditError.message,rollbackCode:rollbackError?.code});
    throw new DomainError("dependency","No se pudo auditar el reintento; la etapa no se reabrió.","campaign_stage_retry_audit_failed",true);
  }
  return true;
}
