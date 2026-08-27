import { canAgentAct, type AutonomyLevel, type RiskLevel } from "@/server/policies/autonomy";

export function executionAllowed(input:{autonomyLevel:AutonomyLevel;riskLevel:RiskLevel;requiresApproval:boolean;hasApproval:boolean}){
  if(input.requiresApproval&&!input.hasApproval)return false;
  return canAgentAct(input.autonomyLevel,input.riskLevel,input.hasApproval);
}
