import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { ZodObject, ZodRawShape } from "zod";
import type { AgentContext, AgentProvider, AgentResult } from "../contracts";
import { MockProvider } from "../mock-provider";
import { nextCampaignTasks } from "@/server/campaigns/chain";
import { DomainError } from "@/server/errors";
import { BRIEFS, type Brief } from "./briefs";

// The provider that actually asks a model.
//
// The shape of every answer is the Zod schema that already validated the deterministic output,
// handed to the API as `output_config.format`. Reusing it rather than writing a second schema by
// hand is the whole point: there is one definition of what a valid campaign draft is, so the
// model cannot satisfy the API and fail persistence.
//
// Three fields are never asked for. `provider`, `model` and `promptVersion` are facts about how
// the answer was produced, and a model asked to describe its own provenance can only guess. They
// are stripped from the schema and stamped here from what actually happened.
//
// A task type with no brief is delegated to the deterministic provider rather than improvised.
// `content.plan` is the deliberate case: distributing pillars across channels by weight is
// arithmetic, and the planner already does it correctly and identically every time. There is
// nothing for a model to add and a real chance for it to drift.

export const MODEL = "claude-opus-5";

/**
 * How long one call may take.
 *
 * Shorter than the invocation that wraps it, on purpose. A call left running past the platform's
 * limit is killed together with the function, which loses the answer *and* leaves the task marked
 * running under a lease nobody releases. Failing first turns that into a retryable error the
 * runtime already knows what to do with.
 *
 * The gap has to cover what happens after the failure, not just the failure. The first timeout in
 * production wrote the task's error row and then vanished before writing its activity entry: ten
 * seconds was enough to fail and not enough to finish saying so. A retry nobody can see in the
 * audit trail is the same as no audit trail on the one occasion it matters.
 */
const CALL_TIMEOUT_MS = 40_000;

/**
 * How much the model may generate, per task.
 *
 * This is the lever that actually governs wall-clock time, and it was a single flat 16,000 for
 * every call. Adaptive thinking spends from the same budget, so a stage with nothing much to say
 * could still think its way to the deadline: research kept timing out not because its answer is
 * long -- a dozen short lists -- but because nothing told it to stop.
 *
 * The numbers are sized to the schema behind each one, with room to spare. Too small is not free
 * either: the answer stops mid-structure and comes back as a truncation, which is a clean failure
 * but still a failure.
 */
const MAX_TOKENS: Record<string, number> = {
  "campaign.strategy.draft": 10_000,
  "campaign.research": 6_000,
  "campaign.channel_strategy": 8_000,
  "campaign.content_plan": 8_000,
  "campaign.strategy.finalize": 4_000,
  // The largest schema by far: a full native variant, with its slides or its script.
  "content.copy": 16_000,
  "content.creative_review": 8_000,
};
const DEFAULT_MAX_TOKENS = 8_000;

/** Provenance is stamped, never asked for — a model can only guess at its own. */
export const STAMPED = ["provider", "model", "promptVersion"] as const;

/** The schema the model is held to: the persisted one minus the fields it must not author. */
export function askable(schema: Brief["schema"]) {
  // Every brief schema is a plain object; the cast keeps `omit` reachable without widening the
  // public `Brief` type into something a caller could pass a union to.
  const object = schema as unknown as ZodObject<ZodRawShape>;
  return object.omit(Object.fromEntries(STAMPED.map((key) => [key, true as const])));
}

let client: Anthropic | null = null;
function anthropic(): Anthropic {
  const key = process.env.ANTHROPIC_API_KEY?.trim();
  if (!key) {
    throw new DomainError(
      "provider",
      "Falta ANTHROPIC_API_KEY. Cargala como variable de entorno del servidor y volvé a desplegar.",
      "anthropic_key_missing",
      false,
    );
  }
  // Reused across invocations so a warm function keeps its connection pool.
  if (!client) client = new Anthropic({ apiKey: key, maxRetries: 2 });
  return client;
}

/**
 * What the agent is told about this task.
 *
 * The input is sent as JSON because it already is structured — brand, products, personas,
 * knowledge titles, and the upstream steps' own output. Flattening it into prose would lose the
 * nesting that says which pain belongs to which audience.
 */
function contextFor(context: AgentContext): string {
  const input = { ...context.task.input };
  // An internal identifier is noise in a brief: it says nothing about the campaign.
  delete input.sourceTaskId;
  const body = JSON.stringify(input, null, 1);
  // A campaign carrying an unusually large brief is truncated rather than rejected: a slightly
  // shorter context still produces a usable answer, while a 413 produces nothing.
  const trimmed = body.length > 120_000 ? `${body.slice(0, 120_000)}\n… (contexto recortado)` : body;
  return [`Contexto de la tarea "${context.task.title}":`, "", "```json", trimmed, "```"].join("\n");
}

/** Vendor failures split into retry and do-not-retry, because they are different next steps. */
function translate(error: unknown): never {
  if (error instanceof DomainError) throw error;

  if (error instanceof Anthropic.RateLimitError) {
    throw new DomainError("retryable", "Anthropic limitó la tasa de pedidos. Se reintenta.", "anthropic_rate_limited", true);
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    // Our own deadline, not the vendor's failure. Worth another attempt: the next one may land
    // on a shorter answer, and the alternative is losing the stage to a silent kill.
    throw new DomainError("retryable", "La respuesta de Anthropic tardó más de lo permitido. Se reintenta.", "anthropic_timeout", true);
  }
  if (error instanceof Anthropic.APIConnectionError) {
    throw new DomainError("retryable", "No pudimos conectarnos con Anthropic.", "anthropic_unreachable", true);
  }
  if (error instanceof Anthropic.AuthenticationError || error instanceof Anthropic.PermissionDeniedError) {
    // Retrying a rejected key burns attempts to reach the same answer.
    throw new DomainError("provider", "Anthropic rechazó la credencial. Revisá ANTHROPIC_API_KEY.", "anthropic_unauthorized", false);
  }
  if (error instanceof Anthropic.APIError) {
    const retryable = typeof error.status === "number" && error.status >= 500;
    throw new DomainError("provider", `Anthropic respondió ${error.status ?? "sin estado"}: ${error.message}`, "anthropic_failed", retryable);
  }
  // Named, because the ones that land here are the ones nobody predicted. A ZodError that says
  // only "failed" costs a deploy to identify; one that says which field was too long costs none.
  const detail = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
  throw new DomainError("provider", `La respuesta del modelo no pudo procesarse. ${detail}`.slice(0, 900), "anthropic_output_rejected", true);
}

export class AnthropicProvider implements AgentProvider {
  readonly name = "anthropic";
  /** Task types without a brief keep the deterministic behaviour they already had. */
  private readonly fallback = new MockProvider();

  async run(context: AgentContext): Promise<AgentResult> {
    const brief = BRIEFS[context.task.type];
    if (!brief) return this.fallback.run(context);

    const parsed = await this.ask(brief, context);
    const output: Record<string, unknown> = {
      ...parsed,
      provider: this.name,
      model: MODEL,
      promptVersion: brief.promptVersion,
    };

    if (context.task.type === "content.copy") pinIdentity(output, context);

    return {
      summary: summarise(context, brief),
      output,
      // The chain is the same table the deterministic provider reads, so a campaign advances
      // identically whoever answered — and carries this step's output to the next one.
      delegatedTasks: nextCampaignTasks(context.task.type, context.task.input, context.task.id, output),
    };
  }

  private async ask(brief: Brief, context: AgentContext) {
    // The whole body is guarded, not just the call.
    //
    // Only the request used to be wrapped, and the validation is not in the request: the API
    // drops the constraints it does not support -- maxLength, maxItems, minimum -- into
    // descriptions, so a list of twenty-five items or a six-hundred character string comes back
    // accepted, and the SDK rejects it here against the same Zod schema. That threw a bare
    // ZodError past the catch, which the boundary flattened into "internal_error", non-retryable,
    // naming nothing. The stage was lost to a sentence that fits every failure.
    try {
      const schema = askable(brief.schema);
      // Streamed rather than awaited whole: a high-effort answer against a schema this size is
      // long enough to trip a request timeout, and a timeout here costs the stage.
      const message = await anthropic().messages.stream({
        model: MODEL,
        max_tokens: MAX_TOKENS[context.task.type] ?? DEFAULT_MAX_TOKENS,
        // Adaptive lets the model spend thought where the task is genuinely hard — a channel
        // strategy is not a campaign draft — instead of a fixed budget paid on every call.
        thinking: { type: "adaptive" },
        output_config: { effort: brief.effort, format: zodOutputFormat(schema) },
        system: brief.system,
        messages: [{ role: "user", content: [contextFor(context), "", brief.instruction].join("\n") }],
      }, {
        timeout: CALL_TIMEOUT_MS,
        // The timeout alone did not bound this. A stream that keeps emitting events is a request
        // still making progress, so the deadline never fired and the platform killed the whole
        // function instead — which writes no error, leaves the task marked running, and is how a
        // campaign got stuck with nothing in its activity log to say why. An abort signal is
        // wall-clock and does not care whether bytes are still arriving.
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
      }).finalMessage();

      if (message.stop_reason === "refusal") {
        throw new DomainError("provider", "El modelo se negó a responder esta tarea.", "anthropic_refused", false);
      }
      if (message.stop_reason === "max_tokens") {
        // The answer is cut mid-structure, so it would fail parsing anyway; saying why is better
        // than reporting a schema error that points nowhere.
        throw new DomainError("provider", "La respuesta se cortó por longitud antes de completarse.", "anthropic_truncated", true);
      }
      // Reading this is what runs the client-side validation, so it belongs inside the guard.
      const parsed = message.parsed_output;
      if (!parsed) {
        throw new DomainError("validation", "El modelo devolvió una respuesta que no cumple el esquema.", "anthropic_output_invalid", true);
      }
      return parsed as Record<string, unknown>;
    } catch (error) {
      translate(error);
    }
  }
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

/** One line for the activity trail. A summary, never the reasoning that produced it. */
function summarise(context: AgentContext, brief: Brief): string {
  const who = context.agent.displayName || brief.role;
  return `${who} completó ${context.task.title} con ${MODEL}.`;
}
