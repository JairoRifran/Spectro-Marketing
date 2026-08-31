import type { AgentContext, AgentProvider, AgentResult } from "../contracts";
import { MockProvider } from "../mock-provider";
import { nextCampaignTasks } from "@/server/campaigns/chain";
import { DomainError } from "@/server/errors";
import { BRIEFS, type Brief } from "../briefs";
import { askable, contextFor, pinIdentity, summarise } from "../shaping";
import { EMPTY_USAGE, type TokenUsage } from "../pricing";

// A model that runs on your own machine, and costs nothing to ask.
//
// Same briefs, same schemas, same chain as the paid provider — only the transport differs, which
// is the whole reason the briefs stopped living in `anthropic/`. What differs is what it is good
// for. Local inference on a machine without a discrete GPU is CPU inference: measured on this
// one, generation runs at about eleven tokens a second and reading the prompt at under forty, so
// a stage carrying a full brand and knowledge context spends minutes before it writes a word.
// That is fine for proving the chain advances and hopeless for a person waiting on a campaign.
//
// So this is the provider for development, for end-to-end tests, and for whichever stages a
// person decides are restructuring rather than judgement. It is not a drop-in replacement for the
// paid one, and the `hybrid` policy in ../provider.ts is where that line gets drawn.
//
// The schema is sent as JSON Schema and enforced twice, deliberately. Ollama compiles it to a
// grammar that guarantees the *shape* but not the limits: a maximum of five items or a hundred
// and sixty characters is not something a grammar counts. The answer is parsed against the same
// Zod schema afterwards, exactly as the paid provider does, so a small model that writes eleven
// pillars is caught here rather than in the database.

/** Only string keys are ever read, so a plain record is the honest parameter type. */
type Env = Record<string, string | undefined>;

export const DEFAULT_MODEL = "qwen2.5:3b";
export const DEFAULT_URL = "http://127.0.0.1:11434";

/**
 * How much of the prompt the model is allowed to see.
 *
 * Ollama's default context is a few thousand tokens and it does not complain when the prompt is
 * longer: it silently drops the front of it. A campaign context that quietly loses its brand
 * block still produces confident, well-formed, worthless output, which is the worst failure
 * shape there is. Larger costs memory and time on CPU, so it is a setting and not a constant.
 */
const DEFAULT_NUM_CTX = 16_384;

/** Generous, because this is the local machine and nothing else is waiting on the socket. */
const DEFAULT_TIMEOUT_MS = 600_000;

/**
 * Transport failures, told apart.
 *
 * Both clocks that can stop a local call look like the same thrown object, and both can fire in
 * two different places — waiting for the response, or halfway through reading it. The first live
 * run aborted during the read, which was outside the guard, so a ten-minute deadline surfaced as
 * a raw TimeoutError with no code and no retry decision attached to it.
 */
function classify(error: unknown, url: string): never {
  if (error instanceof DomainError) throw error;
  // Ours is the AbortSignal; Node's own are header and body deadlines, which arrive as an
  // UND_ERR_* code on the error's cause. Calling either one "unreachable" sends the reader off
  // to check a daemon that is running perfectly.
  const cause = (error as { cause?: { code?: string } } | null)?.cause?.code ?? "";
  if ((error instanceof Error && error.name === "TimeoutError") || cause.startsWith("UND_ERR_")) {
    throw new DomainError("retryable", `El modelo local tardó demasiado (${cause || "límite propio"}). Se reintenta.`, "ollama_timeout", true);
  }
  // The mistake this message exists for: a function running on Vercel cannot reach a model
  // running on somebody's laptop, and the symptom is an ordinary connection refusal that says
  // nothing at all about why.
  throw new DomainError(
    "provider",
    `No pudimos conectarnos con Ollama en ${url}. Si esto corre en un servidor, el modelo local de tu máquina no es alcanzable desde ahí.`,
    "ollama_unreachable",
    true,
  );
}

const num = (value: string | undefined, fallback: number) => {
  const parsed = Number(value?.trim());
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
};

export function ollamaSettings(env: Env = process.env) {
  return {
    url: (env.OLLAMA_URL?.trim() || DEFAULT_URL).replace(/\/+$/, ""),
    model: env.OLLAMA_MODEL?.trim() || DEFAULT_MODEL,
    numCtx: num(env.OLLAMA_NUM_CTX, DEFAULT_NUM_CTX),
    timeoutMs: num(env.OLLAMA_TIMEOUT_MS, DEFAULT_TIMEOUT_MS),
  };
}

interface StreamEvent {
  message?: { content?: string };
  done?: boolean;
  done_reason?: string;
  error?: string;
  prompt_eval_count?: number;
  eval_count?: number;
}

/**
 * Why this streams, which is not a preference.
 *
 * With `stream: false` Ollama sends no headers until the whole answer is written, and Node's HTTP
 * client gives up waiting for headers after five minutes. The first live run of a research stage
 * on this hardware died at 304 seconds against a model that was still working perfectly — and it
 * died looking exactly like a refused connection, which is the wrong thing to tell somebody. A
 * streamed response sends its headers immediately, so the only clock left is the one we set.
 */
async function collect(response: Response): Promise<{ content: string; doneReason: string; usage: TokenUsage }> {
  const reader = response.body?.getReader();
  if (!reader) throw new DomainError("provider", "Ollama devolvió una respuesta sin cuerpo.", "ollama_empty", true);

  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  let doneReason = "";
  // Counted even though it is free: "free" is a claim worth being able to check, and the token
  // numbers are what make a local run comparable to a paid one at all.
  let usage: TokenUsage = { ...EMPTY_USAGE };

  const consume = (line: string) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let event: StreamEvent;
    try {
      event = JSON.parse(trimmed) as StreamEvent;
    } catch {
      // One unreadable line in a stream is not worth losing a finished answer over.
      return;
    }
    if (event.error) throw new DomainError("provider", `Ollama falló: ${event.error}`.slice(0, 300), "ollama_failed", true);
    content += event.message?.content ?? "";
    if (event.done) {
      doneReason = event.done_reason ?? "stop";
      usage = { ...EMPTY_USAGE, inputTokens: event.prompt_eval_count ?? 0, outputTokens: event.eval_count ?? 0 };
    }
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let index = buffer.indexOf("\n");
    while (index >= 0) {
      consume(buffer.slice(0, index));
      buffer = buffer.slice(index + 1);
      index = buffer.indexOf("\n");
    }
  }
  consume(buffer);

  return { content: content.trim(), doneReason, usage };
}

export class OllamaProvider implements AgentProvider {
  readonly name = "ollama";
  /** Task types without a brief keep the deterministic behaviour they already had. */
  private readonly fallback = new MockProvider();

  async run(context: AgentContext): Promise<AgentResult> {
    const brief = BRIEFS[context.task.type];
    if (!brief) return this.fallback.run(context);

    const settings = ollamaSettings();
    const { parsed, usage } = await this.ask(brief, context, settings);
    const output: Record<string, unknown> = {
      ...parsed,
      provider: this.name,
      model: settings.model,
      promptVersion: brief.promptVersion,
    };

    if (context.task.type === "content.copy") pinIdentity(output, context);

    return {
      summary: summarise(context, brief, settings.model),
      output,
      // Zero, and recorded anyway: a run that cost nothing is still a run whose size is worth
      // knowing next to the ones that did.
      usage: { ...usage, model: settings.model, costUsd: 0 },
      delegatedTasks: nextCampaignTasks(context.task.type, context.task.input, context.task.id, output),
    };
  }

  private async ask(brief: Brief, context: AgentContext, settings: ReturnType<typeof ollamaSettings>) {
    const schema = askable(brief.schemaFor?.(context.task) ?? brief.schema);
    const { z } = await import("zod");

    let response: Response;
    try {
      response = await fetch(`${settings.url}/api/chat`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        signal: AbortSignal.timeout(settings.timeoutMs),
        body: JSON.stringify({
          model: settings.model,
          // Streamed for the reason `collect` explains: not for progress, but because the
          // alternative silently looks like a network failure after five minutes.
          stream: true,
          format: z.toJSONSchema(schema, { target: "draft-7" }),
          options: {
            num_ctx: settings.numCtx,
            // Low, not zero: the briefs ask for an argument and for phrasing, and a fully greedy
            // decode on a small model repeats itself across a campaign's stages.
            temperature: 0.4,
          },
          messages: [
            { role: "system", content: brief.system },
            { role: "user", content: [contextFor(context), "", brief.instruction].join("\n") },
          ],
        }),
      });
    } catch (error) {
      classify(error, settings.url);
    }

    if (response.status === 404) {
      throw new DomainError("provider", `Ollama no tiene el modelo ${settings.model}. Descargalo con: ollama pull ${settings.model}`, "ollama_model_missing", false);
    }
    if (!response.ok) {
      const detail = (await response.text().catch(() => "")).slice(0, 300);
      throw new DomainError("provider", `Ollama respondió ${response.status}: ${detail}`, "ollama_failed", response.status >= 500);
    }

    // Guarded too: a deadline can just as easily fire halfway through the read.
    let content: string;
    let doneReason: string;
    let usage: TokenUsage;
    try {
      ({ content, doneReason, usage } = await collect(response));
    } catch (error) {
      classify(error, settings.url);
    }

    if (doneReason === "length") {
      // Cut mid-structure, so parsing would fail anyway; saying why beats a schema error that
      // points at whichever field happened to be open when the budget ran out.
      throw new DomainError("provider", "La respuesta del modelo local se cortó por longitud.", "ollama_truncated", true);
    }
    if (!content) {
      throw new DomainError("provider", "Ollama devolvió una respuesta vacía.", "ollama_empty", true);
    }

    let raw: unknown;
    try {
      raw = JSON.parse(content);
    } catch {
      throw new DomainError("validation", "El modelo local no devolvió JSON válido.", "ollama_output_invalid", true);
    }

    // The second enforcement. The grammar guaranteed the shape; this checks the limits a grammar
    // cannot count, against the same schema the database is held to.
    const result = schema.safeParse(raw);
    if (!result.success) {
      const first = result.error.issues[0];
      const where = first?.path.join(".") || "la raíz";
      throw new DomainError("validation", `La respuesta del modelo local no cumple el esquema en ${where}: ${first?.message ?? "sin detalle"}`.slice(0, 900), "ollama_output_rejected", true);
    }
    return { parsed: result.data as Record<string, unknown>, usage };
  }
}
