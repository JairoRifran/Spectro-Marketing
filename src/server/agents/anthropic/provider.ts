import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import type { AgentContext, AgentProvider, AgentResult } from "../contracts";
import { MockProvider } from "../mock-provider";
import { nextCampaignTasks } from "@/server/campaigns/chain";
import { DomainError } from "@/server/errors";
import { BRIEFS, type Brief } from "../briefs";
import { askable, cacheableContext, pinIdentity, summarise } from "../shaping";
import { costUsd, type TokenUsage } from "../pricing";

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
 * Which Claude answers which stage.
 *
 * Every stage ran on the most expensive model available, and most of them are not doing the kind
 * of work that pays for. Assembling a brief out of four upstream steps, scoring channels against
 * stated criteria, distributing pillars by weight -- these restructure material that is already
 * in the prompt. Sonnet 5 does that, at two fifths the input price and two fifths the output.
 *
 * Two stages keep Opus. The strategy draft is where the positioning is actually argued and the
 * copy is the text a customer reads: those are the product, and making them cheaper is not a
 * saving. This is the same line the local-model policy draws, for the same reason, and it is
 * overridable the same way.
 *
 * Sonnet 5 was chosen over the cheaper Haiku 4.5 deliberately: Haiku predates the 4.6 API and
 * rejects both adaptive thinking and `output_config.effort`, so it is not a swap but a second
 * request shape to maintain and test. Half the saving for none of the risk.
 */
export const STANDARD_MODEL = "claude-sonnet-5";
const PREMIUM_TASKS = ["campaign.strategy.draft", "content.copy"];

export function premiumTasks(env: Record<string, string | undefined> = process.env): string[] {
  const override = env.AI_PREMIUM_TASKS?.trim();
  if (override === undefined) return [...PREMIUM_TASKS];
  return override.split(",").map((item) => item.trim()).filter(Boolean);
}

export function modelFor(taskType: string, env: Record<string, string | undefined> = process.env): string {
  return premiumTasks(env).includes(taskType) ? MODEL : STANDARD_MODEL;
}

/**
 * How long one call may take.
 *
 * Shorter than the invocation that wraps it, on purpose. A call left running past the platform's
 * limit is killed together with the function, which loses the answer *and* leaves the task marked
 * running under a lease nobody releases. Failing first turns that into a retryable error the
 * runtime already knows what to do with.
 *
 * It was briefly cut to forty on the theory that the bookkeeping after a failure needed more
 * room, because a timeout had written the task's error row and not its activity entry. The data
 * refuted that: the error row was written fine at fifty, and the activity entry is still missing
 * at forty. The audit gap is a different bug with a different cause, and the ten seconds bought
 * nothing while making the stage that was already too slow slower to fit.
 */
const CALL_TIMEOUT_MS = 50_000;

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

    const model = modelFor(context.task.type);
    const { parsed, usage } = await this.ask(brief, context, model);
    const output: Record<string, unknown> = {
      ...parsed,
      provider: this.name,
      model,
      promptVersion: brief.promptVersion,
    };

    if (context.task.type === "content.copy") pinIdentity(output, context);

    return {
      summary: summarise(context, brief, model),
      output,
      usage: { ...usage, model, costUsd: costUsd(model, usage) },
      // The chain is the same table the deterministic provider reads, so a campaign advances
      // identically whoever answered — and carries this step's output to the next one.
      delegatedTasks: nextCampaignTasks(context.task.type, context.task.input, context.task.id, output),
    };
  }

  private async ask(brief: Brief, context: AgentContext, model: string) {
    // The whole body is guarded, not just the call.
    //
    // Only the request used to be wrapped, and the validation is not in the request: the API
    // drops the constraints it does not support -- maxLength, maxItems, minimum -- into
    // descriptions, so a list of twenty-five items or a six-hundred character string comes back
    // accepted, and the SDK rejects it here against the same Zod schema. That threw a bare
    // ZodError past the catch, which the boundary flattened into "internal_error", non-retryable,
    // naming nothing. The stage was lost to a sentence that fits every failure.
    try {
      const schema = askable(brief.schemaFor?.(context.task) ?? brief.schema);
      // The brand, the products, the personas and the knowledge base are identical across every
      // stage of a campaign and were re-sent at full price on each of them, plus once per retry.
      // Split off and marked here, that block plus the system prompt above it becomes a cached
      // prefix: written once at a small premium, then read back at about a tenth of the price.
      const { stable, volatile } = cacheableContext(context);
      // Streamed rather than awaited whole: a high-effort answer against a schema this size is
      // long enough to trip a request timeout, and a timeout here costs the stage.
      const message = await anthropic().messages.stream({
        model,
        max_tokens: MAX_TOKENS[context.task.type] ?? DEFAULT_MAX_TOKENS,
        // Adaptive lets the model spend thought where the task is genuinely hard — a channel
        // strategy is not a campaign draft — instead of a fixed budget paid on every call.
        thinking: { type: "adaptive" },
        output_config: { effort: brief.effort, format: zodOutputFormat(schema) },
        system: brief.system,
        messages: [{
          role: "user",
          content: [
            // Caching is a prefix match, so the breakpoint goes at the end of the stable half and
            // everything before it — the system prompt included — is cached along with it.
            { type: "text", text: stable, cache_control: { type: "ephemeral" } },
            { type: "text", text: [volatile, "", brief.instruction].join("\n") },
          ],
        }],
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
      const usage: TokenUsage = {
        inputTokens: message.usage.input_tokens ?? 0,
        outputTokens: message.usage.output_tokens ?? 0,
        cacheReadTokens: message.usage.cache_read_input_tokens ?? 0,
        cacheWriteTokens: message.usage.cache_creation_input_tokens ?? 0,
      };
      return { parsed: parsed as Record<string, unknown>, usage };
    } catch (error) {
      translate(error);
    }
  }
}
