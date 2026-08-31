import type { AgentProvider } from "./contracts";
import { MockProvider } from "./mock-provider";
import { AnthropicProvider } from "./anthropic/provider";
import { OllamaProvider } from "./ollama/provider";
import { DomainError } from "@/server/errors";

// Which provider answers.
//
// The default stays deterministic. A missing or misspelt AI_PROVIDER has to produce the safe
// behaviour, not a paid call nobody asked for — the same default-deny posture the spend ceiling
// takes, for the same reason.
//
// `hybrid` exists because "cheaper" and "the same quality" are only compatible if you stop
// treating every stage as the same kind of work. Most of them are not judgement: research
// restructures a knowledge base that is already in the prompt, the content plan distributes
// pillars by weight, the final brief assembles what four earlier steps decided. A small local
// model does that acceptably and for nothing.
//
// Three stages are not like that. The strategy draft is where the positioning is actually argued
// and the copy is the text a customer reads: those are the product. Research is here for a
// different and worse reason. Asked about a market it has no knowledge of, a small model does not
// decline — it invents. A three-billion-parameter model given this project's own "do not invent
// figures" rule answered with a market size, a percentage, and two named institutions, one of
// which does not exist in this country. Fabricated numbers wearing a source are the single
// failure this whole product is built to prevent, and research is where the temptation peaks.
//
// The split is a default, not a law — AI_JUDGEMENT_TASKS overrides it — but it is written down
// here rather than left to whoever last edited an environment variable.

/** Only string keys are ever read, so a plain record is the honest parameter type. */
type Env = Record<string, string | undefined>;

/** Stages where the answer is judgement rather than restructuring. */
export const JUDGEMENT_TASKS = ["campaign.strategy.draft", "campaign.research", "content.copy"] as const;

export function configuredAgentProviderName() {
  return process.env.AI_PROVIDER?.trim() || "mock";
}

/** The escalation list, overridable per deployment. An empty override means "escalate nothing". */
export function judgementTasks(env: Env = process.env): string[] {
  const override = env.AI_JUDGEMENT_TASKS?.trim();
  if (override === undefined) return [...JUDGEMENT_TASKS];
  return override.split(",").map((item) => item.trim()).filter(Boolean);
}

/** Which provider a particular task goes to. Only `hybrid` makes this depend on the task. */
export function providerNameForTask(taskType: string, name = configuredAgentProviderName(), env: Env = process.env): string {
  if (name !== "hybrid") return name;
  return judgementTasks(env).includes(taskType) ? "anthropic" : "ollama";
}

export function getAgentProvider(name = configuredAgentProviderName()): AgentProvider {
  if (name === "mock") return new MockProvider();
  if (name === "anthropic") return new AnthropicProvider();
  if (name === "ollama") return new OllamaProvider();
  // Reached only by asking for the policy without saying which task, which is a caller bug and
  // not a configuration problem: `hybrid` has no answer until there is a task type to route.
  if (name === "hybrid") {
    throw new DomainError("provider", "El modo hybrid necesita el tipo de tarea para elegir proveedor.", "provider_needs_task", false);
  }
  throw new DomainError("provider", `El proveedor ${name} no está configurado.`, "provider_not_configured", false);
}

/** What the dispatcher calls: the provider for this task, under whatever policy is configured. */
export function providerForTask(taskType: string): AgentProvider {
  return getAgentProvider(providerNameForTask(taskType));
}
