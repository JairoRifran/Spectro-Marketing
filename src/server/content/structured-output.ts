import type { z } from "zod";
import { DomainError } from "@/server/errors";

// Every future model output crosses this boundary. Nothing downstream ever sees raw model
// text: it is parsed, validated against a schema, and turned into either a typed value or a
// typed failure. `JSON.parse` followed by trust is not available here by construction.

export type StructuredFailureReason = "unparseable" | "invalid_structure";

export type StructuredResult<T> =
  | { ok: true; value: T }
  | { ok: false; reason: StructuredFailureReason; issues: string[]; raw: string };

function extractJson(raw: string) {
  const trimmed = raw.trim();
  // Providers commonly wrap JSON in a fenced block; unwrap it rather than failing the parse.
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/);
  return fenced ? fenced[1] : trimmed;
}

export function parseStructuredOutput<T>(schema: z.ZodType<T>, raw: string): StructuredResult<T> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(extractJson(raw));
  } catch {
    return { ok: false, reason: "unparseable", issues: ["La respuesta no es JSON válido."], raw };
  }

  const result = schema.safeParse(parsed);
  if (!result.success) {
    return {
      ok: false,
      reason: "invalid_structure",
      issues: result.error.issues.map((issue) => `${issue.path.join(".") || "<root>"}: ${issue.message}`),
      raw,
    };
  }
  return { ok: true, value: result.data };
}

/**
 * Turns a structured failure into the runtime's error vocabulary.
 *
 * A malformed structure is retryable — the same prompt can produce valid output on a second
 * attempt. A transport or provider fault is the provider's own concern and is mapped by the
 * provider implementation, not here.
 */
export function structuredFailureToError(failure: Extract<StructuredResult<unknown>, { ok: false }>) {
  return new DomainError(
    "validation",
    failure.reason === "unparseable"
      ? "El proveedor devolvió una respuesta que no se pudo interpretar."
      : `El proveedor devolvió una estructura inválida: ${failure.issues.slice(0, 3).join("; ")}`,
    failure.reason === "unparseable" ? "provider_output_unparseable" : "provider_output_invalid",
    true,
  );
}

/** Parse or raise. Use where a caller cannot meaningfully continue without the value. */
export function requireStructuredOutput<T>(schema: z.ZodType<T>, raw: string): T {
  const result = parseStructuredOutput(schema, raw);
  if (result.ok) return result.value;
  throw structuredFailureToError(result);
}
