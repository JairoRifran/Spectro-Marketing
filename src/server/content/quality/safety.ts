import type { Finding } from "../schemas/review";
import type { SupportedPlatform } from "../platforms";

// Editorial safety guardrails. Narrow on purpose: this is not a moderation system. It exists
// to stop the three things that would actually leak out of an autonomous content pipeline —
// credentials, internal instructions, and personal data — before a human ever sees the draft.

const SECRET_PATTERNS: Array<{ id: string; pattern: RegExp; message: string }> = [
  { id: "safety.jwt", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/, message: "La copy contiene algo con forma de token JWT." },
  { id: "safety.api_key", pattern: /\b(sk|pk|api[_-]?key|secret)[_-][A-Za-z0-9]{16,}/i, message: "La copy contiene algo con forma de clave de API." },
  { id: "safety.bearer", pattern: /\bbearer\s+[A-Za-z0-9._-]{20,}/i, message: "La copy contiene una cabecera de autorización." },
  { id: "safety.connection_string", pattern: /\b(postgres|postgresql|mysql|mongodb)(\+srv)?:\/\/\S+/i, message: "La copy contiene una cadena de conexión." },
  { id: "safety.env_var", pattern: /\b(SUPABASE_SERVICE_ROLE_KEY|CRON_SECRET|ANTHROPIC_API_KEY|OPENAI_API_KEY)\b/, message: "La copy menciona una variable de entorno server-only." },
];

const PROMPT_LEAK_PATTERNS: Array<{ id: string; pattern: RegExp; message: string }> = [
  { id: "safety.prompt_leak", pattern: /\b(system prompt|as an ai language model|you are an? (assistant|agent)|instrucciones del sistema)\b/i, message: "La copy expone instrucciones internas del sistema." },
  { id: "safety.reasoning_leak", pattern: /\b(chain of thought|paso a paso pensé|let me think step by step)\b/i, message: "La copy expone razonamiento interno." },
];

const PERSONAL_DATA_PATTERNS: Array<{ id: string; pattern: RegExp; message: string }> = [
  { id: "safety.email", pattern: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/, message: "La copy contiene una dirección de email." },
  { id: "safety.long_number", pattern: /\b\d{13,19}\b/, message: "La copy contiene una secuencia numérica con forma de documento o tarjeta." },
];

export interface SafetyCheckInput {
  texts: string[];
  platform: SupportedPlatform;
  /** A brand may legitimately publish a contact address; opt in explicitly. */
  allowContactEmail?: boolean;
}

export function checkSafety(input: SafetyCheckInput): Finding[] {
  const findings: Finding[] = [];
  const combined = input.texts.join("\n");

  for (const rule of [...SECRET_PATTERNS, ...PROMPT_LEAK_PATTERNS]) {
    if (rule.pattern.test(combined)) {
      findings.push({ check: rule.id, severity: "error", message: rule.message, platform: input.platform });
    }
  }

  for (const rule of PERSONAL_DATA_PATTERNS) {
    if (rule.id === "safety.email" && input.allowContactEmail) continue;
    if (rule.pattern.test(combined)) {
      findings.push({ check: rule.id, severity: "error", message: rule.message, platform: input.platform });
    }
  }

  return findings;
}
