import type { AdaptContext, CampaignContext } from "@/server/content/adapters";
import type { BrandContext } from "@/server/content/schemas/brief";
import type { ContentConcept } from "@/server/content/schemas/concept";

// Shared fixture inputs. Deliberately realistic in length: the platform playbooks enforce
// caption ranges, so toy strings would fail checks for the wrong reason.

export const brand: BrandContext = {
  name: "Northwind",
  toneOfVoice: "Claro, experto y cercano",
  personality: ["directa", "precisa"],
  preferredWords: ["equipo", "proceso"],
  forbiddenWords: ["revolucionario"],
  forbiddenClaims: ["resultados garantizados"],
  informalityCeiling: "conversational",
  visualInstructions: "Paleta sobria, tipografía de marca, sin stock genérico.",
};

export const campaign: CampaignContext = {
  campaignId: "CAMP-2026-Q1-ACTIVACION",
  name: "Activación Q1",
  objective: "awareness",
};

export const concept: ContentConcept = {
  conceptId: "CONCEPT-42",
  title: "Cinco tareas de marketing que tu equipo podría dejar de hacer a mano",
  internalName: "automatizacion-tareas-manuales",
  pillar: "Automatización del trabajo repetitivo",
  angle: "El problema no es la falta de herramientas sino la falta de proceso escrito",
  objective: "educational",
  audience: {
    persona: "Responsable de marketing en una empresa B2B de entre diez y cincuenta personas",
    problem: "Su equipo dedica una parte enorme de la semana a tareas repetitivas que nadie documentó nunca, y cada persona las resuelve a su manera.",
    promise: "Con el proceso escrito, esas tareas se vuelven delegables y el equipo recupera tiempo para el trabajo que sí requiere criterio.",
  },
  coreIdea:
    "Antes de automatizar cualquier tarea hay que poder describirla en voz alta de principio a fin. Las tareas que no se pueden describir no están listas para automatizarse, y ese es el filtro que ahorra los proyectos que fracasan a mitad de camino.",
  hookDirection: { preferredTypes: ["problem", "mistake"], note: "Arrancar por la fricción concreta." },
  format: "short_video",
  platforms: ["instagram", "tiktok", "youtube_shorts", "linkedin", "facebook"],
  cta: "save",
  evidenceRequired: [],
  creativeNotes: ["Evitar jerga de producto."],
};

export const context: AdaptContext = { concept, brand, campaign };

export function contextWith(overrides: Partial<{ concept: ContentConcept; brand: BrandContext; campaign: CampaignContext }>): AdaptContext {
  return { concept: overrides.concept ?? concept, brand: overrides.brand ?? brand, campaign: overrides.campaign ?? campaign };
}
