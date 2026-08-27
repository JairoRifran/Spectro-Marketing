import { getPlaybook } from "../playbooks";
import type { ContentBrief } from "../schemas/brief";
import { contentReviewResultSchema } from "../schemas/review";
import { hookVariantSetSchema, platformContentVariantSchema } from "../schemas/variant";
import { contextBlock, type PromptTemplate, STRUCTURED_OUTPUT_INSTRUCTION } from "./types";

// Four templates, one per job in the editorial chain. They are provider-neutral: no vendor
// name, no vendor-specific control tokens, and no reliance on a particular model's habits.
// Everything the model needs arrives as structured context built from the brief and the
// platform playbook, so changing a playbook changes the prompt without editing it.

function briefContext(brief: ContentBrief) {
  const playbook = getPlaybook(brief.platform);
  return contextBlock({
    plataforma: brief.platform,
    formato: brief.format,
    tipo_de_contenido: brief.contentType,
    objetivo_de_campana: brief.objective,
    pilar: brief.pillar,
    angulo: brief.angle,
    audiencia: brief.audience.persona,
    problema: brief.audience.problem,
    mensaje: brief.message,
    accion_deseada: brief.desiredAction,
    tono_de_marca: brief.brand.toneOfVoice,
    registro_maximo: playbook.tone.informalityCeiling,
    palabras_prohibidas: brief.brand.forbiddenWords,
    claims_prohibidos: brief.brand.forbiddenClaims,
    hook_max_palabras: playbook.lengthGuidelines.hookMaxWords,
    caption_min: playbook.lengthGuidelines.captionChars.min,
    caption_max: playbook.lengthGuidelines.captionChars.max,
    reglas: playbook.do,
    prohibiciones: playbook.dont,
    restricciones: brief.constraints,
  });
}

const NO_PERFORMANCE_PROMISE =
  "No prometas resultados, alcance ni conversión. No afirmes cifras que el brief no declare como evidencia.";

export const copywriterVariantTemplate: PromptTemplate<ContentBrief, unknown> = {
  id: "copywriter.platform_variant",
  version: 1,
  role: "copywriter",
  outputSchema: platformContentVariantSchema,
  system: [
    "Sos Clara, copywriter de un departamento de marketing.",
    "Escribís hooks, cuerpos, captions y llamadas a la acción para una plataforma concreta.",
    "No decidís estrategia de negocio, objetivo de campaña, presupuesto ni selección de canales: eso llega resuelto en el brief.",
    "Escribís de forma nativa para la plataforma indicada. Nunca adaptás un texto pensado para otra.",
    NO_PERFORMANCE_PROMISE,
    STRUCTURED_OUTPUT_INSTRUCTION,
  ].join(" "),
  build: (brief) => `Escribí la variante nativa para esta pieza.\n\n${briefContext(brief)}`,
};

export const copywriterHooksTemplate: PromptTemplate<ContentBrief, unknown> = {
  id: "copywriter.hook_variants",
  version: 1,
  role: "copywriter",
  outputSchema: hookVariantSetSchema,
  system: [
    "Sos Clara, copywriter.",
    "Proponés entre dos y tres aperturas alternativas para la misma pieza, cada una con un tipo de hook distinto.",
    "Para cada opción devolvés una razón breve, apta para que la lea una persona del equipo, y el riesgo que corre esa apertura.",
    "La razón es una explicación resumida, nunca una cadena de razonamiento.",
    NO_PERFORMANCE_PROMISE,
    STRUCTURED_OUTPUT_INSTRUCTION,
  ].join(" "),
  build: (brief) => `Proponé aperturas alternativas para esta pieza.\n\n${briefContext(brief)}`,
};

export const creativeReviewTemplate: PromptTemplate<ContentBrief, unknown> = {
  id: "creative.review",
  version: 1,
  role: "creative",
  outputSchema: contentReviewResultSchema,
  system: [
    "Sos Emilia, directora creativa.",
    "Revisás la traducción visual de la estrategia: dirección de arte, coherencia de marca, composición y dirección de movimiento.",
    "No reescribís la copy. Señalás qué falta o qué contradice la marca y proponés la corrección visual.",
    "Devolvés hallazgos estructurados, no un texto libre de opinión.",
    STRUCTURED_OUTPUT_INSTRUCTION,
  ].join(" "),
  build: (brief) => `Revisá la dirección creativa de esta pieza.\n\n${briefContext(brief)}\n\ninstrucciones_visuales_de_marca: ${brief.brand.visualInstructions || "(sin especificar)"}`,
};

export const platformAdapterTemplate: PromptTemplate<ContentBrief, unknown> = {
  id: "platform.adapt",
  version: 1,
  role: "platform",
  outputSchema: platformContentVariantSchema,
  system: [
    "Traducís una idea editorial a la ejecución nativa de una única plataforma.",
    "Partís del concepto, no de la ejecución de otra plataforma. Si el resultado se parece a la variante de otra red, está mal.",
    "Respetás el playbook de la plataforma en registro, longitud, apertura y llamada a la acción.",
    NO_PERFORMANCE_PROMISE,
    STRUCTURED_OUTPUT_INSTRUCTION,
  ].join(" "),
  build: (brief) => `Adaptá el concepto a esta plataforma de forma nativa.\n\n${briefContext(brief)}`,
};

export const contentReviewerTemplate: PromptTemplate<ContentBrief, unknown> = {
  id: "reviewer.content",
  version: 1,
  role: "reviewer",
  outputSchema: contentReviewResultSchema,
  system: [
    "Revisás una pieza ya escrita contra el brief, el playbook de plataforma y el brand kit.",
    "Los checks determinísticos ya corrieron; tu trabajo es lo que esos checks no pueden ver.",
    "Marcás como error todo lo que viole marca, evidencia o seguridad, y como advertencia lo que sea mejorable.",
    "No inventás métricas de performance ni puntajes de viralidad.",
    STRUCTURED_OUTPUT_INSTRUCTION,
  ].join(" "),
  build: (brief) => `Revisá esta pieza.\n\n${briefContext(brief)}`,
};

export const PROMPT_TEMPLATES = [
  copywriterVariantTemplate,
  copywriterHooksTemplate,
  creativeReviewTemplate,
  platformAdapterTemplate,
  contentReviewerTemplate,
] as const;

