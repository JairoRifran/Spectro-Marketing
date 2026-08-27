import type { PlatformContentVariant } from "../schemas/variant";
import type { Finding } from "../schemas/review";
import { textSimilarity } from "./text";

// Cross-platform duplication. This is the check that enforces the founding principle: one
// idea, several native executions — never one text pasted across five networks.
//
// Lexical similarity only, no embeddings. That is a deliberate floor rather than a
// limitation to apologise for: a copy-paste across platforms is a lexical event, and a
// warning is all this should ever produce, because the human decides what counts as too
// close for their brand.

/** Above this, two variants are the same text with cosmetic edits. */
export const DUPLICATE_THRESHOLD = 0.82;
/** Above this, they are differentiated too weakly to read as native to each platform. */
export const WEAK_DIFFERENTIATION_THRESHOLD = 0.65;

export interface VariantPair {
  a: PlatformContentVariant;
  b: PlatformContentVariant;
  similarity: number;
  hookSimilarity: number;
}

/** The audience-facing surface of a variant, which is what duplication is measured on. */
export function comparableText(variant: PlatformContentVariant) {
  return [variant.hook, variant.body, variant.caption, variant.cta].join("\n");
}

export function compareVariants(variants: PlatformContentVariant[]): VariantPair[] {
  const pairs: VariantPair[] = [];
  for (let i = 0; i < variants.length; i += 1) {
    for (let j = i + 1; j < variants.length; j += 1) {
      const a = variants[i];
      const b = variants[j];
      pairs.push({
        a,
        b,
        similarity: textSimilarity(comparableText(a), comparableText(b)),
        hookSimilarity: textSimilarity(a.hook, b.hook),
      });
    }
  }
  return pairs;
}

export function checkDuplication(variants: PlatformContentVariant[]): Finding[] {
  const findings: Finding[] = [];

  for (const pair of compareVariants(variants)) {
    const label = `${pair.a.platform} y ${pair.b.platform}`;
    if (pair.similarity >= DUPLICATE_THRESHOLD) {
      findings.push({
        check: "duplication.cross_platform",
        severity: "error",
        message: `Las variantes de ${label} son esencialmente el mismo texto (similitud ${pair.similarity.toFixed(2)}). Cada plataforma necesita una ejecución nativa.`,
        platform: pair.b.platform,
      });
    } else if (pair.similarity >= WEAK_DIFFERENTIATION_THRESHOLD) {
      findings.push({
        check: "duplication.weak_differentiation",
        severity: "warning",
        message: `Las variantes de ${label} están poco diferenciadas (similitud ${pair.similarity.toFixed(2)}).`,
        platform: pair.b.platform,
      });
    } else if (pair.hookSimilarity >= DUPLICATE_THRESHOLD) {
      // The bodies diverged but the openings did not, which is the most common way a
      // "native" set still reads as one piece repeated.
      findings.push({
        check: "duplication.repeated_hook",
        severity: "warning",
        message: `El hook se repite entre ${label} (similitud ${pair.hookSimilarity.toFixed(2)}).`,
        platform: pair.b.platform,
      });
    }
  }

  return findings;
}

/** Duplicate openings inside one platform's own set of hook options. */
export function checkDuplicateHooks(hooks: string[]): Finding[] {
  const findings: Finding[] = [];
  for (let i = 0; i < hooks.length; i += 1) {
    for (let j = i + 1; j < hooks.length; j += 1) {
      if (textSimilarity(hooks[i], hooks[j]) >= DUPLICATE_THRESHOLD) {
        findings.push({ check: "duplication.duplicate_hook", severity: "warning", message: `Las opciones de hook ${i + 1} y ${j + 1} son casi idénticas.` });
      }
    }
  }
  return findings;
}
