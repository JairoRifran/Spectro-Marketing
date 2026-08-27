import { getOrganizationContext } from "@/features/organizations/context";
import { runCampaignBrainForOrganization } from "@/server/campaigns/workflow";
import { publicError } from "@/server/errors";

export async function POST(_request:Request,{params}:{params:Promise<{id:string}>}){const{id}=await params;const context=await getOrganizationContext();if(!context)return Response.json({error:"organization_required"},{status:401});if(context.role==="viewer")return Response.json({error:"forbidden"},{status:403});try{return Response.json(await runCampaignBrainForOrganization(context.orgId,id,context.user.id));}catch(error){return Response.json({error:publicError(error)},{status:400});}}
