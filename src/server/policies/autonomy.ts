export type AutonomyLevel = 0 | 1 | 2 | 3;
export type RiskLevel = "low" | "medium" | "high";

export function canAgentAct(level: AutonomyLevel, risk: RiskLevel, hasApproval = false) {
  if (level === 0) return false;
  if (risk === "high") return hasApproval && level >= 2;
  if (risk === "medium") return (hasApproval && level >= 1) || level >= 3;
  return level >= 1;
}

export function needsApproval(level: AutonomyLevel, risk: RiskLevel) {
  if (risk === "high") return true;
  if (risk === "medium") return level < 3;
  return false;
}
