import type { ZodObject, ZodRawShape } from "zod";
import type { AgentContext } from "./contracts";
import type { Brief } from "./briefs";

// What every provider does identically, kept in one place.
//
// Asking a model for a campaign draft is the same job whoever answers it: strip the fields the
// model must not author, hand it the task context, pin the facts that were decided upstream. Only
// the transport differs. These lived inside the Anthropic provider while it was the only one, and
// leaving them there would have meant a second provider importing from `anthropic/` — a directory
// name that would then be a lie about where the shared rules live.

/** Provenance is stamped, never asked for — a model can only guess at its own. */
export const STAMPED = ["provider", "model", "promptVersion"] as const;

/** The schema the model is held to: the persisted one minus the fields it must not author. */
export function askable(schema: Brief["schema"]) {
  // Every brief schema is a plain object; the cast keeps `omit` reachable without widening the
  // public `Brief` type into something a caller could pass a union to.
  const object = schema as unknown as ZodObject<ZodRawShape>;
  return object.omit(Object.fromEntries(STAMPED.map((key) => [key, true as const])));
}

/**
 * What the agent is told about this task.
 *
 * The input is sent as JSON because it already is structured — full brand, product, persona and
 * knowledge context, plus the upstream steps' own output. Flattening it into prose would lose the
 * nesting that says which pain belongs to which audience.
 */
export function contextFor(context: AgentContext): string {
  const input = { ...context.task.input };
  // An internal identifier is noise in a brief: it says nothing about the campaign.
  delete input.sourceTaskId;
  const body = JSON.stringify(input, null, 1);
  // A campaign carrying an unusually large brief is truncated rather than rejected: a slightly
  // shorter context still produces a usable answer, while a 413 produces nothing.
  const trimmed = body.length > 120_000 ? `${body.slice(0, 120_000)}\n… (contexto recortado)` : body;
  return [`Contexto de la tarea "${context.task.title}":`, "", "```json", trimmed, "```"].join("\n");
}

/**
 * The part of a task's context that does not change between the stages of one campaign.
 *
 * Every stage of a campaign is handed the same brand, the same products, the same personas and
 * the same knowledge base, and until now all of it was re-sent at full price five times over —
 * plus once more for every retry. Split off, that block becomes a cacheable prefix.
 *
 * The list is an allowlist and not an exclusion, which is the conservative direction. A key
 * nobody thought about lands in the volatile half: it costs a cache hit, never a wrong answer.
 * The reverse mistake — a per-piece value sitting inside the cached prefix — would mean the
 * prefix differs on every call, so it never hits *and* pays the write premium each time.
 */
const STABLE_KEYS = new Set([
  "allowedPlatforms", "audienceHint", "brandContext", "brandName", "brandTone", "campaignId",
  "campaignName", "constraints", "forbiddenClaims", "forbiddenWords", "knowledgeItems",
  "knowledgeTitles", "metric", "objectiveDescription", "objectiveTitle", "personaNames",
  "personas", "productNames", "products", "strategyVersion", "target",
]);

/** Keys sorted, because caching is a byte-for-byte prefix match and object order is not a promise. */
function stableJson(input: Record<string, unknown>): string {
  return JSON.stringify(input, Object.keys(input).sort(), 1);
}

/**
 * The task context, split into what can be cached and what cannot.
 *
 * Returns the stable half first so it can carry the cache breakpoint: the API caches everything
 * before that point, which means the system prompt comes along for free.
 */
export function cacheableContext(context: AgentContext): { stable: string; volatile: string } {
  const stable: Record<string, unknown> = {};
  const volatile: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(context.task.input)) {
    // An internal identifier is noise in a brief: it says nothing about the campaign.
    if (key === "sourceTaskId") continue;
    (STABLE_KEYS.has(key) ? stable : volatile)[key] = value;
  }

  const rest = stableJson(volatile);
  return {
    stable: [`Contexto de la organización y la campaña:`, "", "```json", stableJson(stable), "```"].join("\n"),
    volatile: [
      `Tarea "${context.task.title}":`,
      "",
      "```json",
      // A campaign carrying an unusually large brief is truncated rather than rejected: a
      // slightly shorter context still produces a usable answer, while a 413 produces nothing.
      rest.length > 120_000 ? `${rest.slice(0, 120_000)}\n… (contexto recortado)` : rest,
      "```",
    ].join("\n"),
  };
}

/**
 * The piece's identity is a fact of the task, not a choice.
 *
 * Which platform and format this variant is for was decided by the plan. Letting the answer
 * carry its own is how a request for a story came back as a carousel, twice — once on LinkedIn
 * and once on Instagram — and each time the mismatch only surfaced downstream, in a renderer
 * that had been handed a shape it could not draw.
 */
export function pinIdentity(output: Record<string, unknown>, context: AgentContext) {
  const variant = output.variant as Record<string, unknown> | undefined;
  if (!variant) return;
  const input = context.task.input as { conceptId?: string; concept?: { conceptId?: string; format?: string; platforms?: string[] }; brief?: { platform?: string; format?: string } };
  const platform = input.brief?.platform;
  const format = input.brief?.format ?? input.concept?.format;
  const conceptId = input.conceptId ?? input.concept?.conceptId;
  if (platform) variant.platform = platform;
  if (format) variant.format = format;
  if (conceptId) variant.conceptId = conceptId;
  variant.generatedBy = "provider";
}

/**
 * One line for the activity trail. A summary, never the reasoning that produced it.
 *
 * The model is named because it is now a real question which one answered: a campaign whose
 * research came from a local model and whose positioning came from Opus is a normal campaign
 * here, and the trail is where a person finds out which is which.
 */
export function summarise(context: AgentContext, brief: Brief, model: string): string {
  const who = context.agent.displayName || brief.role;
  return `${who} completó ${context.task.title} con ${model}.`;
}
