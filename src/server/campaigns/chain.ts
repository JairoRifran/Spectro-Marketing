import type { DelegatedTask } from "@/server/agents/contracts";

// What Campaign Brain does next.
//
// The sequence is fixed: a draft needs research before channels can be argued, channels need to
// exist before pillars mean anything, and the brief consolidates all of it. None of that is a
// judgement call, so it lives in code rather than in a model's output — asking a provider to
// name its own successor would let a bad answer stall the pipeline, and asking two providers
// would let them disagree about the order.
//
// Both the deterministic provider and the Anthropic one read this table, because a chain that
// existed twice would drift the first time a step was inserted, and the failure would look like
// "the campaign stopped after research" rather than like an edit.

interface Step {
  type: string;
  role: string;
  title: string;
  description: string;
  reason: string;
}

const AFTER: Record<string, Step> = {
  "campaign.strategy.draft": {
    type: "campaign.research", role: "market_intelligence",
    title: "Investigar oportunidad de campaña",
    description: "Sintetizar conocimiento interno, supuestos y vacíos de investigación externa.",
    reason: "Sofía requiere evidencia estructurada antes de definir canales.",
  },
  "campaign.research": {
    type: "campaign.channel_strategy", role: "social_media_director",
    title: "Diseñar estrategia de canales",
    description: "Evaluar relevancia, formatos y rol de cada canal sin conectar APIs.",
    reason: "El research ya separó evidencia interna de supuestos.",
  },
  "campaign.channel_strategy": {
    type: "campaign.content_plan", role: "content_strategist",
    title: "Construir pilares y ángulos",
    description: "Definir dirección editorial sin producir piezas.",
    reason: "Los canales priorizados ya tienen un rol explícito.",
  },
  "campaign.content_plan": {
    type: "campaign.strategy.finalize", role: "cmo",
    title: "Consolidar Campaign Brief",
    description: "Validar guardrails, versionar la estrategia y solicitar aprobación.",
    reason: "Research, canales y contenido estratégico están completos.",
  },
  // campaign.strategy.finalize ends the chain: what follows is a human approval, not a task.
};

/**
 * The task that follows this one, carrying the campaign input forward.
 *
 * The producing step's own output is carried too, under `upstream`. Without it each step reads
 * only the original objective: pillars would be chosen without having seen the research, and
 * channels argued without having seen the audience. A deterministic provider never noticed,
 * because its answers were fixed before the question — a real one would be planning blind.
 *
 * Returns an empty list at the end of the chain, so a caller can spread it unconditionally.
 */
export function nextCampaignTasks(
  taskType: string,
  input: Record<string, unknown>,
  sourceTaskId: string,
  output?: Record<string, unknown>,
): DelegatedTask[] {
  const step = AFTER[taskType];
  if (!step) return [];
  const previous = (input.upstream ?? {}) as Record<string, unknown>;
  const upstream = output ? { ...previous, [taskType]: output } : previous;
  return [{ ...step, input: { ...input, upstream, sourceTaskId } }];
}
