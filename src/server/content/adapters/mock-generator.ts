import type { AdaptContext } from "./types";
import { draftsFor, getAdapter } from "./index";
import type { PlatformContentVariant } from "../schemas/variant";

// Deterministic generator for tests, fixtures and previews. Same input, same output, no
// provider call and no randomness.
//
// Everything it returns is marked `generatedBy: "mock"` and carries an explicit metadata
// banner, so a mock draft can never be mistaken for model output anywhere downstream. The
// UI layer that eventually renders content must refuse to present these as AI-generated.

export const MOCK_NOTICE = "MOCK — contenido determinístico de prueba, no generado por IA";

function markAsMock(variant: PlatformContentVariant): PlatformContentVariant {
  return { ...variant, generatedBy: "mock", metadata: { ...variant.metadata, mock: MOCK_NOTICE } };
}

/** One predictable native variant for a single platform. */
export function generateMockVariant(platform: string, context: AdaptContext): PlatformContentVariant {
  return markAsMock(getAdapter(platform).draft(context));
}

/** One predictable native variant per platform the concept targets. */
export function generateMockVariants(context: AdaptContext): PlatformContentVariant[] {
  return draftsFor(context).map(markAsMock);
}

export function isMockContent(variant: PlatformContentVariant) {
  return variant.generatedBy === "mock";
}
