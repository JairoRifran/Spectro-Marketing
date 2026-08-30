import type { ZodError } from "zod";

// Turning a validation failure into something a person can act on.
//
// Zod's own message describes the rule that was broken — "Too big: expected string to have <=160
// characters" — and never says which field broke it. On a form with a dozen inputs that is a
// puzzle, not an error, and the reader has to guess which box to shorten.
//
// So the field is named, in the words the screen uses for it rather than the ones the schema does:
// somebody looking at "Objetivo" cannot be expected to know it is `title` underneath.

const FIELD_LABELS: Record<string, string> = {
  title: "El objetivo",
  name: "El nombre de campaña",
  metric: "La métrica",
  target: "La meta",
  description: "La descripción",
  specificAudience: "La audiencia específica",
  constraints: "Las restricciones",
  platforms: "Los canales",
  objectiveId: "El objetivo",
  clientId: "El Client ID",
  clientSecret: "El Client Secret",
  accountId: "El id de página",
};

/** The first problem, said plainly and with its field named. */
export function validationMessage(error: ZodError): string {
  const issue = error.issues[0];
  if (!issue) return "Revisá los datos del formulario.";

  const path = issue.path.filter((part) => typeof part === "string") as string[];
  const label = FIELD_LABELS[path[path.length - 1] ?? ""] ?? "Un campo";

  if (issue.code === "too_big" && "maximum" in issue && typeof issue.maximum === "number") {
    return `${label} es demasiado largo: máximo ${issue.maximum} caracteres.`;
  }
  if (issue.code === "too_small" && "minimum" in issue && typeof issue.minimum === "number") {
    return issue.minimum <= 1
      ? `${label} no puede quedar vacío.`
      : `${label} es demasiado corto: mínimo ${issue.minimum} caracteres.`;
  }
  if (issue.code === "invalid_type") return `${label} tiene un valor que no corresponde.`;

  return `${label}: ${issue.message}`;
}
