import type { ContentType } from "../content-types";
import { ctaAvailableOn, ctaIsCoherent } from "../ctas";
import { hookFits, hookRequiresEvidence } from "../hooks";
import { getPlaybook } from "../playbooks";
import { shapeOf, supportsFormat } from "../platforms";
import type { ContentBrief } from "../schemas/brief";
import type { ContentReviewResult, Finding } from "../schemas/review";
import type { PlatformContentVariant } from "../schemas/variant";
import { checkBrand } from "./brand";
import { checkClaims } from "./claims";
import { checkDuplication } from "./duplication";
import { checkContentMix } from "./mix";
import { checkSafety } from "./safety";
import { wordCount } from "./text";

// The deterministic gate that runs before any model-based reviewer is ever introduced.
// Every check is a pure function of the brief, the variant and the platform playbook, so a
// failure is reproducible and explainable without re-running a provider.

export interface VariantUnderReview {
  brief: ContentBrief;
  variant: PlatformContentVariant;
}

export interface EvaluationInput {
  items: VariantUnderReview[];
  /** Editorial intent of the wider plan, when the caller is reviewing a whole plan. */
  planTypes?: ContentType[];
  allowContactEmail?: boolean;
}

class Ledger {
  readonly findings: Finding[] = [];
  private total = 0;
  private failed = 0;

  assert(ok: boolean, finding: Finding) {
    this.total += 1;
    if (!ok) {
      this.failed += 1;
      this.findings.push(finding);
    }
  }

  /** Findings produced by a sub-checker that runs many rules internally. */
  absorb(found: Finding[], checksRun: number) {
    this.total += checksRun;
    this.failed += found.length;
    this.findings.push(...found);
  }

  get score() {
    return { passed: Math.max(0, this.total - this.failed), total: this.total };
  }
}

function textsOf(variant: PlatformContentVariant) {
  return [variant.hook, variant.body, variant.caption, variant.cta, ...variant.onScreenText];
}

function evaluateOne(item: VariantUnderReview, ledger: Ledger, allowContactEmail: boolean) {
  const { brief, variant } = item;
  const platform = variant.platform;
  const playbook = getPlaybook(platform);

  ledger.assert(variant.conceptId === brief.conceptId, {
    check: "coherence.concept_id", severity: "error", platform,
    message: "La variante no pertenece al concepto del brief.",
  });
  ledger.assert(variant.platform === brief.platform, {
    check: "coherence.platform", severity: "error", platform,
    message: "La variante no corresponde a la plataforma del brief.",
  });
  ledger.assert(variant.format === brief.format, {
    check: "coherence.format", severity: "error", platform,
    message: "La variante no corresponde al formato del brief.",
  });

  ledger.assert(supportsFormat(platform, variant.format), {
    check: "platform.format_mismatch", severity: "error", platform,
    message: `${platform} no admite el formato ${variant.format}.`,
  });
  ledger.assert(variant.detail.shape === shapeOf(variant.format), {
    check: "platform.shape_mismatch", severity: "error", platform,
    message: `El detalle de la variante no coincide con la forma de producción de ${variant.format}.`,
  });

  ledger.assert(variant.hook.trim().length > 0, {
    check: "content.missing_hook", severity: "error", platform,
    message: "La variante no tiene hook.",
  });
  ledger.assert(wordCount(variant.hook) <= playbook.lengthGuidelines.hookMaxWords, {
    check: "platform.hook_length", severity: "warning", platform,
    message: `El hook supera las ${playbook.lengthGuidelines.hookMaxWords} palabras recomendadas para ${platform}.`,
  });
  ledger.assert(hookFits(variant.hookType, { platform, contentType: brief.contentType }), {
    check: "platform.hook_type", severity: "warning", platform,
    message: `El tipo de hook "${variant.hookType}" no es el más adecuado para ${platform} con contenido ${brief.contentType}.`,
  });
  ledger.assert(!playbook.hookGuidelines.discouragedTypes.includes(variant.hookType), {
    check: "platform.hook_discouraged", severity: "warning", platform,
    message: `El playbook de ${platform} desaconseja el hook "${variant.hookType}".`,
  });

  ledger.assert(variant.cta.trim().length > 0, {
    check: "content.missing_cta", severity: "error", platform,
    message: "La variante no tiene llamada a la acción.",
  });
  ledger.assert(ctaIsCoherent(variant.ctaType, brief.objective), {
    check: "cta.incoherent_with_objective", severity: "error", platform,
    message: `La acción "${variant.ctaType}" es demasiado exigente para un objetivo de campaña ${brief.objective}.`,
  });
  ledger.assert(ctaAvailableOn(variant.ctaType, platform), {
    check: "cta.unavailable_on_platform", severity: "warning", platform,
    message: `La acción "${variant.ctaType}" no encaja en ${platform}.`,
  });

  const caption = variant.caption.trim().length;
  ledger.assert(caption >= playbook.lengthGuidelines.captionChars.min && caption <= playbook.lengthGuidelines.captionChars.max, {
    check: "platform.caption_length", severity: "warning", platform,
    message: `El caption (${caption} caracteres) queda fuera del rango recomendado para ${platform}.`,
  });

  const shape = variant.detail.shape;
  if (shape === "video") {
    ledger.assert(Boolean(variant.videoDirection?.trim()), {
      check: "content.missing_video_direction", severity: "error", platform,
      message: "Un formato de video necesita dirección de video.",
    });
    const bounds = playbook.lengthGuidelines.durationSeconds;
    const duration = variant.estimatedDurationSeconds ?? variant.detail.script.estimatedDurationSeconds;
    ledger.assert(!bounds || (duration >= bounds.min && duration <= bounds.max), {
      check: "platform.duration", severity: "warning", platform,
      message: `La duración estimada (${duration}s) queda fuera del rango recomendado para ${platform}.`,
    });
  }
  if (shape !== "text") {
    ledger.assert(Boolean(variant.visualDirection?.trim()), {
      check: "content.missing_visual_direction", severity: "error", platform,
      message: "Un formato visual necesita dirección visual.",
    });
  }

  ledger.absorb(checkBrand({ brand: brief.brand, playbook, texts: textsOf(variant) }), 4);
  ledger.absorb(
    checkClaims({
      texts: textsOf(variant),
      declaredClaims: variant.claims.length ? variant.claims : brief.evidence,
      platform,
      hookImpliesClaim: hookRequiresEvidence(variant.hookType),
    }),
    4,
  );
  ledger.absorb(checkSafety({ texts: textsOf(variant), platform, allowContactEmail }), 3);
}

export function evaluateContent(input: EvaluationInput): ContentReviewResult {
  const ledger = new Ledger();

  for (const item of input.items) evaluateOne(item, ledger, input.allowContactEmail ?? false);

  if (input.items.length > 1) {
    ledger.absorb(checkDuplication(input.items.map((item) => item.variant)), 1);
  }
  if (input.planTypes?.length) {
    ledger.absorb(checkContentMix(input.planTypes), 3);
  }

  const errors = ledger.findings.filter((finding) => finding.severity === "error");
  const warnings = ledger.findings.filter((finding) => finding.severity === "warning");

  return {
    passed: errors.length === 0,
    errors,
    warnings,
    brandIssues: ledger.findings.filter((finding) => finding.check.startsWith("brand.")),
    platformIssues: ledger.findings.filter((finding) => finding.check.startsWith("platform.") || finding.check.startsWith("duplication.")),
    claimIssues: ledger.findings.filter((finding) => finding.check.startsWith("claim.")),
    recommendations: recommendationsFor(ledger.findings),
    score: ledger.score,
  };
}

function recommendationsFor(findings: Finding[]) {
  const seen = new Set<string>();
  const recommendations: string[] = [];
  const add = (text: string) => {
    if (!seen.has(text)) {
      seen.add(text);
      recommendations.push(text);
    }
  };

  for (const finding of findings) {
    if (finding.check.startsWith("duplication.")) add("Reescribí cada variante desde el playbook de su plataforma en vez de adaptar un texto único.");
    if (finding.check === "claim.requires_evidence" || finding.check === "claim.undeclared_figure") add("Adjuntá una referencia de evidencia a cada cifra antes de aprobar la pieza.");
    if (finding.check.startsWith("brand.")) add("Revisá la copy contra el brand kit de la organización.");
    if (finding.check === "cta.incoherent_with_objective") add("Bajá la exigencia de la llamada a la acción al momento del funnel que la campaña realmente ocupa.");
    if (finding.check.startsWith("safety.")) add("Quitá los datos sensibles de la copy; no deben salir del entorno interno.");
    if (finding.check === "mix.overly_promotional") add("Balanceá el plan con piezas educativas o de problema antes de sumar más contenido de conversión.");
  }
  return recommendations;
}
