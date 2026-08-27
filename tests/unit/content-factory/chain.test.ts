import { describe, expect, it } from "vitest";
import type { AgentContext } from "@/server/agents/contracts";
import { MockProvider } from "@/server/agents/mock-provider";
import { getAdapter } from "@/server/content/adapters";
import { evaluateContent } from "@/server/content/quality/evaluator";
import { checkDuplication } from "@/server/content/quality/duplication";
import { supportsFormat } from "@/server/content/platforms";
import { contentConceptSchema } from "@/server/content/schemas/concept";
import { contentCopyOutputSchema, contentPlanOutputSchema, creativeReviewOutputSchema } from "@/server/content-factory/schemas";
import { contentTypeForPillar, planContent, type ContentPlanTaskInput } from "@/server/content-factory/mock-content";
import type { BrandContext } from "@/server/content/schemas/brief";

const brand: BrandContext = {
  name: "Northwind",
  toneOfVoice: "Claro, experto y cercano",
  personality: ["directa"],
  preferredWords: ["equipo", "proceso"],
  forbiddenWords: ["revolucionario"],
  forbiddenClaims: ["resultados garantizados"],
  informalityCeiling: "conversational",
  visualInstructions: "Paleta sobria, sin stock genérico.",
};

const planInput: ContentPlanTaskInput = {
  campaignId: "5e329d3a-65a1-49a4-90b3-d50ee3eee1c6",
  strategyVersion: 1,
  campaignName: "Activación Q1",
  objective: "awareness",
  objectiveTitle: "Aumentar registros calificados",
  durationWeeks: 4,
  maxPieces: 12,
  audiencePersona: "Responsable de marketing en una empresa B2B de entre diez y cincuenta personas",
  audienceProblem: "Su equipo dedica gran parte de la semana a tareas repetitivas que nadie documentó nunca.",
  audiencePromise: "Con el proceso escrito esas tareas se vuelven delegables y el equipo recupera tiempo.",
  pillars: [
    { name: "Educación", weight: 30 },
    { name: "Problema", weight: 25 },
    { name: "Producto", weight: 20 },
    { name: "Autoridad", weight: 15 },
    { name: "Prueba social", weight: 10 },
  ],
  angles: [
    { name: "Proceso antes que herramienta", description: "Antes de automatizar hay que poder describir la tarea en voz alta de principio a fin." },
    { name: "El costo invisible", description: "El trabajo manual no documentado cuesta más en continuidad que en horas." },
  ],
  channels: [
    { channel: "tiktok", enabled: true, priority: 3, formats: ["short_video"], publishingFrequency: "semanal" },
    { channel: "linkedin", enabled: true, priority: 2, formats: ["text_post"], publishingFrequency: "semanal" },
    { channel: "instagram", enabled: true, priority: 1, formats: ["carousel"], publishingFrequency: "semanal" },
  ],
  brand,
  constraints: ["Evitar jerga de producto."],
};

function contextFor(type: string, input: Record<string, unknown>): AgentContext {
  return {
    organizationId: "org-1",
    agent: { id: "agent-1", role: "content_strategist", displayName: "Bruno", autonomyLevel: 1, configuration: {} },
    task: {
      id: "task-1", organization_id: "org-1", title: "t", description: null, type, status: "running",
      priority: "medium", assigned_agent_id: "agent-1", objective_id: null, parent_task_id: null,
      source_event_id: null, requires_approval: false, risk_level: "low", attempt_count: 1, max_attempts: 3,
      input, idempotency_key: null,
    } as AgentContext["task"],
    correlationId: "corr-1",
  };
}

describe("pillar to editorial intent", () => {
  it("maps campaign pillar names onto the content type taxonomy", () => {
    expect(contentTypeForPillar("Educación")).toBe("educational");
    expect(contentTypeForPillar("Problema")).toBe("problem_awareness");
    expect(contentTypeForPillar("Producto")).toBe("product");
    expect(contentTypeForPillar("Prueba social")).toBe("social_proof");
  });
  it("falls back to educational rather than guessing", () => {
    expect(contentTypeForPillar("Pilar sin nombre reconocible")).toBe("educational");
  });
});

describe("Bruno content plan", () => {
  it("produces schema-valid concepts from the campaign's own configuration", () => {
    const { concepts } = planContent(planInput);
    expect(concepts.length).toBeGreaterThan(0);
    for (const concept of concepts) {
      const parsed = contentConceptSchema.safeParse(concept);
      expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    }
  });

  it("derives volume from the campaign rather than a hardcoded mix", () => {
    const smaller = planContent({ ...planInput, durationWeeks: 2 });
    const larger = planContent({ ...planInput, durationWeeks: 4 });
    expect(larger.concepts.length).toBeGreaterThan(smaller.concepts.length);
  });

  it("respects the pillar weights across the plan", () => {
    const { concepts } = planContent({ ...planInput, maxPieces: 100 });
    const byPillar = concepts.reduce<Record<string, number>>((acc, concept) => {
      acc[concept.pillar] = (acc[concept.pillar] ?? 0) + 1;
      return acc;
    }, {});
    expect(byPillar["Educación"]).toBeGreaterThan(byPillar["Prueba social"]);
  });

  it("only plans formats the target platform supports", () => {
    for (const concept of planContent(planInput).concepts) {
      expect(supportsFormat(concept.platforms[0], concept.format)).toBe(true);
    }
  });

  it("is deterministic", () => {
    expect(planContent(planInput).concepts).toEqual(planContent(planInput).concepts);
  });
});

describe("mock provider content chain", () => {
  const provider = new MockProvider();

  it("runs content.plan and returns a valid plan output", async () => {
    const result = await provider.run(contextFor("content.plan", planInput as unknown as Record<string, unknown>));
    const parsed = contentPlanOutputSchema.safeParse(result.output);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data!.provider).toBe("mock");
  });

  it("runs content.copy and returns a native variant for the briefed platform", async () => {
    const { concepts } = planContent(planInput);
    const concept = concepts.find((item) => item.platforms[0] === "tiktok")!;
    const brief = getAdapter("tiktok").brief({ concept, brand, campaign: { campaignId: planInput.campaignId, name: planInput.campaignName, objective: "awareness" } });
    const result = await provider.run(contextFor("content.copy", {
      contentItemId: "item-1", conceptId: concept.conceptId, version: 1, brief, concept,
      campaignObjective: "awareness", campaignId: planInput.campaignId, campaignName: planInput.campaignName,
    }));
    const parsed = contentCopyOutputSchema.safeParse(result.output);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    expect(parsed.data!.variant.platform).toBe("tiktok");
    expect(parsed.data!.variant.generatedBy).toBe("mock");
  });

  it("offers hook alternatives with a user-facing rationale and a risk", async () => {
    const { concepts } = planContent(planInput);
    const concept = concepts.find((item) => item.platforms[0] === "linkedin")!;
    const brief = getAdapter("linkedin").brief({ concept, brand, campaign: { campaignId: planInput.campaignId, name: planInput.campaignName, objective: "awareness" } });
    const result = await provider.run(contextFor("content.copy", {
      contentItemId: "item-2", conceptId: concept.conceptId, version: 1, brief, concept,
      campaignObjective: "awareness", campaignId: planInput.campaignId, campaignName: planInput.campaignName,
    }));
    const parsed = contentCopyOutputSchema.parse(result.output);
    expect(parsed.hookVariants!.length).toBeGreaterThanOrEqual(2);
    for (const hook of parsed.hookVariants!) {
      expect(hook.rationale.length).toBeGreaterThan(0);
      expect(hook.risk.length).toBeGreaterThan(0);
      expect(hook.rationale).not.toMatch(/paso a paso|chain of thought/i);
    }
  });

  it("runs content.creative_review and returns direction without rewriting the copy", async () => {
    const { concepts } = planContent(planInput);
    const concept = concepts.find((item) => item.platforms[0] === "instagram")!;
    const brief = getAdapter("instagram").brief({ concept, brand, campaign: { campaignId: planInput.campaignId, name: planInput.campaignName, objective: "awareness" } });
    const result = await provider.run(contextFor("content.creative_review", {
      contentItemId: "item-3", version: 1, platform: "instagram", format: brief.format, brief,
    }));
    const parsed = creativeReviewOutputSchema.safeParse(result.output);
    expect(parsed.success, JSON.stringify(parsed.error?.issues)).toBe(true);
    // The schema has no field for copy, so Emilia structurally cannot return a rewrite.
    expect(Object.keys(parsed.data!)).not.toContain("variant");
    expect(parsed.data!.visualDirection.length).toBeGreaterThan(0);
  });

  it("leaves campaign task types untouched", async () => {
    const result = await provider.run(contextFor("campaign.research", { campaignId: "c", strategyVersion: 1 }));
    expect(result.summary).toMatch(/Mateo/);
  });
});

describe("quality across the produced set", () => {
  const campaign = { campaignId: planInput.campaignId, name: planInput.campaignName, objective: "awareness" as const };

  it("passes the deterministic gate for every planned piece", () => {
    const { concepts } = planContent(planInput);
    for (const concept of concepts.slice(0, 6)) {
      const platform = concept.platforms[0];
      const adapter = getAdapter(platform);
      const context = { concept, brand, campaign };
      const review = evaluateContent({ items: [{ brief: adapter.brief(context), variant: adapter.draft(context) }] });
      expect(review.errors, `${platform}: ${JSON.stringify(review.errors)}`).toEqual([]);
    }
  });

  it("keeps the variants of one idea differentiated across platforms", () => {
    const { concepts } = planContent(planInput);
    const concept = concepts[0];
    const variants = (["instagram", "tiktok", "linkedin"] as const).map((platform) =>
      getAdapter(platform).draft({ concept: { ...concept, platforms: [platform] }, brand, campaign }),
    );
    const findings = checkDuplication(variants);
    expect(findings.filter((finding) => finding.severity === "error")).toEqual([]);
  });
});
