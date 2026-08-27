import { type ContentType, isPromotional, stageOf } from "../content-types";
import type { Finding } from "../schemas/review";

// Content-mix diagnostics. There is no universal correct ratio, so nothing here decides a
// formula or rewrites a plan: it reports what the plan is weighted towards and warns when a
// weighting is extreme enough that a human should have looked at it on purpose.

/** Share of promotional pieces above which a plan reads as an advertising feed. */
export const PROMOTIONAL_WARNING_RATIO = 0.5;
/** Share of a single content type above which the plan is effectively one repeated idea. */
export const SINGLE_TYPE_WARNING_RATIO = 0.7;

export interface MixSummary {
  total: number;
  byType: Record<string, number>;
  promotional: number;
  promotionalRatio: number;
  byStage: { awareness: number; consideration: number; decision: number };
}

export function summarizeMix(types: ContentType[]): MixSummary {
  const byType: Record<string, number> = {};
  const byStage = { awareness: 0, consideration: 0, decision: 0 };
  let promotional = 0;

  for (const type of types) {
    byType[type] = (byType[type] ?? 0) + 1;
    byStage[stageOf(type)] += 1;
    if (isPromotional(type)) promotional += 1;
  }

  const total = types.length;
  return { total, byType, promotional, promotionalRatio: total ? promotional / total : 0, byStage };
}

export function checkContentMix(types: ContentType[]): Finding[] {
  const findings: Finding[] = [];
  const summary = summarizeMix(types);
  if (!summary.total) return findings;

  if (summary.promotionalRatio > PROMOTIONAL_WARNING_RATIO) {
    findings.push({
      check: "mix.overly_promotional",
      severity: "warning",
      message: `Overly promotional content mix: ${summary.promotional} de ${summary.total} piezas son de producto o conversión.`,
    });
  }

  for (const [type, count] of Object.entries(summary.byType)) {
    if (count / summary.total > SINGLE_TYPE_WARNING_RATIO) {
      findings.push({
        check: "mix.single_type_dominance",
        severity: "warning",
        message: `El plan está dominado por un solo tipo de contenido (${type}: ${count} de ${summary.total}).`,
      });
    }
  }

  if (summary.byStage.awareness === 0 && summary.total >= 4) {
    findings.push({
      check: "mix.no_awareness",
      severity: "warning",
      message: "El plan no incluye ninguna pieza de awareness; todo el contenido asume una audiencia ya interesada.",
    });
  }

  return findings;
}
