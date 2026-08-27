export const CAMPAIGN_STATUSES=["draft","researching","strategy","ready","active","paused","completed","cancelled"] as const;
export type CampaignStatus=(typeof CAMPAIGN_STATUSES)[number];
const transitions:Record<CampaignStatus,CampaignStatus[]>={draft:["researching","cancelled"],researching:["strategy","cancelled"],strategy:["researching","ready","cancelled"],ready:["researching","strategy","active","cancelled"],active:["paused","completed","cancelled"],paused:["active","completed","cancelled"],completed:[],cancelled:[]};
export function canTransitionCampaign(from:CampaignStatus,to:CampaignStatus){return from===to||transitions[from].includes(to);}
export function campaignStatusAfterApproval(status:CampaignStatus,decision:"approved"|"rejected"){if(status!=="ready")return status;return decision==="approved"?"ready":"strategy";}
export function nextStrategyVersion(current:number){if(!Number.isInteger(current)||current<0)throw new Error("Invalid strategy version");return current+1;}
