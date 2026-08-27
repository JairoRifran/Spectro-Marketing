import { DomainError } from "@/server/errors";
import { selectCtaTypes } from "../ctas";
import { type HookType, selectHookTypes } from "../hooks";
import { getPlaybook } from "../playbooks";
import { type ContentFormat, shapeOf, type SupportedPlatform, supportsFormat } from "../platforms";
import type { ContentBrief } from "../schemas/brief";
import type { PlatformContentVariant, VariantDetail } from "../schemas/variant";
import type { AdaptContext } from "./types";

// Shared adapter mechanics. Everything here is deterministic and platform-agnostic; each
// platform module supplies only what genuinely differs — the format it reaches for and the
// shape of its execution.

/**
 * Picks the format this adapter will actually produce. `preferred` is the adapter own
 * producible set, so the concept format only wins when the adapter can build it: honouring a
 * concept format the adapter cannot produce is how a text adapter ends up asked for a video.
 */
export function resolveFormat(platform: SupportedPlatform, preferred: ContentFormat[], conceptFormat: ContentFormat): ContentFormat {
  if (preferred.includes(conceptFormat) && supportsFormat(platform, conceptFormat)) return conceptFormat;
  const fallback = preferred.find((format) => supportsFormat(platform, format));
  if (!fallback) throw new DomainError("validation", `No hay formato compatible para ${platform}.`, "format_unavailable");
  return fallback;
}

/** The hook shape this platform should reach for, preferring the concept's own direction. */
export function resolveHookType(platform: SupportedPlatform, context: AdaptContext): HookType {
  const playbook = getPlaybook(platform);
  const viable = selectHookTypes({ platform, contentType: context.concept.objective })
    .filter((type) => !playbook.hookGuidelines.discouragedTypes.includes(type));
  const fromConcept = context.concept.hookDirection.preferredTypes.find((type) => viable.includes(type));
  if (fromConcept) return fromConcept;
  const fromPlaybook = playbook.hookGuidelines.preferredTypes.find((type) => viable.includes(type));
  return fromPlaybook ?? viable[0] ?? playbook.hookGuidelines.preferredTypes[0];
}

/** The strongest call to action this platform and campaign objective jointly allow. */
export function resolveCtaType(platform: SupportedPlatform, context: AdaptContext) {
  const allowed = selectCtaTypes({ platform, objective: context.campaign.objective });
  if (allowed.includes(context.concept.cta)) return context.concept.cta;
  const playbook = getPlaybook(platform);
  const preferred = playbook.ctaGuidelines.preferredTypes.find((cta) => allowed.includes(cta));
  if (preferred) return preferred;
  if (!allowed.length) throw new DomainError("validation", `No hay CTA coherente para ${platform} con objetivo ${context.campaign.objective}.`, "cta_unavailable");
  return allowed[0];
}

export function buildBrief(platform: SupportedPlatform, format: ContentFormat, context: AdaptContext): ContentBrief {
  // Fails fast for a platform that has no editorial rules rather than emitting a brief the
  // writer cannot act on.
  getPlaybook(platform);
  return {
    conceptId: context.concept.conceptId,
    campaignId: context.campaign.campaignId,
    objective: context.campaign.objective,
    contentType: context.concept.objective,
    audience: { persona: context.concept.audience.persona, problem: context.concept.audience.problem },
    pillar: context.concept.pillar,
    angle: context.concept.angle,
    platform,
    format,
    message: context.concept.coreIdea,
    desiredAction: resolveCtaType(platform, context),
    evidence: context.concept.evidenceRequired,
    brand: context.brand,
    // Only concept-level constraints. Platform rules live in the playbook and are injected
    // by the prompt layer, so repeating them here would duplicate them in every prompt.
    constraints: context.concept.creativeNotes.slice(0, 20),
  };
}

export interface DraftParts {
  hook: string;
  body: string;
  caption: string;
  cta: string;
  visualDirection?: string;
  videoDirection?: string;
  estimatedDurationSeconds?: number;
  onScreenText?: string[];
  detail: VariantDetail;
  metadata?: Record<string, string>;
}

/**
 * Assembles a variant from platform-supplied parts. `generatedBy` is fixed to "mock" here:
 * nothing produced without a real provider may ever be presented as model output.
 */
export function buildDraft(platform: SupportedPlatform, format: ContentFormat, context: AdaptContext, parts: DraftParts): PlatformContentVariant {
  if (parts.detail.shape !== shapeOf(format)) {
    throw new DomainError("validation", `El detalle no coincide con la forma de ${format}.`, "shape_mismatch");
  }
  return {
    conceptId: context.concept.conceptId,
    platform,
    format,
    hook: parts.hook,
    hookType: resolveHookType(platform, context),
    body: parts.body,
    caption: parts.caption,
    cta: parts.cta,
    ctaType: resolveCtaType(platform, context),
    visualDirection: parts.visualDirection,
    videoDirection: parts.videoDirection,
    estimatedDurationSeconds: parts.estimatedDurationSeconds,
    onScreenText: parts.onScreenText ?? [],
    shotNotes: [],
    detail: parts.detail,
    claims: context.concept.evidenceRequired,
    metadata: parts.metadata ?? {},
    generatedBy: "mock",
  };
}

/**
 * Trims text to a word budget on a word boundary. Adapters use it so a generated hook
 * cannot violate the very playbook limit the evaluator then checks it against.
 */
export function clampWords(text: string, maxWords: number) {
  const words = text.trim().split(/\s+/).filter(Boolean);
  if (words.length <= maxWords) return text.trim();
  return words.slice(0, maxWords).join(" ").replace(/[,;:.]$/, "");
}

/** Word budget the platform allows for an opening. */
export function hookBudget(platform: SupportedPlatform) {
  return getPlaybook(platform).lengthGuidelines.hookMaxWords;
}
