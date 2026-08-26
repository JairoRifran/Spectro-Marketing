import type { AutonomyLevel, RiskLevel } from "@/server/policies/autonomy";
import { needsApproval } from "@/server/policies/autonomy";

export type ApprovalStatus = "requested" | "approved" | "rejected" | "expired";
export function initialTaskStatus(level: AutonomyLevel, risk: RiskLevel) { return needsApproval(level, risk) ? "waiting_approval" : "queued"; }
export function canDecideApproval(from: ApprovalStatus, to: ApprovalStatus) { return from === "requested" && ["approved","rejected","expired"].includes(to); }
