import type { Claim } from "../schemas/common";
import type { Finding } from "../schemas/review";
import type { SupportedPlatform } from "../platforms";

// Claim detection. The goal is not to judge whether a statement is true — code cannot do
// that — but to refuse to let a measurable assertion through without something attached to
// it. Anything this flags is a warning or an error the human review has to resolve.

/** A figure presented as an outcome: "70%", "3x", "de 10 a 300". */
const NUMERIC_OUTCOME = /(\d+([.,]\d+)?\s*%)|(\b\d+([.,]\d+)?\s*x\b)|(\b\d{2,}\b)/i;

/** Language that asserts certainty about a result. Deliberately conservative. */
const GUARANTEE_TERMS = [
  "garantizado", "garantizada", "garantizamos", "garantiza",
  "asegurado", "aseguramos",
  "siempre funciona", "sin riesgo", "resultados inmediatos",
  "guaranteed", "risk free", "guarantees results",
];

const SUPERLATIVES = ["el mejor", "la mejor", "el unico", "la unica", "numero uno", "the best", "the only"];

function lower(text: string) {
  return text.toLowerCase();
}

export interface ClaimCheckInput {
  texts: string[];
  /** Claims the brief already declared, with whatever evidence is attached. */
  declaredClaims: Claim[];
  platform: SupportedPlatform;
  /** True when the chosen hook shape itself asserts an outcome. */
  hookImpliesClaim: boolean;
}

export function checkClaims(input: ClaimCheckInput): Finding[] {
  const findings: Finding[] = [];
  const combined = input.texts.join("\n");
  const haystack = lower(combined);

  for (const term of GUARANTEE_TERMS) {
    if (haystack.includes(term)) {
      findings.push({
        check: "claim.guarantee_language",
        severity: "error",
        message: `La copy promete un resultado ("${term}"). Spectro no garantiza performance.`,
        platform: input.platform,
      });
    }
  }

  for (const term of SUPERLATIVES) {
    if (haystack.includes(term)) {
      findings.push({
        check: "claim.unbacked_superlative",
        severity: "warning",
        message: `Superlativo sin respaldo: "${term}".`,
        platform: input.platform,
      });
    }
  }

  const hasFigure = NUMERIC_OUTCOME.test(combined);
  const evidenced = input.declaredClaims.filter((claim) => !claim.requiresEvidence || claim.evidenceRefs.length > 0);
  const unevidenced = input.declaredClaims.filter((claim) => claim.requiresEvidence && claim.evidenceRefs.length === 0);

  for (const claim of unevidenced) {
    findings.push({
      check: "claim.requires_evidence",
      severity: "error",
      message: `El claim "${claim.text}" requiere evidencia y no tiene ninguna referencia asociada.`,
      platform: input.platform,
    });
  }

  if (hasFigure && !input.declaredClaims.length) {
    findings.push({
      check: "claim.undeclared_figure",
      severity: "error",
      message: "La copy incluye una cifra concreta pero el brief no declara ningún claim ni evidencia.",
      platform: input.platform,
    });
  }

  if (input.hookImpliesClaim && !evidenced.length) {
    findings.push({
      check: "claim.hook_without_evidence",
      severity: "warning",
      message: "El tipo de hook elegido afirma un resultado; conviene respaldarlo con evidencia declarada.",
      platform: input.platform,
    });
  }

  return findings;
}

/** Exported for tests and for a future evidence store to reuse the same detection. */
export function looksLikeMeasurableClaim(text: string) {
  return NUMERIC_OUTCOME.test(text) || GUARANTEE_TERMS.some((term) => lower(text).includes(term));
}
