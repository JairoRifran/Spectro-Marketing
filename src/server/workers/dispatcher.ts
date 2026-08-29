import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/admin";
import { log } from "@/lib/logging/logger";
import { publicError } from "@/server/errors";
import { eventToTask, type PersistentEvent } from "@/server/events/handler";
import { configuredAgentProviderName, getAgentProvider } from "@/server/agents/provider";
import type { RuntimeTask } from "@/server/tasks/types";
import { retryDecision } from "@/server/tasks/retry";
import { executionAllowed } from "@/server/policies/execution";
import { persistCampaignOutcome } from "@/server/campaigns/outcomes";
import { persistContentOutcome } from "@/server/content-factory/outcomes";

type AgentRow = { id: string; organization_id: string; role: string; display_name: string; autonomy_level: 0|1|2|3; configuration: Record<string,unknown> };

export interface DispatchReport { workerId: string; schedules: number; events: number; claimed: number; completed: number; retried: number; failed: number; queued: number; running: number; staleLeases: number; }
export interface ManualCampaignReport { workerId:string; claimed:number; completed:number; retried:number; failed:number;
  /** True when the runner stopped because its time budget ran out, not because the queue drained. */
  exhausted:boolean; }

export async function dispatch(options: { workerId: string; batchSize: number; leaseSeconds: number }): Promise<DispatchReport> {
  const db = createAdminClient();
  const report: DispatchReport = { workerId: options.workerId, schedules: 0, events: 0, claimed: 0, completed: 0, retried: 0, failed: 0, queued: 0, running: 0, staleLeases: 0 };
  const { data: schedules, error: scheduleError } = await db.rpc("materialize_due_schedules", { p_limit: options.batchSize });
  if (scheduleError) log("error", "schedule.materialization_failed", {}, { code: scheduleError.code });
  report.schedules = schedules?.length ?? 0;
  report.events = await processEvents(db, options);

  const { data, error } = await db.rpc("claim_ready_tasks", { p_worker_id: options.workerId, p_batch_size: options.batchSize, p_lease_seconds: options.leaseSeconds });
  if (error) throw new Error(`Task claim failed: ${error.code}`);
  const tasks = (data ?? []) as RuntimeTask[];
  report.claimed = tasks.length;
  for (const task of tasks) {
    const result = await executeTask(db, task, options.workerId);
    report[result] += 1;
  }
  await updateWorkerHealth(db, report);
  return report;
}

async function processEvents(db: SupabaseClient, options: { workerId: string; batchSize: number; leaseSeconds: number }) {
  const { data, error } = await db.rpc("claim_pending_events", { p_worker_id: options.workerId, p_batch_size: options.batchSize, p_lease_seconds: options.leaseSeconds });
  if (error) throw new Error(`Event claim failed: ${error.code}`);
  let processed = 0;
  for (const event of (data ?? []) as PersistentEvent[]) {
    const { data: agent } = await db.from("agents").select("id").eq("organization_id", event.organization_id).eq("role", "cmo").maybeSingle();
    const draft = eventToTask(event, agent?.id);
    if (draft) {
      const { error: taskError } = await db.from("tasks").upsert(draft, { onConflict: "organization_id,idempotency_key", ignoreDuplicates: true });
      if (taskError) { await failEvent(db, event, taskError.code); continue; }
    }
    await db.from("events").update({ status: "processed", processed_at: new Date().toISOString(), locked_at: null, locked_by: null, lease_expires_at: null }).eq("id", event.id).eq("locked_by", options.workerId);
    await db.from("activity_log").insert({ organization_id: event.organization_id, action: "event.processed", actor_type: "system", entity_type: "event", entity_id: event.id, event_id: event.id, summary: `Event ${event.type} processed` });
    processed += 1;
  }
  return processed;
}

async function failEvent(db: SupabaseClient, event: PersistentEvent, code: string) {
  const retry = event.attempt_count < event.max_attempts;
  const delayMs = retryDecision(event.attempt_count, event.max_attempts, true).delayMs;
  await db.from("events").update({ status: retry ? "pending" : "failed", available_at: retry ? new Date(Date.now() + delayMs).toISOString() : undefined, error: { code, message: "Event handler failed" }, locked_at: null, locked_by: null, lease_expires_at: null }).eq("id", event.id);
}

async function executeTask(db: SupabaseClient, task: RuntimeTask, workerId: string): Promise<"completed"|"retried"|"failed"> {
  const correlationId = crypto.randomUUID();
  const providerName = configuredAgentProviderName();
  const { data: agentData, error: agentError } = task.assigned_agent_id
    ? await db.from("agents").select("id,organization_id,role,display_name,autonomy_level,configuration").eq("id", task.assigned_agent_id).single()
    : { data: null, error: null };
  if (agentError || !agentData) return finishFailure(db, task, workerId, new Error("Assigned agent not found"));
  const agent = agentData as AgentRow;
  const { data: approved } = task.requires_approval
    ? await db.from("approvals").select("id").eq("task_id",task.id).eq("status","approved").limit(1).maybeSingle()
    : { data: null };
  if(!executionAllowed({autonomyLevel:agent.autonomy_level,riskLevel:task.risk_level,requiresApproval:task.requires_approval,hasApproval:Boolean(approved)}))
    return finishFailure(db,task,workerId,new Error("Autonomy policy denied execution"));
  const runKey = `task:${task.id}:attempt:${task.attempt_count}`;
  const { data: taskRun, error: taskRunError } = await db.from("task_runs").insert({ organization_id: task.organization_id, task_id: task.id, agent_id: agent.id, attempt_number: task.attempt_count, worker_id: workerId, status: "running", input: task.input, correlation_id: correlationId }).select("id").single();
  if (taskRunError) return finishFailure(db, task, workerId, new Error(taskRunError.code));
  const { data: agentRun, error: agentRunError } = await db.from("agent_runs").insert({ organization_id: task.organization_id, agent_id: agent.id, task_id: task.id, event_id: task.source_event_id, provider: providerName, status: "running", input: task.input, idempotency_key: runKey }).select("id").single();
  if (agentRunError) return finishFailure(db, task, workerId, new Error(agentRunError.code), taskRun.id);

  log("info", "task.started", { organizationId: task.organization_id, taskId: task.id, agentId: agent.id, runId: agentRun.id, eventId: task.source_event_id ?? undefined, correlationId });
  try {
    const startedAt=Date.now();
    const result = await getAgentProvider().run({ organizationId: task.organization_id, agent: { id: agent.id, role: agent.role, displayName: agent.display_name, autonomyLevel: agent.autonomy_level, configuration: agent.configuration }, task, correlationId });
    await persistCampaignOutcome(db,task,result,agent);
    await persistContentOutcome(db,task,result,agent);
    const completedAt = new Date().toISOString();
    const { data: completedTask, error: completionError } = await db.from("tasks").update({ status: "completed", output: result.output }).eq("id", task.id).eq("locked_by", workerId).eq("status", "running").select("id").maybeSingle();
    if (completionError || !completedTask) throw Object.assign(new Error("Task lease was lost before completion"), { retryable: true });
    await persistDelegatedTasks(db, task, result.delegatedTasks ?? []);
    await Promise.all([
      db.from("task_runs").update({ status: "completed", output: result.output, completed_at: completedAt }).eq("id", taskRun.id),
      db.from("agent_runs").update({ status: "completed", output: result.output, completed_at: completedAt, model: typeof result.output.model==="string"?result.output.model:null, prompt_version:typeof result.output.promptVersion==="string"?result.output.promptVersion:null, latency_ms:Date.now()-startedAt }).eq("id", agentRun.id),
      db.from("agents").update({ last_run_at: completedAt }).eq("id", agent.id),
      db.from("activity_log").insert({ organization_id: task.organization_id, campaign_id:task.campaign_id, action: "task.completed", actor_type: "agent", actor_id: agent.id, entity_type: "task", entity_id: task.id, task_id: task.id, agent_id: agent.id, event_id: task.source_event_id, run_id: agentRun.id, summary: result.summary, metadata: { provider: providerName, correlation_id: correlationId } }),
    ]);
    return "completed";
  } catch (error) {
    await db.from("agent_runs").update({ status: "failed", error: publicError(error), completed_at: new Date().toISOString() }).eq("id", agentRun.id);
    return finishFailure(db, task, workerId, error, taskRun.id);
  }
}

async function persistDelegatedTasks(db: SupabaseClient, parent: RuntimeTask, delegated: Array<{ role:string; title:string; description:string; type:string; reason:string; input:Record<string,unknown> }>) {
  for (let index = 0; index < delegated.length; index += 1) {
    const item = delegated[index];
    const { data: agent } = await db.from("agents").select("id").eq("organization_id", parent.organization_id).eq("role", item.role).single();
    const key = `parent:${parent.id}:delegated:${index}:${item.type}`;
    const { data: child } = await db.from("tasks").upsert({ organization_id: parent.organization_id, campaign_id:parent.campaign_id, title: item.title, description: item.description, type: item.type, status: "queued", priority: "medium", created_by_type: "agent", created_by_id: parent.assigned_agent_id, assigned_agent_id: agent?.id, objective_id: parent.objective_id, parent_task_id: parent.id, reason: item.reason, idempotency_key: key, input: item.input }, { onConflict: "organization_id,idempotency_key" }).select("id").single();
    if (child) await db.from("task_dependencies").upsert({ organization_id: parent.organization_id, task_id: child.id, depends_on_task_id: parent.id, required: true }, { onConflict: "task_id,depends_on_task_id", ignoreDuplicates: true });
  }
}

async function finishFailure(db: SupabaseClient, task: RuntimeTask, workerId: string, error: unknown, taskRunId?: string): Promise<"retried"|"failed"> {
  const retryable = error instanceof Error && "retryable" in error && error.retryable === true;
  const decision = retryDecision(task.attempt_count, task.max_attempts, retryable);
  const details = publicError(error);
  if (taskRunId) await db.from("task_runs").update({ status: "failed", error: details, completed_at: new Date().toISOString() }).eq("id", taskRunId);
  await db.from("tasks").update(decision.retry ? { status: "queued", scheduled_for: new Date(Date.now() + decision.delayMs).toISOString(), error: details, locked_at: null, locked_by: null, lease_expires_at: null } : { status: "failed", error: details }).eq("id", task.id).eq("locked_by", workerId);
  // Checked, unlike before. This insert is the only record a failed task leaves in the audit
  // trail, and it was fired and forgotten: a task went to `failed` in the tasks table while the
  // activity log stayed silent, which is the one moment the audit trail is actually being read.
  // It must not throw -- that would replace the failure being reported with a failure to report
  // it -- so it is logged instead.
  const { error: auditError } = await db.from("activity_log").insert({ organization_id: task.organization_id, campaign_id:task.campaign_id, action: decision.retry ? "task.retry_scheduled" : "task.failed", actor_type: "system", entity_type: "task", entity_id: task.id, task_id: task.id, agent_id: task.assigned_agent_id, summary: decision.retry ? "Task retry scheduled" : "Task failed", metadata: { error: details, next_delay_ms: decision.delayMs } });
  if (auditError) log("error", "task.audit_write_failed", { taskId: task.id }, { code: auditError.code, message: auditError.message });
  return decision.retry ? "retried" : "failed";
}

/**
 * Drain a campaign's queue, for as long as this invocation is allowed to live.
 *
 * The step count bounds how much work is attempted; `budgetMs` bounds how long. Both are needed
 * once a real model answers: a deterministic step returns in milliseconds, so a step count was a
 * fine proxy for time, but a model can spend a minute on a single answer. Without a time budget
 * the platform kills the function mid-task, which leaves the task marked `running` under a lease
 * nobody will release until it expires — the campaign then reports itself busy for two minutes
 * for no reason, and the work of the step that was killed is lost rather than retried.
 *
 * Stopping before the budget is spent is what makes this resumable: the next call claims the
 * next task and continues, because nothing about the chain lives in this function's memory.
 */
export async function runManualCampaignTasks(options:{campaignId:string;maxSteps:number;leaseSeconds:number;budgetMs?:number}):Promise<ManualCampaignReport>{
  const db=createAdminClient();const workerId=`manual-campaign:${options.campaignId}:${crypto.randomUUID()}`;
  const report:ManualCampaignReport={workerId,claimed:0,completed:0,retried:0,failed:0,exhausted:false};
  const startedAt=Date.now();const budget=options.budgetMs??Number.POSITIVE_INFINITY;
  for(let step=0;step<options.maxSteps;step+=1){
    // Checked before claiming, never mid-task: a task claimed and then abandoned is worse than a
    // task not claimed at all.
    if(Date.now()-startedAt>=budget){report.exhausted=true;break;}
    const{data,error}=await db.rpc("claim_campaign_task",{p_campaign_id:options.campaignId,p_worker_id:workerId,p_lease_seconds:options.leaseSeconds});
    if(error)throw new Error(`Campaign task claim failed: ${error.code}`);
    const task=(data?.[0]??null) as RuntimeTask|null;if(!task)break;
    report.claimed+=1;const outcome=await executeTask(db,task,workerId);report[outcome]+=1;
    if(outcome!=="completed")break;
  }
  return report;
}

async function updateWorkerHealth(db: SupabaseClient, report: DispatchReport) {
  const now = new Date().toISOString();
  const [queued,running,stale]=await Promise.all([
    db.from("tasks").select("id",{count:"exact",head:true}).eq("status","queued"),
    db.from("tasks").select("id",{count:"exact",head:true}).eq("status","running"),
    db.from("tasks").select("id",{count:"exact",head:true}).eq("status","running").lt("lease_expires_at",now),
  ]);
  report.queued=queued.count??0;report.running=running.count??0;report.staleLeases=stale.count??0;
  await db.from("worker_health").upsert({ worker_name: "dispatcher", last_dispatch_at: now, last_successful_run_at: report.failed === 0 ? now : undefined, last_failed_run_at: report.failed > 0 ? now : undefined, metadata: report }, { onConflict: "worker_name" });
}
