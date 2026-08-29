import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Campaign Brain has to survive a real model answering it.
//
// The deterministic provider returned in milliseconds, so the endpoint ran all five strategic
// stages inside one HTTP request and nothing objected. A model takes most of a minute per stage,
// which turns that same loop into a function killed halfway through — losing the stage's work and
// leaving its task marked running under a lease nobody releases, so the campaign then reports
// itself busy for two minutes for no reason.
//
// None of that reproduces without a database and a paid call, and by the time it does reproduce
// it is in production. So the shape of the fix is asserted at the source, the same way the
// picture-reuse rules are.

const read = (path: string) => readFileSync(new URL(path, import.meta.url), "utf8");

const dispatcher = read("../../../src/server/workers/dispatcher.ts");
const workflow = read("../../../src/server/campaigns/workflow.ts");
const route = read("../../../src/app/api/campaigns/[id]/run/route.ts");
const button = read("../../../src/components/campaign-run-button.tsx");
const provider = read("../../../src/server/agents/anthropic/provider.ts");

describe("the worker stops before it is stopped", () => {
  it("takes a time budget, not only a step count", () => {
    expect(dispatcher).toContain("budgetMs?:number");
    expect(dispatcher).toContain("report.exhausted=true");
  });

  it("checks the budget before claiming, never mid-task", () => {
    // A task claimed and then abandoned is worse than a task never claimed: the lease outlives
    // the invocation and blocks the campaign.
    const claimIndex = dispatcher.indexOf('db.rpc("claim_campaign_task"');
    const budgetIndex = dispatcher.indexOf("Date.now()-startedAt>=budget");
    expect(budgetIndex).toBeGreaterThan(-1);
    expect(budgetIndex).toBeLessThan(claimIndex);
  });
});

describe("how much runs in one request", () => {
  it("claims a single stage when a model is answering", () => {
    // Deterministic stages still run as one batch, because five of them cost nothing.
    expect(workflow).toContain('configuredAgentProviderName() === "mock"');
    expect(workflow).toMatch(/STRATEGY_STAGES \+ 1 : 1/);
  });

  it("leaves room inside the platform's limit", () => {
    const budget = Number(workflow.match(/BUDGET_MS = ([\d_]+)/)?.[1].replace(/_/g, ""));
    const limit = Number(route.match(/maxDuration = (\d+)/)?.[1]) * 1_000;
    expect(limit).toBeGreaterThan(0);
    expect(budget).toBeLessThan(limit);
  });

  it("gives one call less time than the request that wraps it", () => {
    // Otherwise the platform kills the function first and the error says nothing.
    const call = Number(provider.match(/CALL_TIMEOUT_MS = ([\d_]+)/)?.[1].replace(/_/g, ""));
    const limit = Number(route.match(/maxDuration = (\d+)/)?.[1]) * 1_000;
    expect(call).toBeLessThan(limit);
  });
});

describe("an unfinished chain is not a failed one", () => {
  it("fails only on a stage that actually failed", () => {
    expect(workflow).toContain("if(report.failed>0)");
    // The old rule demanded all five stages in one call, which is exactly what can no longer happen.
    expect(workflow).not.toContain("report.completed!==5");
  });

  it("reports whether work remains, and when it can next be picked up", () => {
    // The second half is what lets the screen wait by itself instead of asking a person to
    // press the same button again.
    expect(workflow).toMatch(/async function pending\(/);
    expect(workflow).toContain("nextAttemptAt");
    expect(workflow).toMatch(/\.in\("status",\s*\["queued",\s*"running"\]\)/);
  });

  it("continues a chain instead of starting a second one", () => {
    // Starting refuses when tasks are queued; continuing is only meaningful when they are. One
    // endpoint doing both would let a second tab open a second strategy version.
    expect(workflow).toContain("resumeCampaignBrainForOrganization");
    expect(route).toContain("resumeCampaignBrainForOrganization");
    expect(route).toMatch(/count\s*\n?\s*\?/);
  });
});

describe("the screen keeps asking until it is done", () => {
  it("loops on the endpoint rather than firing once", () => {
    expect(button).toContain("result.done");
    expect(button).toContain("MAX_CALLS");
  });

  it("bounds the loop, so a chain that never drains stops asking", () => {
    expect(Number(button.match(/MAX_CALLS = (\d+)/)?.[1])).toBeGreaterThan(5);
  });

  it("names the stage instead of showing one unchanging label", () => {
    // Five slow steps behind a single spinner reads as a hang, and the first thing anyone does
    // with a hang is press the button again.
    expect(button).toContain("STAGES");
    expect(button.match(/const STAGES = \[(.*)\]/)?.[1].split(",").length).toBe(5);
  });
});
