import { describe, expect, it } from "vitest";
import { PROMPT_TEMPLATES, copywriterHooksTemplate, copywriterVariantTemplate, creativeReviewTemplate } from "@/server/content/prompts/templates";
import { contextBlock, templateKey } from "@/server/content/prompts/types";
import { EDITORIAL_CHAIN, clara, emilia, bruno } from "@/server/content/roles";
import { briefsFor } from "@/server/content/adapters";
import { context } from "../../fixtures/content/base";

const brief = briefsFor(context).find((item) => item.platform === "tiktok")!;

const VENDORS = ["claude", "anthropic", "openai", "gpt", "gemini", "llama", "mistral"];

/** Whole-word check: "llamadas" must not read as a mention of "llama". */
function wordsIn(text: string) {
  return new Set(text.toLowerCase().match(/[a-z]+/g) ?? []);
}

describe("prompt templates", () => {
  it("gives every template a stable id, a version and a role", () => {
    for (const template of PROMPT_TEMPLATES) {
      expect(template.id).toMatch(/^[a-z_]+\.[a-z_]+$/);
      expect(template.version).toBeGreaterThanOrEqual(1);
      expect(["copywriter", "creative", "platform", "reviewer"]).toContain(template.role);
      expect(templateKey(template)).toBe(`${template.id}.v${template.version}`);
    }
  });
  it("never reuses an id for a different job", () => {
    const ids = PROMPT_TEMPLATES.map((template) => template.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
  it("stays provider neutral", () => {
    for (const template of PROMPT_TEMPLATES) {
      const words = wordsIn(`${template.system} ${template.build(brief)}`);
      for (const vendor of VENDORS) expect(words.has(vendor), `${template.id} menciona ${vendor}`).toBe(false);
    }
  });
  it("demands structured output on every template", () => {
    for (const template of PROMPT_TEMPLATES) {
      expect(template.system, template.id).toMatch(/JSON/);
      expect(template.outputSchema).toBeDefined();
    }
  });
  it("forbids performance promises where copy is written", () => {
    for (const template of PROMPT_TEMPLATES) {
      if (template.role === "copywriter" || template.role === "platform") {
        expect(template.system.toLowerCase(), template.id).toMatch(/no prometas/);
      }
    }
  });
  it("forbids exposing a reasoning trace where a rationale is requested", () => {
    expect(copywriterHooksTemplate.system).toMatch(/nunca una cadena de razonamiento/i);
  });
  it("builds the user turn from structured context rather than pasted prose", () => {
    const built = copywriterVariantTemplate.build(brief);
    expect(built).toContain("plataforma: tiktok");
    expect(built).toContain("formato: short_video");
    expect(built).toContain(`accion_deseada: ${brief.desiredAction}`);
  });
  it("carries the platform playbook limits into the prompt", () => {
    const built = copywriterVariantTemplate.build(brief);
    expect(built).toMatch(/hook_max_palabras: \d+/);
    expect(built).toMatch(/caption_max: \d+/);
  });
  it("passes brand prohibitions to the writer", () => {
    const built = copywriterVariantTemplate.build(brief);
    expect(built).toContain("palabras_prohibidas: revolucionario");
    expect(built).toContain("claims_prohibidos: resultados garantizados");
  });
  it("gives the creative reviewer the brand visual instructions", () => {
    expect(creativeReviewTemplate.build(brief)).toContain("instrucciones_visuales_de_marca:");
  });
  it("omits empty context fields instead of sending blanks", () => {
    expect(contextBlock({ a: "1", b: "", c: undefined, d: null })).toBe("a: 1");
  });
});

describe("editorial roles", () => {
  it("runs the chain strategist, copywriter, creative director", () => {
    expect(EDITORIAL_CHAIN).toEqual(["content_strategist", "copywriter", "creative_director"]);
  });
  it("keys every role on the stable M01 role rather than the display name", () => {
    expect(bruno.role).toBe("content_strategist");
    expect(clara.role).toBe("copywriter");
    expect(emilia.role).toBe("creative_director");
  });
  it("keeps strategy decisions away from the copywriter", () => {
    const text = clara.doesNotDecide.join(" ").toLowerCase();
    for (const term of ["business strategy", "campaign objective", "budget", "channel selection"]) expect(text).toContain(term);
  });
  it("stops the creative director from rewriting the copy", () => {
    expect(emilia.doesNotDecide.join(" ")).toMatch(/rather than rewriting/i);
    expect(emilia.owns.join(" ")).toMatch(/visual direction/i);
  });
  it("connects the chain through its contracts", () => {
    expect(bruno.produces).toContain("ContentBrief");
    expect(clara.consumes).toBe("ContentBrief");
    expect(emilia.consumes).toContain("PlatformContentVariant");
  });
});
