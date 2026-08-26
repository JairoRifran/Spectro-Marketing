export interface PersistentEvent { id: string; organization_id: string; type: string; payload: Record<string, unknown>; idempotency_key: string; attempt_count: number; max_attempts: number; }
export interface TaskDraft { organization_id: string; title: string; description: string; type: string; status: "queued"; priority: "low"|"medium"|"high"|"urgent"; created_by_type: "system"; assigned_agent_id?: string; source_event_id: string; reason: string; idempotency_key: string; input: Record<string, unknown>; }

export function eventToTask(event: PersistentEvent, agentId?: string): TaskDraft | null {
  if (event.type !== "cmo.daily_review.requested") return null;
  return { organization_id: event.organization_id, title: "Revisión diaria de marketing", description: "Revisar objetivos, prioridades y trabajo pendiente.",
    type: "cmo.daily_review", status: "queued", priority: "high", created_by_type: "system", assigned_agent_id: agentId,
    source_event_id: event.id, reason: "Rutina programada de coordinación del CMO", idempotency_key: `event:${event.id}:cmo-review`, input: event.payload };
}
