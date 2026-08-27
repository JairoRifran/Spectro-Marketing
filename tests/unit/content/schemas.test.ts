import { describe, expect, it } from "vitest";
import { z } from "zod";
import { contentConceptSchema } from "@/server/content/schemas/concept";
import { contentBriefSchema, contentPlanInputSchema } from "@/server/content/schemas/brief";
import { carouselSchema, shortVideoScriptSchema, storySequenceSchema, textPostSchema } from "@/server/content/schemas/formats";
import { hookVariantSetSchema, platformContentVariantSchema } from "@/server/content/schemas/variant";
import { contentExplanationSchema, contentReviewResultSchema } from "@/server/content/schemas/review";
import { contentLineageSchema, lineageIsOrdered, nextStage } from "@/server/content/schemas/lineage";
import { parseStructuredOutput, requireStructuredOutput } from "@/server/content/structured-output";
import { briefsFor, draftsFor } from "@/server/content/adapters";
import { concept, context } from "../../fixtures/content/base";

describe("content schemas", () => {
  it("accepts the reference concept", () => {
    expect(contentConceptSchema.safeParse(concept).success).toBe(true);
  });
  it("requires a conceptId that can carry identity across variants", () => {
    expect(contentConceptSchema.safeParse({ ...concept, conceptId: "42" }).success).toBe(false);
    expect(contentConceptSchema.safeParse({ ...concept, conceptId: "CONCEPT-42" }).success).toBe(true);
  });
  it("requires at least one platform on a concept", () => {
    expect(contentConceptSchema.safeParse({ ...concept, platforms: [] }).success).toBe(false);
  });
  it("accepts every generated brief and variant", () => {
    for (const brief of briefsFor(context)) expect(contentBriefSchema.safeParse(brief).success).toBe(true);
    for (const variant of draftsFor(context)) expect(platformContentVariantSchema.safeParse(variant).success).toBe(true);
  });
  it("rejects a variant whose detail does not match its declared shape", () => {
    const variant = draftsFor(context).find((item) => item.detail.shape === "video")!;
    const broken = { ...variant, detail: { shape: "video", carousel: {} } };
    expect(platformContentVariantSchema.safeParse(broken).success).toBe(false);
  });
  it("validates the Bruno contract the factory consumes", () => {
    const plan = {
      campaignId: "CAMP-1",
      campaign: { name: "Activación", objective: "awareness", summary: "Resumen de campaña suficientemente largo." },
      pillars: ["Automatización"],
      angles: ["Proceso antes que herramienta"],
      audience: { persona: "Head of Marketing", problem: "Tareas repetitivas sin documentar en el equipo." },
      channels: ["instagram", "linkedin"],
      contentMix: { educational: 4, product: 1 },
      constraints: [],
    };
    expect(contentPlanInputSchema.safeParse(plan).success).toBe(true);
    expect(contentPlanInputSchema.safeParse({ ...plan, channels: [] }).success).toBe(false);
  });
});

describe("format schemas", () => {
  it("requires a video script to have at least one beat and one scene", () => {
    const base = { hook: "h", setup: "s", beats: ["b"], payoff: "p", cta: "c", estimatedDurationSeconds: 30, onScreenText: [], scenes: [{ durationSeconds: 5, visual: "v" }], shotNotes: [] };
    expect(shortVideoScriptSchema.safeParse(base).success).toBe(true);
    expect(shortVideoScriptSchema.safeParse({ ...base, beats: [] }).success).toBe(false);
    expect(shortVideoScriptSchema.safeParse({ ...base, scenes: [] }).success).toBe(false);
  });
  it("bounds carousel length", () => {
    const slide = { headline: "h", visualNote: "n" };
    expect(carouselSchema.safeParse({ cover: slide, slides: [slide], ctaSlide: slide, caption: "c", visualDirection: "v" }).success).toBe(true);
    expect(carouselSchema.safeParse({ cover: slide, slides: Array(13).fill(slide), ctaSlide: slide, caption: "c", visualDirection: "v" }).success).toBe(false);
  });
  it("does not assume a story sequence is always four frames", () => {
    const frame = { role: "hook", text: "t", visualNote: "n", durationSeconds: 5 };
    expect(storySequenceSchema.safeParse({ frames: [frame, { ...frame, role: "cta" }], visualDirection: "v" }).success).toBe(true);
    expect(storySequenceSchema.safeParse({ frames: Array(6).fill(frame), visualDirection: "v" }).success).toBe(true);
    expect(storySequenceSchema.safeParse({ frames: [frame], visualDirection: "v" }).success).toBe(false);
  });
  it("keeps a text post to hook, body and cta with editorial metadata", () => {
    expect(textPostSchema.safeParse({ hook: "h", body: "b", cta: "c" }).success).toBe(true);
  });
  it("allows only two or three hook options", () => {
    const hook = { label: "A", text: "t", type: "problem", rationale: "r", risk: "k" };
    expect(hookVariantSetSchema.safeParse([hook]).success).toBe(false);
    expect(hookVariantSetSchema.safeParse([hook, { ...hook, label: "B" }]).success).toBe(true);
    expect(hookVariantSetSchema.safeParse([hook, { ...hook, label: "B" }, { ...hook, label: "C" }, { ...hook, label: "A" }]).success).toBe(false);
  });
});

describe("review and explainability", () => {
  it("carries a passed-over-total score rather than a performance estimate", () => {
    const result = { passed: true, errors: [], warnings: [], brandIssues: [], platformIssues: [], claimIssues: [], recommendations: [], score: { passed: 9, total: 11 } };
    expect(contentReviewResultSchema.safeParse(result).success).toBe(true);
  });
  it("explains a piece without a reasoning trace", () => {
    const explanation = { conceptId: "CONCEPT-42", campaignId: "CAMP-1", objective: "awareness", pillar: "p", angle: "a", audience: "aud", platform: "tiktok", format: "short_video", contentType: "educational", agent: "clara", strategyReason: "Encaja con el pilar y la audiencia." };
    expect(contentExplanationSchema.safeParse(explanation).success).toBe(true);
  });
});

describe("content lineage", () => {
  it("models the full chain without creating a table", () => {
    const lineage = {
      conceptId: "CONCEPT-42",
      campaignId: "CAMP-1",
      nodes: [
        { stage: "campaign", ref: "CAMP-1" },
        { stage: "concept", ref: "CONCEPT-42" },
        { stage: "brief", ref: "BRIEF-1", platform: "tiktok" },
        { stage: "variant", ref: "VAR-1", platform: "tiktok" },
        { stage: "review", ref: "REV-1", platform: "tiktok" },
        { stage: "approved", ref: "APP-1", platform: "tiktok" },
      ],
    };
    expect(contentLineageSchema.safeParse(lineage).success).toBe(true);
    expect(lineageIsOrdered(lineage.nodes as never)).toBe(true);
  });
  it("detects a chain that moves backwards", () => {
    expect(lineageIsOrdered([{ stage: "variant", ref: "a" }, { stage: "concept", ref: "b" }] as never)).toBe(false);
  });
  it("knows the next stage and where the chain ends", () => {
    expect(nextStage("concept")).toBe("brief");
    expect(nextStage("approved")).toBeNull();
  });
});

describe("structured output", () => {
  const schema = z.object({ hook: z.string().min(1) });

  it("rejects text that is not JSON", () => {
    const result = parseStructuredOutput(schema, "Claro, acá va tu hook:");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toBe("unparseable");
  });
  it("rejects JSON that does not match the schema", () => {
    const result = parseStructuredOutput(schema, JSON.stringify({ hook: "" }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.reason).toBe("invalid_structure");
      expect(result.issues.length).toBeGreaterThan(0);
    }
  });
  it("unwraps a fenced code block rather than failing on it", () => {
    const result = parseStructuredOutput(schema, "```json\n{\"hook\":\"Nadie te avisa esto\"}\n```");
    expect(result.ok).toBe(true);
  });
  it("raises a retryable typed error when a caller cannot continue", () => {
    expect(() => requireStructuredOutput(schema, "not json")).toThrowError(/no se pudo interpretar/i);
    try {
      requireStructuredOutput(schema, "not json");
    } catch (error) {
      expect((error as { retryable: boolean }).retryable).toBe(true);
      expect((error as { code: string }).code).toBe("provider_output_unparseable");
    }
  });
  it("returns the validated value on success", () => {
    expect(requireStructuredOutput(schema, JSON.stringify({ hook: "ok" }))).toEqual({ hook: "ok" });
  });
});
