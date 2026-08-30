import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// A worker that stops existing must not take the campaign with it.
//
// claim_campaign_task only ever claimed tasks in 'queued'. A task marked 'running' whose worker
// was killed mid-model-call was never looked at again: the lease was computed, written, and read
// by nobody. The campaign then reported itself busy forever, refusing both to start and to
// resume, with nothing in its activity log to say why.
//
// The general dispatcher's claim function had recovered expired leases correctly all along. That
// logic simply never reached the campaign path, and with automation disabled nothing else ran it.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const recovery = read("../../../supabase/migrations/202608290001_campaign_lease_recovery.sql");
const hardening = read("../../../supabase/migrations/202608260004_m01_1_hardening.sql");
const provider = read("../../../src/server/agents/anthropic/provider.ts");
const workflow = read("../../../src/server/campaigns/workflow.ts");
const route = read("../../../src/app/api/campaigns/[id]/run/route.ts");

describe("recovering a lease nobody released", () => {
  it("looks at running tasks whose lease has expired", () => {
    expect(recovery).toMatch(/status='running' and lease_expires_at<now\(\)/);
  });

  it("requeues while attempts remain and fails once they do not", () => {
    // Requeuing forever would retry a genuinely broken task until the end of time.
    expect(recovery).toContain("attempt_count>=e.max_attempts");
    expect(recovery).toContain("'lease_expired'");
  });

  it("scopes recovery to the campaign asking", () => {
    // A campaign-scoped claim must not reach into another campaign's work.
    expect(recovery).toMatch(/campaign_id=p_campaign_id and status='running'/);
  });

  it("writes what happened, so a recovery is not silent", () => {
    expect(recovery).toContain("task.lease_recovered");
    expect(recovery).toContain("activity_log");
  });

  it("matches the recovery the general dispatcher already did", () => {
    // The bug was never a missing idea; it was one path not having it.
    for (const fragment of ["'lease_expired'", "attempt_count>=e.max_attempts", "skip locked"]) {
      expect(hardening, fragment).toContain(fragment);
      expect(recovery, fragment).toContain(fragment);
    }
  });

  it("waits out a retry's backoff instead of spending every attempt at once", () => {
    expect(recovery).toContain("coalesce(t.scheduled_for,now())<=now()");
    expect(recovery).toContain("t.attempt_count<t.max_attempts");
  });

  it("is forward-only", () => {
    expect(recovery).toContain("create or replace function");
    expect(recovery.toLowerCase()).not.toMatch(/drop\s+(function|table|column)/);
  });
});

describe("a call that runs too long fails instead of being killed", () => {
  it("bounds the call by wall clock, not only by request timeout", () => {
    // A stream that keeps emitting events is a request still making progress, so the SDK's
    // timeout never fired and the platform killed the function instead.
    expect(provider).toContain("AbortSignal.timeout(CALL_TIMEOUT_MS)");
  });

  it("treats our own deadline as retryable", () => {
    // It falls into the generic API error branch otherwise, where a missing status reads as
    // permanent — and a stage is abandoned for having been slow once.
    expect(provider).toContain("APIUserAbortError");
    expect(provider).toContain('"anthropic_timeout", true');
  });
});

describe("the lease outlives the worker by as little as possible", () => {
  it("sits just above what one invocation can live", () => {
    const lease = Number(workflow.match(/LEASE_SECONDS = (\d+)/)?.[1]);
    const limit = Number(route.match(/maxDuration = (\d+)/)?.[1]);
    expect(lease).toBeGreaterThan(limit);
    // Far above, a killed worker leaves the campaign looking busy for no reason at all.
    expect(lease).toBeLessThan(limit * 2);
  });
});

describe("a half-finished chain can be reached from the screen", () => {
  const page = read("../../../src/app/campaigns/[id]/page.tsx");
  const button = read("../../../src/components/campaign-run-button.tsx");

  it("offers the button while a campaign is mid-chain", () => {
    // The resume path existed in the API and was unreachable: a campaign sitting in `researching`
    // drew a status pill saying it was busy, and nothing to press.
    // Asked of the work, not of the campaign's status: the moment research persisted the status
    // advanced and a half-finished chain went back to offering "Run Campaign Brain".
    expect(page).toContain("pipeline?.totals.active??0)>0");
    expect(page).not.toContain('c.status==="researching"');
    expect(page).toContain("runnable||resumable");
  });

  it("says it is continuing, not starting over", () => {
    // Someone who reads "Run Campaign Brain" on a half-finished campaign has every reason to
    // think pressing it discards the stages already paid for.
    expect(button).toContain("Continuar estrategia");
    expect(button).toMatch(/sin rehacer lo terminado/);
  });
});

describe("a stage waiting out its backoff is not a failure", () => {
  const button = read("../../../src/components/campaign-run-button.tsx");
  const briefs = read("../../../src/server/agents/anthropic/briefs.ts");
  const dispatcher3 = read("../../../src/server/workers/dispatcher.ts");
  const workflow = read("../../../src/server/campaigns/workflow.ts");

  it("waits out a retry instead of handing it back to a person", () => {
    // A deadline we set ourselves is not news to the user. The runtime queues the stage again
    // seconds later, so the loop sleeps until it is due and carries on.
    expect(button).toContain("result.report?.claimed === 0");
    expect(button).toContain("result.nextAttemptAt");
    expect(button).toContain("await sleep(");
    expect(button).toContain("continue;");
    // The pause state is gone: there is nothing for anyone to do about it.
    expect(button).not.toContain('setState("waiting")');
  });

  it("says it is retrying rather than reporting a fault", () => {
    expect(button).toMatch(/reintentando/i);
  });

  it("still stops eventually, because a loop that never gives up spends all night", () => {
    const calls = Number(button.match(/MAX_CALLS = (\d+)/)?.[1]);
    expect(calls).toBeGreaterThan(5);
    expect(calls).toBeLessThanOrEqual(60);
    expect(button).toMatch(/MAX_WAIT_MS = ([\d_]+)/);
  });

  it("re-asks a stage more times than the deterministic default allowed", () => {
    // Three was sized for a provider that either worked or did not. The same question can miss
    // the ceiling and then make it, and the alternative to retrying is a person with SQL access.
    expect(dispatcher3).toContain("const STAGE_ATTEMPTS = 6");
    expect(dispatcher3).toContain("max_attempts: STAGE_ATTEMPTS");
    expect(workflow).toContain("max_attempts:STAGE_ATTEMPTS");
  });

  it("waits seconds after our own deadline, not the outage backoff", () => {
    expect(dispatcher3).toContain("TIMEOUT_RETRY_DELAY_MS");
    expect(dispatcher3).toMatch(/details\.code === "anthropic_timeout" \? TIMEOUT_RETRY_DELAY_MS/);
  });

  it("runs research below the effort that timed out", () => {
    // Measured twice: it exceeded the deadline at high, then again at medium. Reading a context
    // and organising what is in it is not where a reasoning budget earns anything.
    const research = briefs.slice(briefs.indexOf('"campaign.research"'), briefs.indexOf('"campaign.channel_strategy"'));
    expect(research).toContain('effort: "low"');
    // Every stage but the draft: three of them measured over the deadline, the fourth wider than
    // the ones that were. The draft is one focused output and fits at high.
    for (const type of ['"campaign.channel_strategy"', '"campaign.content_plan"', '"campaign.strategy.finalize"']) {
      const from = briefs.indexOf(type);
      expect(briefs.slice(from, from + 900), type).toContain('effort: "low"');
    }
    const draft = briefs.slice(briefs.indexOf('"campaign.strategy.draft"'), briefs.indexOf('"campaign.research"'));
    expect(draft).toContain('effort: "high"');
  });
});

describe("a failure has to arrive carrying its cause", () => {
  const campaigns = read("../../../src/server/campaigns/outcomes.ts");
  const content = read("../../../src/server/content-factory/outcomes.ts");
  const dispatcher2 = read("../../../src/server/workers/dispatcher.ts");

  it("does not throw a bare Error the boundary will flatten", () => {
    // publicError turns anything that is not a DomainError into "internal_error / No pudimos
    // completar la operación", so the database's own reason never reaches the task row and
    // diagnosing a production failure costs a deploy per hypothesis.
    expect(campaigns).not.toMatch(/throw new Error\(`Campaign persistence failed/);
    expect(content).not.toMatch(/throw new Error\(`Content persistence failed/);
    expect(campaigns).toContain("campaign_persist_failed");
    expect(content).toContain("content_persist_failed");
  });

  it("keeps the database code in the message", () => {
    for (const [name, source] of [["campaigns", campaigns], ["content", content]] as const) {
      expect(source, name).toMatch(/error\.code\s*\?\?\s*"sin codigo"/);
    }
  });

  it("never reports a persistence refusal as retryable", () => {
    // A row the database refuses once it refuses again; retrying only spends the attempts.
    expect(campaigns).toMatch(/"campaign_persist_failed",\s*false/);
    expect(content).toMatch(/"content_persist_failed",\s*false/);
  });

  it("notices when the audit write itself fails", () => {
    // It was fired and forgotten: a task reached `failed` while the activity log stayed silent.
    expect(dispatcher2).toContain("task.audit_write_failed");
    // Reporting the failure must not be replaced by a failure to report it.
    expect(dispatcher2).not.toMatch(/if \(auditError\) throw/);
  });
});

describe("re-running an attempt is not a collision", () => {
  const dispatcher3 = read("../../../src/server/workers/dispatcher.ts");

  it("reuses the agent run belonging to the same attempt", () => {
    // The key is task and attempt and it is unique per organization, so re-running an attempt
    // that already has a row collided — and the collision surfaced as a bare Error carrying a
    // five-digit Postgres code, which the boundary flattened into "internal_error".
    expect(dispatcher3).toContain('onConflict: "organization_id,idempotency_key"');
    expect(dispatcher3).not.toMatch(/from\("agent_runs"\)\s*\.insert\(/);
    // Both run tables or neither: fixing one moved the same 23505 down a line and changed
    // nothing anybody could see.
    expect(dispatcher3).toContain('onConflict: "task_id,attempt_number"');
    expect(dispatcher3).not.toMatch(/from\("task_runs"\)\s*\.insert\(/);
  });

  it("stops throwing bare Errors from the execution path", () => {
    // Every one of these reached the task row as "No pudimos completar la operación".
    for (const bare of ['new Error("Assigned agent not found")', 'new Error("Autonomy policy denied execution")', "new Error(agentRunError.code)", "new Error(taskRunError.code)"]) {
      expect(dispatcher3, bare).not.toContain(bare);
    }
    for (const code of ["assigned_agent_missing", "autonomy_denied", "task_run_insert_failed", "agent_run_insert_failed"]) {
      expect(dispatcher3, code).toContain(code);
    }
  });

  it("keeps the lease-loss retryable, since another worker may simply have won", () => {
    expect(dispatcher3).toContain('Object.assign(new Error("Task lease was lost before completion"), { retryable: true })');
  });
});

describe("the screen does not claim work is happening", () => {
  const pipeline = read("../../../src/server/content-factory/pipeline.ts");
  const view = read("../../../src/components/agent-pipeline.tsx");

  it("separates a task that is running from one that is merely queued", () => {
    // They were the same state, so a queued task made a stage announce "Trabajando ahora" — and
    // a campaign nobody had started read as a campaign that had hung.
    expect(pipeline).toContain('"idle" | "queued" | "working" | "done"');
    expect(pipeline).toContain('task.status === "running"');
    expect(pipeline).toMatch(/inFlight \? "working" : active\.length \? "queued"/);
  });

  it("says queued in words, not as a kind of working", () => {
    expect(view).toContain('visual === "queued"');
    expect(view).toContain("En cola");
    expect(view).toContain("Esperando turno");
  });

  it("still points the eye at stalled work", () => {
    expect(view).toMatch(/working \?\? waiting \?\? queued \?\? done/);
  });
});
