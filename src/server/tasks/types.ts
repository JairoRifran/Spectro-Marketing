export const TASK_STATUSES = ["draft","pending","queued","running","blocked","waiting_approval","completed","failed","cancelled"] as const;
export type TaskStatus = (typeof TASK_STATUSES)[number];
export type TaskPriority = "low" | "medium" | "high" | "urgent";

export interface RuntimeTask {
  id: string; organization_id: string; title: string; description: string | null; type: string; status: TaskStatus;
  priority: TaskPriority; assigned_agent_id: string | null; objective_id: string | null; parent_task_id: string | null;
  source_event_id: string | null; requires_approval: boolean; risk_level: "low" | "medium" | "high";
  attempt_count: number; max_attempts: number; input: Record<string, unknown>; idempotency_key: string | null;
  campaign_id?: string | null;
}
