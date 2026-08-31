import { readFileSync } from "node:fs";
import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { AnthropicProvider, MODEL } from "@/server/agents/anthropic/provider";
import { STAMPED, askable, pinIdentity } from "@/server/agents/shaping";
import { BRIEFS } from "@/server/agents/briefs";
import { MockProvider } from "@/server/agents/mock-provider";
import { getAgentProvider } from "@/server/agents/provider";
import { nextCampaignTasks } from "@/server/campaigns/chain";
import { DomainError } from "@/server/errors";
import type { AgentContext } from "@/server/agents/contracts";
import type { RuntimeTask } from "@/server/tasks/types";

const task = (type: string, input: Record<string, unknown> = {}): RuntimeTask => ({
  id: "t1", organization_id: "o1", title: "Tarea", description: null, type, status: "running",
  priority: "medium", assigned_agent_id: "a1", objective_id: null, parent_task_id: null,
  source_event_id: null, requires_approval: false, risk_level: "low",
  attempt_count: 1, max_attempts: 3, input, idempotency_key: null, campaign_id: "c1",
});

const contextFor = (type: string, input: Record<string, unknown> = {}): AgentContext => ({
  organizationId: "o1",
  agent: { id: "a1", role: "cmo", displayName: "Sofía", autonomyLevel: 1, configuration: {} },
  task: task(type, input),
  correlationId: "corr-1",
});

describe("what each agent is asked", () => {
  it("covers every step the campaign chain can reach", () => {
    // A step without a brief silently falls back to the deterministic provider. That is the
    // right behaviour for a step nobody wrote a prompt for, and the wrong one for a step that
    // was meant to have one — so the chain and the briefs are checked against each other.
    let step = "campaign.strategy.draft";
    const reached = [step];
    while (true) {
      const next = nextCampaignTasks(step, {}, "t1");
      if (!next.length) break;
      step = next[0]!.type;
      reached.push(step);
    }
    expect(reached).toEqual([
      "campaign.strategy.draft", "campaign.research", "campaign.channel_strategy",
      "campaign.content_plan", "campaign.strategy.finalize",
    ]);
    for (const type of reached) expect(BRIEFS[type], type).toBeDefined();
  });

  it("leaves the deterministic planner alone", () => {
    // Distributing pillars across channels by weight is arithmetic. The planner already does it
    // identically every time; a model could only drift.
    expect(BRIEFS["content.plan"]).toBeUndefined();
  });

  it("tells every agent not to invent numbers", () => {
    // The cheapest way for any of these to produce something unpublishable is a made-up metric,
    // so the rule is asserted per brief rather than trusted to a shared constant staying shared.
    for (const [type, brief] of Object.entries(BRIEFS)) {
      expect(brief.system, type).toContain("No inventes datos");
      expect(brief.system, type).toMatch(/no reporta métricas de rendimiento/i);
    }
  });

  it("asks for a decision, not a reasoning trace", () => {
    for (const [type, brief] of Object.entries(BRIEFS)) {
      expect(brief.system, type).toContain("No son un registro de tu razonamiento");
    }
  });
});

describe("the schema the model is held to", () => {
  it("never asks a model to state its own provenance", () => {
    for (const [type, brief] of Object.entries(BRIEFS)) {
      const before = Object.keys((brief.schema as unknown as { shape: Record<string, unknown> }).shape);
      const after = Object.keys((askable(brief.schema) as unknown as { shape: Record<string, unknown> }).shape);
      for (const field of STAMPED) {
        expect(before, `${type} debería persistir ${field}`).toContain(field);
        expect(after, `${type} no debería pedir ${field}`).not.toContain(field);
      }
    }
  });

  it("converts to a schema the API will accept", () => {
    for (const [type, brief] of Object.entries(BRIEFS)) {
      const format = zodOutputFormat(askable(brief.schema)) as unknown as Record<string, unknown>;
      const json = JSON.stringify(format);
      expect(format.type, type).toBe("json_schema");
      // Structured outputs reject any object that would allow unlisted keys.
      expect(json.match(/"additionalProperties":(?!false)/), type).toBeNull();
    }
  });
});

describe("choosing a provider", () => {
  const previous = process.env.AI_PROVIDER;
  afterEach(() => { process.env.AI_PROVIDER = previous; });

  it("stays deterministic by default", () => {
    delete process.env.AI_PROVIDER;
    expect(getAgentProvider().name).toBe("mock");
  });

  it("selects Anthropic only when asked for by name", () => {
    expect(getAgentProvider("anthropic").name).toBe("anthropic");
    expect(() => getAgentProvider("openai")).toThrow(DomainError);
  });
});

describe("running without a key", () => {
  const previous = process.env.ANTHROPIC_API_KEY;
  beforeEach(() => { delete process.env.ANTHROPIC_API_KEY; });
  afterEach(() => { if (previous === undefined) delete process.env.ANTHROPIC_API_KEY; else process.env.ANTHROPIC_API_KEY = previous; });

  it("says what is missing instead of failing at the vendor", async () => {
    await expect(new AnthropicProvider().run(contextFor("campaign.strategy.draft")))
      .rejects.toMatchObject({ code: "anthropic_key_missing", retryable: false });
  });

  it("still answers the task types that never needed one", async () => {
    // content.plan is deterministic, so selecting the Anthropic provider must not break a
    // deployment that has not configured a key yet.
    const input = { campaignId: "c1", strategyVersion: 1 };
    const result = await new AnthropicProvider().run(contextFor("cmo.daily_review", input));
    expect(result.output.provider).toBe("mock");
  });
});

describe("the piece's identity is a fact of the task", () => {
  // A request for one platform coming back as another is the bug that shipped twice: LinkedIn
  // answering with a format it cannot produce, then Instagram answering a story with a carousel.
  // Both surfaced downstream, in a renderer handed a shape it could not draw.
  const input = {
    conceptId: "C-real",
    brief: { platform: "instagram", format: "story" },
    concept: { conceptId: "C-real", format: "story" },
  };

  it("overrides a platform the model chose for itself", () => {
    const output: Record<string, unknown> = { variant: { platform: "linkedin", format: "carousel", conceptId: "C-invented" } };
    pinIdentity(output, contextFor("content.copy", input));
    expect(output.variant).toMatchObject({ platform: "instagram", format: "story", conceptId: "C-real" });
  });

  it("marks the piece as model-written, never mock", () => {
    const output: Record<string, unknown> = { variant: { generatedBy: "mock" } };
    pinIdentity(output, contextFor("content.copy", input));
    expect((output.variant as { generatedBy: string }).generatedBy).toBe("provider");
  });

  it("does nothing when there is no variant to correct", () => {
    const output: Record<string, unknown> = {};
    expect(() => pinIdentity(output, contextFor("content.copy", input))).not.toThrow();
  });
});

describe("provenance", () => {
  it("names a model the API actually serves", () => {
    expect(MODEL).toBe("claude-opus-5");
  });

  it("keeps the deterministic provider distinguishable", () => {
    expect(new MockProvider().name).toBe("mock");
    expect(new AnthropicProvider().name).toBe("anthropic");
  });
});

describe("what governs how long a call takes", () => {
  const source = readFileSync(new URL("../../../src/server/agents/anthropic/provider.ts", import.meta.url), "utf8");

  it("sizes the token budget per task instead of one number for all", () => {
    // A flat 16,000 was the real cause of the timeouts: adaptive thinking spends from the same
    // budget, so a stage with a dozen short lists to write could still think to the deadline.
    expect(source).toContain("const MAX_TOKENS: Record<string, number>");
    expect(source).toContain("MAX_TOKENS[context.task.type] ?? DEFAULT_MAX_TOKENS");
  });

  it("gives every brief a budget", () => {
    const block = source.slice(source.indexOf("const MAX_TOKENS"), source.indexOf("const DEFAULT_MAX_TOKENS"));
    for (const type of Object.keys(BRIEFS)) expect(block, type).toContain(`"${type}"`);
  });

  it("leaves the writer the most room and the closer the least", () => {
    const block = source.slice(source.indexOf("const MAX_TOKENS"), source.indexOf("const DEFAULT_MAX_TOKENS"));
    const budgets = new Map<string, number>();
    for (const [, type, value] of block.matchAll(/"([\w.]+)":\s*([\d_]+)/g)) {
      budgets.set(type, Number(value.replace(/_/g, "")));
    }
    expect(budgets.get("content.copy")!).toBeGreaterThan(budgets.get("campaign.research")!);
    expect(budgets.get("campaign.strategy.finalize")!).toBeLessThan(budgets.get("campaign.strategy.draft")!);
  });
});

describe("nothing escapes untranslated", () => {
  const source = readFileSync(new URL("../../../src/server/agents/anthropic/provider.ts", import.meta.url), "utf8");

  it("guards the validation, not only the request", () => {
    // The API drops the constraints it cannot enforce into descriptions, so an over-long list
    // comes back accepted and is rejected here instead. That threw a bare ZodError past the
    // catch, which the boundary flattened into "internal_error", naming nothing.
    const body = source.slice(source.indexOf("private async ask"));
    const guard = body.indexOf("try {");
    expect(guard).toBeGreaterThan(-1);
    expect(body.indexOf("parsed_output")).toBeGreaterThan(guard);
    expect(body.indexOf("catch (error)")).toBeGreaterThan(body.indexOf("parsed_output"));
  });

  it("names an error it did not predict", () => {
    // One that says which field was too long costs no deploy to identify.
    expect(source).toContain("${error.name}: ${error.message}");
    expect(source).toContain("anthropic_output_rejected");
  });

  it("tells the model the limits are enforced after the fact", () => {
    const briefs = readFileSync(new URL("../../../src/server/agents/briefs.ts", import.meta.url), "utf8");
    expect(briefs).toMatch(/Respeta los limites que el esquema declara/);
  });
});

describe("the writer is asked for one shape, not five", () => {
  const source = readFileSync(new URL("../../../src/server/agents/content-schema.ts", import.meta.url), "utf8");

  it("takes the shape from the adapter that will render it", () => {
    // Not a mapping restated here: platform and format resolve to a shape through the same
    // adapter the rest of the system uses, and that resolution has been got wrong twice.
    expect(source).toContain("getAdapter(input.brief.platform).draft");
    expect(source).toContain("detail.shape");
  });

  it("does not ask the writer for facts the plan already decided", () => {
    // Which piece this is, and who generated it. The code writes them back.
    for (const field of ["conceptId", "platform", "format", "generatedBy", "metadata"]) {
      expect(source, field).toContain(`${field}: true`);
    }
  });

  it("covers every production shape the union can carry", () => {
    // A missing branch would throw at request time, on one platform only, in production.
    for (const shape of ["video", "carousel", "story", "text", "static"]) {
      expect(source, shape).toContain(`${shape}: z.object({ shape: z.literal("${shape}")`);
    }
  });
});
