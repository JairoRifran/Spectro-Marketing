import type { AgentContext, AgentResult } from "@/server/agents/contracts";
import { getAdapter } from "@/server/content/adapters";
import type { AdaptContext } from "@/server/content/adapters";
import { selectHookTypes } from "@/server/content/hooks";
import { getPlaybook } from "@/server/content/playbooks";
import type { ContentFormat, SupportedPlatform } from "@/server/content/platforms";
import type { BrandContext, ContentBrief } from "@/server/content/schemas/brief";
import type { ContentConcept } from "@/server/content/schemas/concept";
import type { CampaignObjective } from "@/server/content/ctas";
import type { ContentType } from "@/server/content/content-types";
import { buildContentPlan, planChannels, type CampaignChannel, type PillarWeight } from "./planning";
import { CONTENT_PROMPTS } from "./prompts";

// Deterministic Content Factory behaviour for the three task types. It demonstrates the whole
// chain without a provider call: same campaign in, same plan and same copy out.
//
// Everything it produces is marked mock at the persistence boundary, and the platform work is
// delegated to the Content Intelligence adapters rather than reimplemented here — that is what
// keeps each platform's execution native instead of one text repeated.

export interface ContentPlanTaskInput {
  campaignId: string;
  strategyVersion: number;
  campaignName: string;
  objective: CampaignObjective;
  objectiveTitle: string;
  durationWeeks: number;
  maxPieces: number;
  audiencePersona: string;
  audienceProblem: string;
  audiencePromise: string;
  pillars: PillarWeight[];
  angles: Array<{ name: string; description: string }>;
  channels: CampaignChannel[];
  brand: BrandContext;
  constraints: string[];
}

export interface ContentCopyTaskInput {
  contentItemId: string;
  conceptId: string;
  version: number;
  brief: ContentBrief;
  concept: ContentConcept;
  campaignObjective: CampaignObjective;
  campaignId: string;
  campaignName: string;
  /** Present on a revision: the human feedback the new version has to answer. */
  revisionFeedback?: string;
}

export interface CreativeReviewTaskInput {
  contentItemId: string;
  version: number;
  platform: SupportedPlatform;
  format: ContentFormat;
  brief: ContentBrief;
}

const CONTENT_TYPE_BY_PILLAR: Array<{ match: RegExp; type: ContentType }> = [
  { match: /educa|how|guía|guia/i, type: "educational" },
  { match: /problem|dolor|pain/i, type: "problem_awareness" },
  { match: /product|solución|solucion|demo/i, type: "product" },
  { match: /author|experti|thought/i, type: "authority" },
  { match: /prueba|social|testimon|proof/i, type: "social_proof" },
  { match: /conver|venta|sales/i, type: "conversion" },
  { match: /caso|case/i, type: "case_study" },
];

/** Maps a campaign pillar name onto the editorial intent taxonomy. */
export function contentTypeForPillar(pillar: string): ContentType {
  return CONTENT_TYPE_BY_PILLAR.find((entry) => entry.match.test(pillar))?.type ?? "educational";
}

function conceptKey(campaignId: string, index: number) {
  return `CONCEPT-${campaignId.slice(0, 8)}-${String(index + 1).padStart(3, "0")}`;
}

/** Bruno: an approved campaign becomes a set of editorial ideas, one per planned piece. */
export function planContent(input: ContentPlanTaskInput): { concepts: ContentConcept[]; warnings: string[] } {
  const channels = planChannels(input.channels, input.durationWeeks);
  const channelWarnings = channels.flatMap((channel) => channel.warnings);
  const plan = buildContentPlan({
    channels,
    pillars: input.pillars,
    angles: input.angles.map((angle) => angle.name),
    maxPieces: input.maxPieces,
  });

  const angleByName = new Map(input.angles.map((angle) => [angle.name, angle.description]));

  const concepts: ContentConcept[] = plan.pieces.map((piece, index) => {
    const contentType = contentTypeForPillar(piece.pillar);
    const playbook = getPlaybook(piece.platform);
    const viableHooks = selectHookTypes({ platform: piece.platform, contentType });
    const preferred = playbook.hookGuidelines.preferredTypes.filter((type) => viableHooks.includes(type));
    return {
      conceptId: conceptKey(input.campaignId, index),
      title: `${piece.pillar}: ${piece.angle}`,
      internalName: `${input.campaignName} · ${piece.platform} · ${index + 1}`,
      pillar: piece.pillar,
      angle: piece.angle,
      objective: contentType,
      audience: {
        persona: input.audiencePersona,
        problem: input.audienceProblem,
        promise: input.audiencePromise,
      },
      coreIdea: angleByName.get(piece.angle) ?? `${piece.angle}. ${input.audienceProblem}`,
      hookDirection: {
        preferredTypes: (preferred.length ? preferred : viableHooks).slice(0, 3),
        note: `Apertura acorde al playbook de ${piece.platform}.`,
      },
      format: piece.format,
      platforms: [piece.platform],
      cta: playbook.ctaGuidelines.preferredTypes[0],
      evidenceRequired: [],
      creativeNotes: input.constraints.slice(0, 5),
    };
  });

  return { concepts, warnings: [...channelWarnings, ...plan.warnings] };
}

export function mockContentResult(context: AgentContext): AgentResult | null {
  if (context.task.type === "content.plan") {
    const input = context.task.input as unknown as ContentPlanTaskInput;
    const { concepts, warnings } = planContent(input);
    return {
      summary: `Bruno planificó ${concepts.length} conceptos editoriales para ${input.campaignName}.`,
      output: {
        concepts,
        planWarnings: warnings,
        reason: `El plan reparte las piezas según los pesos de los pilares de la campaña y la frecuencia declarada por canal, sin decidir de nuevo la estrategia.`,
        provider: "mock",
        model: null,
        promptVersion: CONTENT_PROMPTS.contentPlan.version,
      },
    };
  }

  if (context.task.type === "content.copy") {
    const input = context.task.input as unknown as ContentCopyTaskInput;
    const adaptContext: AdaptContext = {
      concept: input.concept,
      brand: input.brief.brand,
      campaign: { campaignId: input.campaignId, name: input.campaignName, objective: input.campaignObjective },
    };
    const adapter = getAdapter(input.brief.platform);
    const variant = adapter.draft(adaptContext);
    const playbook = getPlaybook(input.brief.platform);
    const hookTypes = selectHookTypes({ platform: input.brief.platform, contentType: input.brief.contentType }).slice(0, 3);

    return {
      summary: `Clara escribió la variante nativa de ${input.brief.platform} (${input.brief.format}).`,
      output: {
        variant,
        hookVariants: hookTypes.length >= 2
          ? hookTypes.slice(0, 3).map((type, index) => ({
              label: (["A", "B", "C"] as const)[index],
              text: index === 0 ? variant.hook : `${variant.hook} (${type})`,
              type,
              rationale: `Apertura de tipo ${type}, dentro de las recomendadas para ${input.brief.platform}.`,
              risk: type === "specific_result" || type === "statistic" ? "Requiere evidencia declarada." : "Puede sonar genérica si no se concreta.",
            }))
          : undefined,
        reason: input.revisionFeedback
          ? `Nueva versión escrita atendiendo el pedido de revisión: ${input.revisionFeedback}`
          : `Escrita desde el playbook de ${input.brief.platform}: ${playbook.summary}`,
        provider: "mock",
        model: null,
        promptVersion: CONTENT_PROMPTS.contentCopy.version,
      },
    };
  }

  if (context.task.type === "content.creative_review") {
    const input = context.task.input as unknown as CreativeReviewTaskInput;
    const playbook = getPlaybook(input.platform);
    return {
      summary: `Emilia revisó la dirección creativa de la pieza de ${input.platform}.`,
      output: {
        visualDirection: playbook.visualGuidelines.notes.join(" "),
        storyboard: playbook.storytellingPatterns.slice(0, 3).map((pattern, index) => ({
          beat: `Beat ${index + 1}`,
          visual: pattern,
          motion: playbook.videoGuidelines?.notes[0],
        })),
        motionNotes: playbook.videoGuidelines ? [...playbook.videoGuidelines.notes] : [],
        compositionNotes: [...playbook.visualGuidelines.safeAreaNotes],
        brandConsistency: "consistent",
        findings: [],
        approved: true,
        reason: `La dirección visual acompaña el registro de ${input.platform} y respeta las instrucciones de marca.`,
        provider: "mock",
        model: null,
        promptVersion: CONTENT_PROMPTS.creativeReview.version,
      },
    };
  }

  return null;
}
