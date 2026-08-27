import type { z } from "zod";

// Prompt templates are versioned code, not strings pasted into a call site. A template
// declares who it speaks for, what context it needs, and what structure it must return, so
// it can be tested and swapped without touching the runtime around it.

export const PROMPT_ROLES = ["copywriter", "creative", "platform", "reviewer"] as const;
export type PromptRole = (typeof PROMPT_ROLES)[number];

export interface PromptTemplate<Context, Output> {
  /** Stable dotted id, e.g. `copywriter.short_video`. Never reused for a different job. */
  id: string;
  /** Incremented on any change to instructions or output shape. */
  version: number;
  role: PromptRole;
  /** The schema the provider's output must satisfy. Enforced, not suggested. */
  outputSchema: z.ZodType<Output>;
  /** Provider-neutral system framing. No vendor names, no vendor-specific syntax. */
  system: string;
  /** Builds the user turn from structured context. Never string-concatenated at call sites. */
  build(context: Context): string;
}

export function templateKey(template: PromptTemplate<unknown, unknown>) {
  return `${template.id}.v${template.version}`;
}

/** Renders structured context as a stable, diffable block the template can embed. */
export function contextBlock(fields: Record<string, unknown>) {
  return Object.entries(fields)
    .filter(([, value]) => value !== undefined && value !== null && value !== "")
    .map(([key, value]) => `${key}: ${Array.isArray(value) ? value.join(" | ") : String(value)}`)
    .join("\n");
}

export const STRUCTURED_OUTPUT_INSTRUCTION =
  "Respondé únicamente con un objeto JSON válido que cumpla el esquema indicado. Sin texto adicional, sin explicación del razonamiento y sin bloque de código.";
