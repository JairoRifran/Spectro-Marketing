import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { AgentResult } from "@/server/agents/contracts";
import type { RuntimeTask } from "@/server/tasks/types";
import { DomainError } from "@/server/errors";
import { campaignBriefSchema,campaignDraftSchema,channelStrategySchema,contentPlanSchema,pillarWeightReport,researchReportSchema } from "./schemas";
import { validateBrandGuardrails } from "./guardrails";

type AgentRef={id:string;role:string};
const fail=(message:string):never=>{throw new DomainError("validation",message,"campaign_output_invalid",false);};
// A persistence failure has to arrive carrying its cause.
//
// This threw a plain Error, and publicError turns anything that is not a DomainError into
// "internal_error / No pudimos completar la operacion" before it reaches the task row. The
// database said exactly what was wrong -- a constraint, a type, a missing column -- and the
// boundary replaced it with a sentence that fits every failure and identifies none. Diagnosing a
// production failure then costs a deploy per hypothesis.
//
// It is not retryable: a row the database refuses once it refuses again.
async function checked(query:PromiseLike<{error:{code?:string;message?:string}|null}>){
  const{error}=await query;
  if(error)throw new DomainError("dependency",`No se pudo guardar el resultado de la campana: ${error.code??"sin codigo"} ${error.message??""}`.trim(),"campaign_persist_failed",false);
}

export async function persistCampaignOutcome(db:SupabaseClient,task:RuntimeTask,result:AgentResult,agent:AgentRef){
  if(!task.campaign_id||!task.type.startsWith("campaign."))return;
  const campaignId=task.campaign_id;const organizationId=task.organization_id;const version=Number(task.input.strategyVersion);
  if(!Number.isInteger(version)||version<1)fail("Campaign strategy version is missing.");
  if(task.type==="campaign.strategy.draft"){
    const parsed=campaignDraftSchema.safeParse(result.output);if(!parsed.success)fail("Sofía returned an invalid campaign draft.");const value=parsed.data!;
    await checked(db.from("campaigns").update({summary:value.summary,target_audience:value.targetAudience,problem:value.problem,promise:value.promise,positioning:value.positioning,core_message:value.coreMessage,creative_thesis:value.creativeThesis,primary_cta:value.primaryCta,confidence:value.confidence,strategy_provider:value.provider,strategy_prompt_version:value.promptVersion,status:"researching"}).eq("id",campaignId).eq("organization_id",organizationId));
    await checked(db.from("campaign_audiences").upsert({organization_id:organizationId,campaign_id:campaignId,strategy_version:version,name:value.audience.name,description:value.audience.description,pains:value.audience.pains,needs:value.audience.needs,motivations:value.audience.motivations,objections:value.audience.objections,awareness_level:value.audience.awarenessLevel,metadata:{source:"campaign_brain",provider:value.provider}},{onConflict:"campaign_id,strategy_version"}));
    await checked(db.from("campaign_messaging_frameworks").upsert({organization_id:organizationId,campaign_id:campaignId,strategy_version:version,core_message:value.coreMessage,supporting_messages:value.messaging.supportingMessages,value_propositions:value.messaging.valuePropositions,proof_points:value.messaging.proofPoints,objections:value.messaging.objections,objection_responses:value.messaging.objectionResponses,cta:value.primaryCta,forbidden_claims:task.input.forbiddenClaims??[]},{onConflict:"campaign_id,strategy_version"}));
  } else if(task.type==="campaign.research"){
    const parsed=researchReportSchema.safeParse(result.output);if(!parsed.success)fail("Mateo returned an invalid research report.");const value=parsed.data!;
    await checked(db.from("campaign_research").upsert({organization_id:organizationId,campaign_id:campaignId,strategy_version:version,research_mode:value.researchMode,market_context:value.marketContext,audience_pains:value.audiencePains,audience_language:value.audienceLanguage,frequent_questions:value.frequentQuestions,objections:value.objections,competitor_messages:value.competitorMessages,content_patterns:value.contentPatterns,opportunities:value.opportunities,risks:value.risks,recommended_angles:value.recommendedAngles,sources:value.sources,assumptions:value.assumptions,requires_external_research:value.requiresExternalResearch,confidence:value.confidence},{onConflict:"campaign_id,strategy_version"}));
    await checked(db.from("campaigns").update({status:"strategy"}).eq("id",campaignId).eq("organization_id",organizationId));
    await activity(db,organizationId,campaignId,"campaign.research_completed",agent.id,task.id,"Mateo completed knowledge-based campaign research",{research_mode:value.researchMode,confidence:value.confidence});
  } else if(task.type==="campaign.channel_strategy"){
    const parsed=channelStrategySchema.safeParse(result.output);if(!parsed.success)fail("Valentina returned an invalid channel strategy.");const value=parsed.data!;const rows=value.channels.map(item=>({organization_id:organizationId,campaign_id:campaignId,strategy_version:version,channel:item.channel,enabled:item.enabled,role_in_campaign:item.roleInCampaign,objective:item.objective,audience_fit:item.audienceFit,priority:item.priority,formats:item.formats,publishing_frequency:item.publishingFrequency,tone_adjustment:item.toneAdjustment,content_notes:item.contentNotes,score:item.score,reason:item.reason,confidence:item.confidence}));
    await checked(db.from("campaign_channels").upsert(rows,{onConflict:"campaign_id,strategy_version,channel"}));
    await activity(db,organizationId,campaignId,"campaign.channel_strategy_created",agent.id,task.id,"Valentina created the channel strategy",{recommended:rows.filter(row=>row.enabled).map(row=>row.channel)});
  } else if(task.type==="campaign.content_plan"){
    const parsed=contentPlanSchema.safeParse(result.output);if(!parsed.success)fail("Bruno returned an invalid content plan.");const value=parsed.data!;
    const pillars=value.pillars.map(item=>({organization_id:organizationId,campaign_id:campaignId,strategy_version:version,name:item.name,description:item.description,weight:item.weight,objective:item.objective}));
    const angles=value.angles.map(item=>({organization_id:organizationId,campaign_id:campaignId,strategy_version:version,name:item.name,description:item.description,hypothesis:item.hypothesis,audience_pain:item.audiencePain,promise:item.promise,recommended_formats:item.recommendedFormats,priority:item.priority,confidence:item.confidence}));
    await checked(db.from("campaign_content_pillars").upsert(pillars,{onConflict:"campaign_id,strategy_version,name"}));
    await checked(db.from("campaign_angles").upsert(angles,{onConflict:"campaign_id,strategy_version,name"}));
    await activity(db,organizationId,campaignId,"campaign.pillars_created",agent.id,task.id,"Bruno created content pillars and creative angles",pillarWeightReport(value.pillars));
  } else if(task.type==="campaign.strategy.finalize"){
    const parsed=campaignBriefSchema.safeParse(result.output);if(!parsed.success)fail("Sofía returned an invalid final brief.");const value=parsed.data!;
    const [campaign,audience,research,channels,pillars,angles,messaging]=await Promise.all([
      db.from("campaigns").select("*").eq("id",campaignId).eq("organization_id",organizationId).single(),
      db.from("campaign_audiences").select("*").eq("campaign_id",campaignId).eq("strategy_version",version).single(),
      db.from("campaign_research").select("*").eq("campaign_id",campaignId).eq("strategy_version",version).single(),
      db.from("campaign_channels").select("*").eq("campaign_id",campaignId).eq("strategy_version",version).order("score",{ascending:false}),
      db.from("campaign_content_pillars").select("*").eq("campaign_id",campaignId).eq("strategy_version",version).order("weight",{ascending:false}),
      db.from("campaign_angles").select("*").eq("campaign_id",campaignId).eq("strategy_version",version).order("confidence",{ascending:false}),
      db.from("campaign_messaging_frameworks").select("*").eq("campaign_id",campaignId).eq("strategy_version",version).single(),
    ]);
    if(campaign.error||audience.error||research.error||channels.error||pillars.error||angles.error||messaging.error)fail("Campaign brief dependencies are incomplete.");
    const texts=[campaign.data.name,campaign.data.summary,campaign.data.problem,campaign.data.promise,campaign.data.positioning,campaign.data.core_message,campaign.data.creative_thesis,campaign.data.primary_cta,...(messaging.data.supporting_messages??[]),...(messaging.data.value_propositions??[])].filter(Boolean) as string[];
    const guardrails=validateBrandGuardrails({texts,forbiddenWords:(task.input.forbiddenWords as string[]|undefined)??[],forbiddenClaims:(task.input.forbiddenClaims as string[]|undefined)??[],campaignConstraints:(task.input.constraints as string[]|undefined)??[]});
    if(!guardrails.passed)throw new DomainError("validation","Campaign strategy violates brand guardrails.","campaign_guardrail_violation",false);
    const brief={campaign:campaign.data,audience:audience.data,research:research.data,channels:channels.data,pillars:pillars.data,angles:angles.data,messaging:messaging.data};
    await checked(db.from("campaign_strategy_versions").upsert({organization_id:organizationId,campaign_id:campaignId,version,status:"proposed",brief,rationale:{reason:value.reason,signals_used:value.signalsUsed,confidence:value.confidence},guardrail_report:guardrails,provider:value.provider,model:value.model,prompt_version:value.promptVersion,created_by_agent_id:agent.id},{onConflict:"campaign_id,version"}));
    await checked(db.from("campaigns").update({status:"ready",confidence:value.confidence,strategy_version:version,strategy_provider:value.provider,strategy_prompt_version:value.promptVersion}).eq("id",campaignId).eq("organization_id",organizationId));
    const{data:openApproval,error:approvalReadError}=await db.from("approvals").select("id").eq("task_id",task.id).eq("status","requested").maybeSingle();if(approvalReadError)throw new Error(`Campaign approval read failed: ${approvalReadError.code}`);
    if(!openApproval)await checked(db.from("approvals").insert({organization_id:organizationId,campaign_id:campaignId,task_id:task.id,status:"requested",risk_level:"medium",requested_by_type:"agent",requested_by_id:agent.id,reason:"Campaign strategy ready for human review",proposed_change:{artifact:"campaign_strategy",campaign_id:campaignId,strategy_version:version,external_side_effects:false},expected_impact:"Approve the strategic foundation; no publishing, spend or external integration is activated."}));
    await activity(db,organizationId,campaignId,"campaign.strategy_ready",agent.id,task.id,"Sofía consolidated Campaign Brief v"+version,{version,provider:value.provider,prompt_version:value.promptVersion,confidence:value.confidence});
    await activity(db,organizationId,campaignId,"campaign.approval_requested",agent.id,task.id,"Campaign strategy is waiting for human approval",{version});
  }
}

async function activity(db:SupabaseClient,organizationId:string,campaignId:string,action:string,agentId:string,taskId:string,summary:string,metadata:Record<string,unknown>){await checked(db.from("activity_log").insert({organization_id:organizationId,campaign_id:campaignId,action,actor_type:"agent",actor_id:agentId,entity_type:"campaign",entity_id:campaignId,task_id:taskId,agent_id:agentId,summary,metadata}));}
