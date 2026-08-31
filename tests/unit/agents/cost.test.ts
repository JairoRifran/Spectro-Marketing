import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { MODEL, STANDARD_MODEL, modelFor, premiumTasks } from "@/server/agents/anthropic/provider";
import { cacheableContext } from "@/server/agents/shaping";
import { costUsd, isPriced, uncachedCostUsd } from "@/server/agents/pricing";
import { summarise } from "@/features/campaigns/cost";
import type { AgentContext } from "@/server/agents/contracts";
import type { RuntimeTask } from "@/server/tasks/types";

const CAMPAIGN = {
  campaignId: "c1",
  campaignName: "Marca desde 0",
  objectiveTitle: "30 reuniones",
  metric: "reuniones",
  target: 30,
  brandContext: { name: "Spectro", forbidden_words: ["revolucionario"] },
  products: [{ name: "Campaign Brain" }],
  personas: [{ name: "Dueño de pyme" }],
  knowledgeItems: [{ title: "Guía de marca", content: "…" }],
  constraints: ["No prometer resultados numéricos"],
};

const contextFor = (type: string, input: Record<string, unknown>): AgentContext => ({
  organizationId: "o1",
  agent: { id: "a1", role: "cmo", displayName: "Sofía", autonomyLevel: 1, configuration: {} },
  task: {
    id: "t1", organization_id: "o1", title: `Etapa ${type}`, description: null, type, status: "running",
    priority: "medium", assigned_agent_id: "a1", objective_id: null, parent_task_id: null,
    source_event_id: null, requires_approval: false, risk_level: "low",
    attempt_count: 1, max_attempts: 3, input, idempotency_key: null, campaign_id: "c1",
  } as RuntimeTask,
  correlationId: "corr-1",
});

describe("which model answers which stage", () => {
  it("keeps the positioning and the customer-facing copy on the expensive model", () => {
    expect(modelFor("campaign.strategy.draft", {})).toBe(MODEL);
    expect(modelFor("content.copy", {})).toBe(MODEL);
  });

  it("moves the restructuring stages to the cheaper one", () => {
    // These assemble and score material that is already in the prompt. Paying Opus rates to
    // reorganise an upstream step's own output is the clearest waste in the pipeline.
    for (const type of ["campaign.research", "campaign.channel_strategy", "campaign.content_plan", "campaign.strategy.finalize", "content.creative_review"]) {
      expect(modelFor(type, {}), type).toBe(STANDARD_MODEL);
    }
  });

  it("lets a deployment move the line", () => {
    expect(modelFor("campaign.research", { AI_PREMIUM_TASKS: "campaign.research" })).toBe(MODEL);
    expect(modelFor("content.copy", { AI_PREMIUM_TASKS: "" })).toBe(STANDARD_MODEL);
    expect(premiumTasks({})).toContain("content.copy");
  });

  it("does not reach for Haiku", () => {
    // Cheaper still, and not a swap: Haiku 4.5 predates the 4.6 API and rejects both adaptive
    // thinking and output_config.effort, so it would be a second request shape to maintain.
    const source = readFileSync(new URL("../../../src/server/agents/anthropic/provider.ts", import.meta.url), "utf8");
    expect(source).toContain('STANDARD_MODEL = "claude-sonnet-5"');
  });
});

describe("what gets cached", () => {
  it("keeps the stable half byte-identical as a campaign advances", () => {
    // This is the whole mechanism. Caching is a prefix match, so two stages of one campaign only
    // share a cache if the organisation block they carry is identical down to the byte -- which
    // means the growing `upstream` has to be on the other side of the breakpoint.
    const draft = cacheableContext(contextFor("campaign.strategy.draft", { ...CAMPAIGN, upstream: {} }));
    const research = cacheableContext(contextFor("campaign.research", {
      ...CAMPAIGN,
      upstream: { "campaign.strategy.draft": { pillars: ["uno", "dos"] } },
      sourceTaskId: "t1",
    }));
    expect(research.stable).toBe(draft.stable);
    expect(research.volatile).not.toBe(draft.volatile);
  });

  it("survives a differently ordered input object", () => {
    // Object key order is not a promise anybody made, and an unsorted serialisation is one of
    // the classic silent cache invalidators: same data, different bytes, zero hits.
    const forwards = cacheableContext(contextFor("campaign.research", { campaignId: "c1", products: [], brandContext: null }));
    const backwards = cacheableContext(contextFor("campaign.research", { brandContext: null, products: [], campaignId: "c1" }));
    expect(backwards.stable).toBe(forwards.stable);
  });

  it("puts the upstream output and nothing else in the volatile half", () => {
    const { stable, volatile } = cacheableContext(contextFor("campaign.research", {
      ...CAMPAIGN,
      upstream: { "campaign.strategy.draft": { pillars: ["uno"] } },
      sourceTaskId: "t1",
    }));
    expect(volatile).toContain("upstream");
    expect(stable).not.toContain("upstream");
    // An internal identifier says nothing about the campaign and belongs in neither.
    expect(`${stable}${volatile}`).not.toContain("sourceTaskId");
  });

  it("leaves an unknown key out of the cached prefix rather than in it", () => {
    // The conservative direction: a key nobody listed costs a cache hit. The other mistake --
    // a per-piece value inside the prefix -- means it never hits and pays the write premium
    // on every single call.
    const { stable, volatile } = cacheableContext(contextFor("content.copy", { conceptId: "k9", brief: { platform: "linkedin" } }));
    expect(volatile).toContain("conceptId");
    expect(stable).not.toContain("conceptId");
  });

  it("marks exactly one breakpoint, on the stable block", () => {
    const source = readFileSync(new URL("../../../src/server/agents/anthropic/provider.ts", import.meta.url), "utf8");
    expect(source.match(/cache_control/g)).toHaveLength(1);
    expect(source).toMatch(/text: stable, cache_control/);
  });
});

describe("turning tokens into money", () => {
  it("prices a plain call from the model's own rates", () => {
    // Opus 5: $5 per million in, $25 out.
    expect(costUsd(MODEL, { inputTokens: 1_000_000, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(5);
    expect(costUsd(MODEL, { inputTokens: 0, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(25);
    expect(costUsd(STANDARD_MODEL, { inputTokens: 1_000_000, outputTokens: 1_000_000, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(12);
  });

  it("charges a cache read at a tenth and a write at a quarter more", () => {
    expect(costUsd(MODEL, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 1_000_000, cacheWriteTokens: 0 })).toBe(0.5);
    expect(costUsd(MODEL, { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 1_000_000 })).toBe(6.25);
  });

  it("says what the same call would have cost uncached", () => {
    // Without this the saving is invisible: a smaller bill and a quieter month look the same.
    const usage = { inputTokens: 1_000, outputTokens: 0, cacheReadTokens: 999_000, cacheWriteTokens: 0 };
    expect(costUsd(MODEL, usage)).toBeCloseTo(0.5045, 4);
    expect(uncachedCostUsd(MODEL, usage)).toBe(5);
  });

  it("reports zero for a model it cannot price instead of inventing a rate", () => {
    expect(isPriced("qwen2.5:3b")).toBe(false);
    expect(costUsd("qwen2.5:3b", { inputTokens: 500_000, outputTokens: 500_000, cacheReadTokens: 0, cacheWriteTokens: 0 })).toBe(0);
  });
});

describe("reading a campaign's cost back", () => {
  const rows = [
    { model: "claude-opus-5", input_tokens: 2_000, output_tokens: 3_000, cache_read_tokens: 18_000, cache_write_tokens: 0, cost_usd: "0.094" },
    { model: "claude-sonnet-5", input_tokens: 1_000, output_tokens: 2_000, cache_read_tokens: 19_000, cache_write_tokens: 0, cost_usd: 0.0258 },
    { model: "claude-sonnet-5", input_tokens: 1_000, output_tokens: 1_000, cache_read_tokens: 19_000, cache_write_tokens: 0, cost_usd: 0.0158 },
  ];

  it("adds up the calls that actually billed", () => {
    const cost = summarise(rows);
    expect(cost.calls).toBe(3);
    expect(cost.usd).toBeCloseTo(0.1356, 4);
    expect(cost.tokens.cacheReadTokens).toBe(56_000);
  });

  it("says what the same calls would have cost with nothing cached", () => {
    // Paired on purpose: the amount spent means nothing alone, because a smaller bill and a
    // quieter month look the same. If this difference ever collapses, caching silently broke.
    const cost = summarise(rows);
    expect(cost.wouldHaveCostUsd).toBeGreaterThan(cost.usd);
  });

  it("shows which model answered how often, dearest first", () => {
    const cost = summarise(rows);
    expect(cost.byModel[0]?.model).toBe("claude-opus-5");
    expect(cost.byModel[1]).toMatchObject({ model: "claude-sonnet-5", calls: 2 });
  });

  it("ignores runs that cost nothing", () => {
    // A deterministic or local run is a run, not a line on a bill.
    const cost = summarise([{ model: "qwen2.5:3b", input_tokens: 900, output_tokens: 400, cache_read_tokens: 0, cache_write_tokens: 0, cost_usd: 0 }]);
    expect(cost.calls).toBe(0);
    expect(cost.usd).toBe(0);
  });
});
