import type { ContentConcept } from "../schemas/concept";
import { buildBrief, buildDraft, clampWords, hookBudget, resolveFormat } from "./base";
import type { AdaptContext, PlatformAdapter } from "./types";

// Five adapters, one per supported platform. Each writes from its own playbook rather than
// reshaping a shared string, which is the whole point: the drafts below are deliberately
// different in structure, length and register, not the same sentence with a new label.
//
// All draft copy here is deterministic scaffolding for tests and previews. It is marked as
// mock by buildDraft and must never be presented as model output.

function persona(context: AdaptContext) {
  return context.concept.audience.persona;
}

export const instagramAdapter: PlatformAdapter = {
  platform: "instagram",
  chooseFormat: (concept: ContentConcept) => resolveFormat("instagram", ["carousel", "reel"], concept.format),
  brief: (context) => buildBrief("instagram", instagramAdapter.chooseFormat(context.concept), context),
  draft(context) {
    const format = this.chooseFormat(context.concept);
    const hook = clampWords(context.concept.angle, hookBudget("instagram"));
    const slides = [
      { headline: context.concept.audience.problem.slice(0, 90), body: context.concept.coreIdea, visualNote: "Composición limpia, un concepto por lámina." },
      { headline: context.concept.pillar, body: context.concept.audience.promise, visualNote: "Mismo sistema tipográfico que la portada." },
    ];
    const caption = `${context.concept.audience.problem}\n\n${context.concept.coreIdea}\n\nGuardalo para tenerlo a mano cuando lo necesites.`;
    return buildDraft("instagram", format, context, {
      hook,
      body: context.concept.coreIdea,
      caption,
      cta: "Guardá esta pieza para volver a ella.",
      visualDirection: "Sistema visual consistente en todas las láminas; portada legible en miniatura.",
      detail: format === "carousel"
        ? { shape: "carousel", carousel: { cover: { headline: hook, visualNote: "Portada legible a 160 px." }, slides, ctaSlide: { headline: "Guardalo", body: context.concept.audience.promise, visualNote: "Cierre con marca discreta." }, caption, visualDirection: "Paleta y tipografía de marca en todas las láminas." } }
        : { shape: "video", script: { hook, setup: context.concept.audience.problem, beats: [context.concept.coreIdea], payoff: context.concept.audience.promise, cta: "Guardalo", estimatedDurationSeconds: 30, onScreenText: [hook], scenes: [{ durationSeconds: 30, visual: "Plano cenital mostrando el proceso.", onScreenText: hook }], shotNotes: [] } },
    });
  },
};

export const tiktokAdapter: PlatformAdapter = {
  platform: "tiktok",
  chooseFormat: () => "short_video",
  brief: (context) => buildBrief("tiktok", "short_video", context),
  draft(context) {
    const hook = clampWords(`Nadie te avisa esto: ${context.concept.audience.problem}`, hookBudget("tiktok"));
    const beats = [`Lo probé y esto es lo que pasó.`, context.concept.coreIdea];
    return buildDraft("tiktok", "short_video", context, {
      hook,
      body: beats.join(" "),
      caption: `${context.concept.angle} 👀`,
      cta: "Contame en comentarios si te pasa.",
      visualDirection: "Cámara en mano, sin lower thirds ni framing de marca.",
      videoDirection: "Corte visual antes del segundo 2; ritmo hablado, sin pausa inicial.",
      estimatedDurationSeconds: 32,
      onScreenText: [hook],
      detail: {
        shape: "video",
        script: {
          hook,
          setup: `Esto le pasa a ${persona(context)} todas las semanas.`,
          beats,
          payoff: context.concept.audience.promise,
          cta: "Contame en comentarios si te pasa.",
          estimatedDurationSeconds: 32,
          onScreenText: [hook],
          scenes: [
            { durationSeconds: 2, visual: "Primer plano hablando directo a cámara.", onScreenText: hook },
            { durationSeconds: 18, visual: "Pantalla compartida mostrando el proceso real.", transitionNote: "Corte seco." },
            { durationSeconds: 12, visual: "Vuelta a cámara para el cierre." },
          ],
          shotNotes: ["Sin intro de marca."],
        },
      },
    });
  },
};

export const youtubeShortsAdapter: PlatformAdapter = {
  platform: "youtube_shorts",
  chooseFormat: () => "short_video",
  brief: (context) => buildBrief("youtube_shorts", "short_video", context),
  draft(context) {
    const hook = clampWords(`Cómo resolver ${context.concept.pillar.toLowerCase()} en menos de un minuto`, hookBudget("youtube_shorts"));
    return buildDraft("youtube_shorts", "short_video", context, {
      hook,
      body: `${context.concept.coreIdea} ${context.concept.audience.promise}`,
      caption: `${context.concept.coreIdea}\n\nEn este short: el problema, el método y dónde falla.`,
      cta: "Suscribite si querés la serie completa.",
      visualDirection: "Encuadre estable, texto fuera del tercio inferior.",
      videoDirection: "Promesa explícita en los primeros 3 segundos; cierre que vuelve a la frase inicial.",
      estimatedDurationSeconds: 48,
      onScreenText: [hook],
      metadata: { title: hook, description: context.concept.coreIdea.slice(0, 300) },
      detail: {
        shape: "video",
        script: {
          hook,
          setup: context.concept.audience.problem,
          beats: [context.concept.coreIdea, "Dónde este método deja de funcionar."],
          payoff: context.concept.audience.promise,
          cta: "Suscribite si querés la serie completa.",
          estimatedDurationSeconds: 48,
          onScreenText: [hook],
          scenes: [
            { durationSeconds: 3, visual: "Promesa a cámara.", onScreenText: hook },
            { durationSeconds: 30, visual: "Demostración paso a paso en pantalla." },
            { durationSeconds: 15, visual: "Cierre con la salvedad y vuelta a la frase inicial." },
          ],
          shotNotes: [],
        },
      },
    });
  },
};

export const linkedinAdapter: PlatformAdapter = {
  platform: "linkedin",
  chooseFormat: (concept: ContentConcept) => resolveFormat("linkedin", ["text_post", "document_post"], concept.format),
  brief: (context) => buildBrief("linkedin", linkedinAdapter.chooseFormat(context.concept), context),
  draft(context) {
    const hook = clampWords(`La mayoría de los equipos trata ${context.concept.pillar.toLowerCase()} como un problema de esfuerzo. Casi nunca lo es.`, hookBudget("linkedin"));
    const body = [
      context.concept.audience.problem,
      "",
      context.concept.coreIdea,
      "",
      `Lo que cambia cuando se aborda así: ${context.concept.audience.promise}`,
      "",
      `Dónde esto no aplica: cuando el equipo todavía no tiene el proceso escrito. Ahí el problema es anterior y ninguna herramienta lo resuelve.`,
    ].join("\n");
    return buildDraft("linkedin", this.chooseFormat(context.concept), context, {
      hook,
      body,
      caption: `${hook}\n\n${body}\n\n¿Con cuál de las dos lecturas te encontrás más seguido en tu equipo?`,
      cta: "¿Con cuál de las dos lecturas te encontrás más seguido?",
      visualDirection: "Sin imagen decorativa; si hay gráfico, escala honesta y ejes rotulados.",
      detail: { shape: "text", post: { hook, body, cta: "¿Con cuál de las dos lecturas te encontrás más seguido?", readingLevel: "professional", sources: [] } },
    });
  },
};

export const facebookAdapter: PlatformAdapter = {
  platform: "facebook",
  chooseFormat: (concept: ContentConcept) => resolveFormat("facebook", ["text_post", "reel"], concept.format),
  brief: (context) => buildBrief("facebook", facebookAdapter.chooseFormat(context.concept), context),
  draft(context) {
    const format = this.chooseFormat(context.concept);
    const hook = clampWords(`Si alguna vez te pasó esto con ${context.concept.pillar.toLowerCase()}, no sos el único.`, hookBudget("facebook"));
    const body = `${context.concept.audience.problem}\n\n${context.concept.coreIdea}\n\n${context.concept.audience.promise}\n\nLo contamos completo porque es la clase de cosa que se aprende preguntando.`;
    return buildDraft("facebook", format, context, {
      hook,
      body,
      caption: `${hook}\n\n${body}\n\n¿Te pasó algo parecido? Contalo en los comentarios.`,
      cta: "Compartilo con alguien de tu equipo a quien le sirva.",
      visualDirection: "Imagen con texto legible; asumir que el caption se lee primero.",
      videoDirection: format === "reel" ? "Ritmo algo más pausado que TikTok; contexto antes de la demostración." : undefined,
      estimatedDurationSeconds: format === "reel" ? 45 : undefined,
      detail: format === "reel"
        ? { shape: "video", script: { hook, setup: context.concept.audience.problem, beats: [context.concept.coreIdea], payoff: context.concept.audience.promise, cta: "Compartilo con tu equipo", estimatedDurationSeconds: 45, onScreenText: [hook], scenes: [{ durationSeconds: 45, visual: "Explicación a cámara con contexto." }], shotNotes: [] } }
        : { shape: "text", post: { hook, body, cta: "Compartilo con alguien de tu equipo a quien le sirva.", readingLevel: "plain", sources: [] } },
    });
  },
};

export const ADAPTERS: Record<string, PlatformAdapter> = {
  instagram: instagramAdapter,
  facebook: facebookAdapter,
  tiktok: tiktokAdapter,
  youtube_shorts: youtubeShortsAdapter,
  linkedin: linkedinAdapter,
};
