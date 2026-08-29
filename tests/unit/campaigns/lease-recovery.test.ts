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
