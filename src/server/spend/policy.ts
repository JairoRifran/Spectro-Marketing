import { z } from "zod";
import { microsSchema, type Micros } from "./money";

// Whether a paid call is allowed to happen, decided before it happens.
//
// This is the first thing in Spectro that spends real money, and the failure mode is not a red
// test — it is an invoice. So the rules are deliberately unforgiving:
//
// - Default deny. A limit that was never configured is zero, not infinite. Nothing spends until
//   somebody sets a number on purpose, the same posture as AUTOMATION_ENABLED being false.
// - Every scope must allow it. An organization ceiling and a campaign ceiling both apply, and
//   the answer is no if any of them says no.
// - Estimate before, record after. The check runs against what the call is expected to cost,
//   because after the call the money is already gone.
// - Deny whole, never trim. A request that does not fit is refused, not silently shortened into
//   something cheaper than what was asked for.

export const spendScopeSchema = z.enum(["organization", "campaign"]);
export type SpendScope = z.infer<typeof spendScopeSchema>;

export const spendLimitSchema = z.object({
  scope: spendScopeSchema,
  /** Everything already spent or reserved against this limit. */
  committedMicros: microsSchema,
  /** The maximum this scope may ever reach. Zero means nothing is allowed to spend. */
  ceilingMicros: microsSchema,
});
export type SpendLimit = z.infer<typeof spendLimitSchema>;

export type SpendDenial =
  /** No ceiling has been configured for this scope, so nothing may be spent against it. */
  | { reason: "no_budget"; scope: SpendScope }
  /** The request alone is larger than the whole ceiling; more room would never help. */
  | { reason: "over_ceiling"; scope: SpendScope; ceilingMicros: Micros; estimateMicros: Micros }
  /** There is a ceiling, but not enough left under it. */
  | { reason: "insufficient_budget"; scope: SpendScope; remainingMicros: Micros; estimateMicros: Micros };

export type SpendDecision =
  | { allowed: true; estimateMicros: Micros; remainingAfterMicros: Micros }
  | { allowed: false; denial: SpendDenial };

/** What is left under a limit. Never negative: an overspent scope has nothing left, not less. */
export function remaining(limit: SpendLimit): Micros {
  return Math.max(0, limit.ceilingMicros - limit.committedMicros);
}

/**
 * Decides whether an estimated cost may be incurred. Pure: the same inputs always give the same
 * answer, so the rule can be tested exhaustively rather than trusted.
 *
 * With no limits at all the answer is no. An empty list means nothing has been configured, and
 * "unconfigured" must never read as "unlimited".
 */
export function authorizeSpend(estimateMicros: Micros, limits: SpendLimit[]): SpendDecision {
  if (!Number.isInteger(estimateMicros) || estimateMicros < 0) {
    return { allowed: false, denial: { reason: "no_budget", scope: "organization" } };
  }
  if (limits.length === 0) {
    return { allowed: false, denial: { reason: "no_budget", scope: "organization" } };
  }

  for (const limit of limits) {
    if (limit.ceilingMicros === 0) {
      return { allowed: false, denial: { reason: "no_budget", scope: limit.scope } };
    }
    if (estimateMicros > limit.ceilingMicros) {
      return {
        allowed: false,
        denial: { reason: "over_ceiling", scope: limit.scope, ceilingMicros: limit.ceilingMicros, estimateMicros },
      };
    }
    const left = remaining(limit);
    if (estimateMicros > left) {
      return {
        allowed: false,
        denial: { reason: "insufficient_budget", scope: limit.scope, remainingMicros: left, estimateMicros },
      };
    }
  }

  const tightest = Math.min(...limits.map((limit) => remaining(limit) - estimateMicros));
  return { allowed: true, estimateMicros, remainingAfterMicros: tightest };
}

/** A short, user-facing reason. Never an internal code on its own. */
export function denialMessage(denial: SpendDenial): string {
  const where = denial.scope === "campaign" ? "esta campaña" : "la organización";
  if (denial.reason === "no_budget") return `No hay presupuesto configurado para ${where}. Nada se gasta hasta que definas un tope.`;
  if (denial.reason === "over_ceiling") return `Esta operación sola supera el tope de ${where}.`;
  return `No queda presupuesto suficiente en ${where} para esta operación.`;
}
