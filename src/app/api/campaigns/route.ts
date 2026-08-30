import { getOrganizationContext } from "@/features/organizations/context";
import { createAdminClient } from "@/lib/supabase/admin";
import { campaignCreateSchema } from "@/server/campaigns/schemas";
import { validationMessage } from "@/server/validation-message";
import { runCampaignBrainForOrganization } from "@/server/campaigns/workflow";
import { publicError } from "@/server/errors";

function slugify(value:string){return value.normalize("NFD").replace(/[\u0300-\u036f]/g,"").toLowerCase().replace(/[^a-z0-9]+/g,"-").replace(/^-|-$/g,"").slice(0,70)||"campaign";}

// Creating a campaign has to answer quickly. The strategy is queued here and driven by the
// campaign page, which already picks up pending work on mount.
export const maxDuration = 60;

export async function POST(request:Request){
  const parsed=campaignCreateSchema.safeParse(await request.json().catch(()=>null));if(!parsed.success)return Response.json({error:"validation",issues:parsed.error.flatten(),message:validationMessage(parsed.error)},{status:400});
  const context=await getOrganizationContext();if(!context)return Response.json({error:"organization_required",message:"Necesitás una organización activa."},{status:401});if(context.role==="viewer")return Response.json({error:"forbidden",message:"Tu rol es de sólo lectura."},{status:403});
  const{data:objective}=await context.db.from("objectives").select("id,title").eq("id",parsed.data.objectiveId).eq("organization_id",context.orgId).maybeSingle();if(!objective)return Response.json({error:"objective_not_found",message:"El objetivo no pertenece a esta organización."},{status:404});
  const name=parsed.data.name||`Campaña: ${objective.title}`;const db=createAdminClient();const slug=`${slugify(name)}-${crypto.randomUUID().slice(0,8)}`;
  const{data:campaign,error}=await db.from("campaigns").insert({organization_id:context.orgId,objective_id:objective.id,name,slug,status:"draft",business_goal:objective.title,campaign_type:"integrated",target_audience:parsed.data.specificAudience||null,start_date:parsed.data.startDate??null,end_date:parsed.data.endDate??null,budget:parsed.data.budget??null,constraints:parsed.data.constraints,preferred_platforms:parsed.data.platforms,priority:"high",created_by_type:"user",created_by_user_id:context.user.id}).select("id").single();
  if(error||!campaign)return Response.json({error:"campaign_create_failed",message:"No pudimos crear la campaña."},{status:400});
  await db.from("activity_log").insert({organization_id:context.orgId,campaign_id:campaign.id,action:"campaign.created",actor_type:"user",actor_id:context.user.id,entity_type:"campaign",entity_id:campaign.id,summary:`Campaign created: ${name}`,metadata:{objective_id:objective.id}});
  if(parsed.data.developStrategy){try{await runCampaignBrainForOrganization(context.orgId,campaign.id,context.user.id);}catch(error){return Response.json({id:campaign.id,warning:publicError(error),message:"La campaña fue creada, pero Campaign Brain necesita revisión."},{status:201});}}
  return Response.json({id:campaign.id},{status:201});
}
