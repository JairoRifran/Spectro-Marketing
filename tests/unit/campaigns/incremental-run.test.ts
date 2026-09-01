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
    expect(workflow).toContain("pendingCampaignWork");
    expect(workflow).toContain("nextAttemptAt");
    // The query itself lives in the shared helper, so both manual paths answer this the same way.
    expect(dispatcher).toMatch(/\.in\(\["queued", "running"\]\)|\.in\("status", \["queued", "running"\]\)/);
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

  it("does not name a stage it cannot know", () => {
    // It used to list the five and advance on every call, which counted its own requests rather
    // than finished work: a retry moved the label, and it announced the last stage while the
    // first agent was still on the draft. The rail reads the task rows and says it properly.
    expect(button).not.toContain("const STAGES");
    expect(button).toContain('retrying ? "Reintentando…" : "Trabajando…"');
  });
});

describe("the content factory runs a piece at a time too", () => {
  const contentWorkflow = read("../../../src/server/content-factory/workflow.ts");
  const contentRoute = read("../../../src/app/api/campaigns/[id]/content/route.ts");
  const contentButton = read("../../../src/components/content-actions.tsx");

  it("stops attempting the whole batch in one request", () => {
    // A plan step plus a copy and a review per piece is twenty-nine steps. That was invisible
    // while each returned in milliseconds and is twenty-five paid calls once a model answers,
    // most of them killed halfway through a function that stops at sixty seconds.
    expect(contentWorkflow).toContain("stepsPerCall");
    expect(contentWorkflow).toContain("budgetMs: BUDGET_MS");
    expect(contentWorkflow).not.toMatch(/maxSteps: 1 \+ MAX_PIECES_PER_RUN \* 2 \+ 4, leaseSeconds: 120/);
  });

  it("declares a duration at all", () => {
    // The route had none, so the platform's shortest default applied to the longest work.
    expect(contentRoute).toContain("maxDuration = 60");
  });

  it("continues a run instead of planning a second batch", () => {
    expect(contentWorkflow).toContain("resumeContentFactoryForCampaign");
    expect(contentRoute).toContain("resumeContentFactoryForCampaign");
  });

  it("waits for a piece that ran long rather than reporting a fault", () => {
    expect(contentButton).toContain("result.nextAttemptAt");
    expect(contentButton).toContain("MAX_CALLS");
    expect(contentButton).toContain("MAX_WAIT_MS");
  });
});

describe("the button says what it does, in the language of the app", () => {
  const contentButton = read("../../../src/components/content-actions.tsx");

  it("names the content action in Spanish like every other control", () => {
    // It read "Generate Content Plan" in an otherwise Spanish product, so someone told where to
    // find "Generar contenido" could not see it.
    expect(contentButton).toContain("Generar contenido");
    expect(contentButton).not.toContain("Generate Content Plan");
  });

  it("does not credit the whole production to the agent who only plans it", () => {
    // Bruno writes the plan; Clara writes the pieces and Emilia reviews them.
    expect(contentButton).not.toContain("Bruno está planificando");
  });
});

describe("a run that was started keeps going without being pressed again", () => {
  const page = read("../../../src/app/campaigns/[id]/page.tsx");
  const contentButton = read("../../../src/components/content-actions.tsx");
  const campaignButton = read("../../../src/components/campaign-run-button.tsx");

  it("picks the work back up on mount", () => {
    // The loop lives in the page, so a reload or a navigation abandoned a run halfway and left
    // tasks queued with nothing to drain them and no sign anything was wrong.
    for (const [name, source] of [["content", contentButton], ["campaign", campaignButton]] as const) {
      expect(source, name).toContain("auto");
      expect(source, name).toContain("started.current");
      expect(source, name).toContain("void run();");
    }
  });

  it("only ever continues work, never starts it", () => {
    // Resuming spends money on a run a person already authorised. Starting one would not be
    // theirs to authorise.
    expect(page).toContain("resumable?<CampaignRunButton");
    expect(page).toContain("resume auto");
    expect(page).toContain("contentPending");
  });

  it("offers the button that matches where the work actually is", () => {
    // A campaign with content queued still said "Continuar estrategia".
    expect(page).toMatch(/stage\.phase==="content"&&stage\.active>0/);
    expect(page).toContain("contentPending?<ContentGenerateButton");
  });
});

describe("a piece can be judged where it is seen", () => {
  const contentPage = read("../../../src/app/content/page.tsx");
  const compose = read("../../../src/server/media/compose.ts");

  it("offers the decision on the card that shows the piece", () => {
    // Seeing a piece as it will look and then leaving for another screen to say yes or no puts
    // the two halves of one judgement in two places, and this is the half carrying the evidence.
    expect(contentPage).toContain("<ContentActions");
    expect(contentPage).toContain('item.status === "waiting_approval"');
    expect(contentPage).toContain('canDecide={data.role !== "viewer"}');
  });

  it("composes something for a text post to carry", () => {
    // Its words are still the piece; this accompanies them. A wall of unbroken text is what a
    // feed scrolls past.
    expect(compose).toContain('detail.shape === "text"');
    expect(compose).toContain("Acompaña al post");
    expect(compose).not.toContain("A text post has no designed surface");
  });
});
