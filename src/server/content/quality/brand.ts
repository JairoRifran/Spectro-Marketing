import type { BrandContext } from "../schemas/brief";
import type { Finding } from "../schemas/review";
import type { PlatformPlaybook } from "../playbooks";
import { containsTerm } from "./text";

// Brand guardrails. M01 stores the brand kit but never enforced it anywhere in code, so this
// is the first implementation rather than a second copy of an existing rule set. When the
// brand kit gains fields, extend here and nowhere else.

const INFORMALITY_RANK = { formal: 0, professional: 1, conversational: 2, casual: 3 } as const;

export interface BrandCheckInput {
  brand: BrandContext;
  playbook: PlatformPlaybook;
  /** Every piece of audience-facing copy in the variant, already flattened. */
  texts: string[];
}

export function checkBrand(input: BrandCheckInput): Finding[] {
  const findings: Finding[] = [];
  const platform = input.playbook.platform;
  const combined = input.texts.join("\n");

  for (const word of input.brand.forbiddenWords) {
    if (containsTerm(combined, word)) {
      findings.push({ check: "brand.forbidden_word", severity: "error", message: `La copy usa una palabra prohibida por la marca: "${word}".`, platform });
    }
  }

  for (const claim of input.brand.forbiddenClaims) {
    if (containsTerm(combined, claim)) {
      findings.push({ check: "brand.forbidden_claim", severity: "error", message: `La copy incluye un claim prohibido por la marca: "${claim}".`, platform });
    }
  }

  // The platform sets a ceiling on register; the brand sets its own. The stricter of the two
  // wins, which is what stops TikTok norms from dragging a formal brand into slang.
  const brandCeiling = INFORMALITY_RANK[input.brand.informalityCeiling];
  const platformCeiling = INFORMALITY_RANK[input.playbook.tone.informalityCeiling];
  if (platformCeiling > brandCeiling) {
    findings.push({
      check: "brand.register_ceiling",
      severity: "warning",
      message: `${platform} admite un registro más informal que el permitido por la marca (${input.brand.informalityCeiling}); mantené el tono de marca.`,
      platform,
    });
  }

  if (input.brand.preferredWords.length && !input.brand.preferredWords.some((word) => containsTerm(combined, word))) {
    findings.push({
      check: "brand.preferred_terminology",
      severity: "warning",
      message: "La copy no usa ninguno de los términos preferidos por la marca.",
      platform,
    });
  }

  return findings;
}

/** Ceiling actually applicable to a piece: the stricter of brand and platform. */
export function effectiveInformalityCeiling(brand: BrandContext, playbook: PlatformPlaybook) {
  return INFORMALITY_RANK[brand.informalityCeiling] <= INFORMALITY_RANK[playbook.tone.informalityCeiling]
    ? brand.informalityCeiling
    : playbook.tone.informalityCeiling;
}
