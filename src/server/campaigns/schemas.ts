import { z } from "zod";

const textList = z.array(z.string().min(1).max(500)).max(20);
const priority = z.enum(["low","medium","high","urgent"]);

export const campaignDraftSchema = z.object({
  summary:z.string().min(20).max(3000), targetAudience:z.string().min(5).max(1000), problem:z.string().min(5).max(1000),
  promise:z.string().min(5).max(1000), positioning:z.string().min(5).max(1000), coreMessage:z.string().min(5).max(1000),
  creativeThesis:z.string().min(5).max(1000), primaryCta:z.string().min(2).max(300), confidence:z.number().min(0).max(1),
  audience:z.object({ name:z.string().min(2), description:z.string().min(5), pains:textList, needs:textList, motivations:textList, objections:textList,
    awarenessLevel:z.enum(["unaware","problem_aware","solution_aware","product_aware","most_aware"]) }),
  messaging:z.object({ supportingMessages:textList, valuePropositions:textList, proofPoints:textList, objections:textList,
    objectionResponses:z.array(z.object({objection:z.string(),response:z.string()})).max(20) }),
  signalsUsed:textList, reason:z.string().min(10).max(2000), promptVersion:z.string().min(1), provider:z.string().min(1), model:z.string().nullable(),
});

export const researchReportSchema = z.object({
  researchMode:z.enum(["knowledge_based","external"]), marketContext:textList, audiencePains:textList, audienceLanguage:textList,
  frequentQuestions:textList, objections:textList, competitorMessages:textList, contentPatterns:textList, opportunities:textList, risks:textList,
  recommendedAngles:textList, sources:z.array(z.object({type:z.enum(["brand","product","persona","knowledge","learning","external"]),label:z.string(),reference:z.string().optional()})).max(30),
  assumptions:textList, requiresExternalResearch:textList, confidence:z.number().min(0).max(1), promptVersion:z.string(), provider:z.string(), model:z.string().nullable(),
});

export const channelStrategySchema = z.object({
  channels:z.array(z.object({ channel:z.enum(["instagram","facebook","tiktok","youtube","linkedin","x","threads"]), enabled:z.boolean(),
    roleInCampaign:z.string().min(3), objective:z.string().min(3), audienceFit:z.string().min(3), priority, formats:textList,
    publishingFrequency:z.string().min(1), toneAdjustment:z.string().min(1), contentNotes:z.string().min(1), score:z.number().int().min(0).max(100),
    reason:z.string().min(5), confidence:z.number().min(0).max(1) })).min(1).max(7),
  promptVersion:z.string(), provider:z.string(), model:z.string().nullable(),
});

export const contentPlanSchema = z.object({
  pillars:z.array(z.object({name:z.string().min(2),description:z.string().min(5),weight:z.number().min(0).max(100),objective:z.string().min(3)})).min(1).max(12),
  angles:z.array(z.object({name:z.string().min(2),description:z.string().min(5),hypothesis:z.string().min(5),audiencePain:z.string().min(3),promise:z.string().min(3),recommendedFormats:textList,priority,confidence:z.number().min(0).max(1)})).min(1).max(20),
  editorialDirection:z.string().min(10).max(2000), promptVersion:z.string(), provider:z.string(), model:z.string().nullable(),
});

export const campaignBriefSchema = z.object({
  reason:z.string().min(10), confidence:z.number().min(0).max(1), signalsUsed:textList,
  promptVersion:z.string(), provider:z.string(), model:z.string().nullable(),
});

export const campaignCreateSchema = z.object({
  objectiveId:z.uuid(), name:z.string().trim().min(3).max(160).optional(), specificAudience:z.string().trim().max(1200).optional().default(""),
  startDate:z.iso.date().nullable().optional(), endDate:z.iso.date().nullable().optional(), budget:z.number().min(0).nullable().optional(),
  constraints:z.array(z.string().trim().min(1).max(500)).max(20).default([]), developStrategy:z.boolean().default(true),
}).refine(value=>!value.startDate||!value.endDate||value.endDate>=value.startDate,{message:"La fecha final debe ser posterior a la inicial",path:["endDate"]});

export type CampaignDraft = z.infer<typeof campaignDraftSchema>;
export type ResearchReport = z.infer<typeof researchReportSchema>;
export type ChannelStrategy = z.infer<typeof channelStrategySchema>;
export type ContentPlan = z.infer<typeof contentPlanSchema>;

export function pillarWeightReport(pillars:Array<{weight:number}>){const total=pillars.reduce((sum,item)=>sum+item.weight,0);return{total,coherent:Math.abs(total-100)<0.01,message:Math.abs(total-100)<0.01?"La distribución suma 100%.":`La distribución suma ${total}%; revisala antes de producir contenido.`};}
