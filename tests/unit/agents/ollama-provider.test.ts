import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { OllamaProvider, ollamaSettings } from "@/server/agents/ollama/provider";
import { JUDGEMENT_TASKS, getAgentProvider, providerNameForTask } from "@/server/agents/provider";
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

const reply = (body: unknown, status: number) =>
  vi.fn(async () => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } }));

/** Ollama answers as newline-delimited events, so the fakes have to as well. */
const stream = (...events: unknown[]) =>
  vi.fn(async () => new Response(events.map((event) => `${JSON.stringify(event)}\n`).join(""), { status: 200 }));

const said = (text: string, doneReason = "stop") =>
  stream({ message: { content: text } }, { done: true, done_reason: doneReason });

describe("splitting the work between a local model and a paid one", () => {
  // "Cheaper without losing quality" is only possible if the stages stop being treated as the
  // same kind of work. Most of them restructure context that is already in the prompt. Two of
  // them are the product.
  it("sends the positioning, the research and the customer-facing copy to the paid model", () => {
    for (const type of JUDGEMENT_TASKS) {
      expect(providerNameForTask(type, "hybrid", {})).toBe("anthropic");
    }
  });

  it("keeps research on the paid model because a small one invents its sources", () => {
    // Measured, not assumed: asked about the Uruguayan SME market under this project's own "do
    // not invent figures" rule, a 3B model returned a market size and two named institutions,
    // one of which does not exist here.
    expect(providerNameForTask("campaign.research", "hybrid", {})).toBe("anthropic");
  });

  it("keeps the genuinely mechanical stages local", () => {
    for (const type of ["campaign.channel_strategy", "campaign.content_plan", "campaign.strategy.finalize"]) {
      expect(providerNameForTask(type, "hybrid", {}), type).toBe("ollama");
    }
  });

  it("routes nothing by task when the policy is a single provider", () => {
    expect(providerNameForTask("campaign.channel_strategy", "anthropic", {})).toBe("anthropic");
    expect(providerNameForTask("campaign.strategy.draft", "ollama", {})).toBe("ollama");
    expect(providerNameForTask("campaign.strategy.draft", "mock", {})).toBe("mock");
  });

  it("lets a deployment move the line, including all the way to nothing", () => {
    expect(providerNameForTask("campaign.channel_strategy", "hybrid", { AI_JUDGEMENT_TASKS: "campaign.channel_strategy" })).toBe("anthropic");
    expect(providerNameForTask("campaign.strategy.draft", "hybrid", { AI_JUDGEMENT_TASKS: "" })).toBe("ollama");
  });

  it("refuses to answer the policy without a task", () => {
    // A caller bug, not a misconfiguration: hybrid has no answer until there is a task to route.
    expect(() => getAgentProvider("hybrid")).toThrow(DomainError);
    expect(getAgentProvider("ollama").name).toBe("ollama");
  });
});

describe("where the local model is asked", () => {
  const keys = ["OLLAMA_URL", "OLLAMA_MODEL", "OLLAMA_NUM_CTX", "OLLAMA_TIMEOUT_MS"] as const;
  const previous = Object.fromEntries(keys.map((key) => [key, process.env[key]]));
  afterEach(() => {
    for (const key of keys) {
      if (previous[key] === undefined) delete process.env[key]; else process.env[key] = previous[key];
    }
    vi.unstubAllGlobals();
  });

  it("defaults to the local daemon and trims a trailing slash", () => {
    expect(ollamaSettings({}).url).toBe("http://127.0.0.1:11434");
    expect(ollamaSettings({ OLLAMA_URL: "http://box:11434/" }).url).toBe("http://box:11434");
  });

  it("ignores a non-numeric override rather than sending NaN", () => {
    expect(ollamaSettings({ OLLAMA_NUM_CTX: "grande" }).numCtx).toBe(16_384);
    expect(ollamaSettings({ OLLAMA_NUM_CTX: "8192" }).numCtx).toBe(8192);
  });

  it("always sends a context window", () => {
    // The trap this exists for: Ollama's default context is a few thousand tokens and it does
    // not complain when the prompt is longer -- it drops the front of it. A campaign that
    // quietly loses its brand block still returns confident, well-formed, worthless output.
    const source = readFileSync(new URL("../../../src/server/agents/ollama/provider.ts", import.meta.url), "utf8");
    expect(source).toContain("num_ctx: settings.numCtx");
    expect(source).toContain("stream: true");
  });
});

describe("when the local model fails", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("says so plainly when nothing is listening", async () => {
    // The message names the likely cause, because the symptom -- a refused connection -- is the
    // same whether Ollama is stopped or whether this is running on a server that was never going
    // to reach somebody's laptop.
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("fetch failed"); }));
    await expect(new OllamaProvider().run(contextFor("campaign.research"))).rejects.toMatchObject({ code: "ollama_unreachable", retryable: true });
  });

  it("does not call a five-minute answer a network failure", async () => {
    // What the first live run actually did: Node stops waiting for headers after five minutes,
    // so an unstreamed request against a model that was still working looked exactly like a
    // refused connection. The provider streams now, and the classification is pinned anyway.
    vi.stubGlobal("fetch", vi.fn(async () => {
      throw Object.assign(new TypeError("fetch failed"), { cause: { code: "UND_ERR_HEADERS_TIMEOUT" } });
    }));
    await expect(new OllamaProvider().run(contextFor("campaign.research"))).rejects.toMatchObject({ code: "ollama_timeout", retryable: true });
  });

  it("does not retry a model that was never pulled", async () => {
    vi.stubGlobal("fetch", reply({ error: "model not found" }, 404));
    await expect(new OllamaProvider().run(contextFor("campaign.research"))).rejects.toMatchObject({ code: "ollama_model_missing", retryable: false });
  });

  it("rejects output that satisfies the grammar but breaks the limits", async () => {
    // Ollama compiles the schema to a grammar that guarantees shape and not size: a maximum of
    // five items is not something a grammar counts. Zod is the second gate, and the reason a
    // small model cannot write past the database's constraints.
    vi.stubGlobal("fetch", said(JSON.stringify({ nada: true })));
    await expect(new OllamaProvider().run(contextFor("campaign.research"))).rejects.toMatchObject({ code: "ollama_output_rejected" });
  });

  it("names truncation instead of blaming the schema", async () => {
    vi.stubGlobal("fetch", said('{"partial":', "length"));
    await expect(new OllamaProvider().run(contextFor("campaign.research"))).rejects.toMatchObject({ code: "ollama_truncated", retryable: true });
  });

  it("reports invalid JSON as its own failure", async () => {
    vi.stubGlobal("fetch", said("lo siento, no puedo"));
    await expect(new OllamaProvider().run(contextFor("campaign.research"))).rejects.toMatchObject({ code: "ollama_output_invalid" });
  });

  it("leaves a step with no brief to the deterministic planner", async () => {
    // Same rule the paid provider follows: distributing pillars by weight is arithmetic.
    const called = vi.fn();
    vi.stubGlobal("fetch", called);
    // The planner needs a real plan as input and rejects this bare context, which is fine: what
    // is being checked is that the step never reached a model at all.
    await new OllamaProvider().run(contextFor("content.plan")).catch(() => null);
    expect(called).not.toHaveBeenCalled();
  });
});
