import { describe, expect, it } from "vitest";
import { checkBrand, effectiveInformalityCeiling } from "@/server/content/quality/brand";
import { checkClaims, looksLikeMeasurableClaim } from "@/server/content/quality/claims";
import { checkDuplicateHooks, checkDuplication } from "@/server/content/quality/duplication";
import { evaluateContent } from "@/server/content/quality/evaluator";
import { checkContentMix, summarizeMix } from "@/server/content/quality/mix";
import { checkSafety } from "@/server/content/quality/safety";
import { containsTerm, normalize, textSimilarity } from "@/server/content/quality/text";
import { getPlaybook } from "@/server/content/playbooks";
import { draftsFor } from "@/server/content/adapters";
import { brand, context } from "../../fixtures/content/base";
import {
  badTiktokCopyPaste,
  brandViolation,
  duplicateVariants,
  forbiddenClaim,
  goodLinkedinPost,
  goodTiktokScript,
  incoherentCta,
  missingCta,
  undeclaredFigure,
  unsafeContent,
} from "../../fixtures/content/scenarios";

const codes = (findings: { check: string }[]) => findings.map((finding) => finding.check);

describe("text utilities", () => {
  it("normalises accents, case and punctuation", () => {
    expect(normalize("¿Automatización, ya?")).toBe("automatizacion ya");
  });
  it("matches terms on whole words only", () => {
    expect(containsTerm("un enfoque revolucionario", "revolucionario")).toBe(true);
    expect(containsTerm("evolucionario", "revolucionario")).toBe(false);
  });
  it("scores identical text as identical and unrelated text as low", () => {
    expect(textSimilarity("hola equipo", "hola equipo")).toBe(1);
    expect(textSimilarity("automatizar procesos repetitivos", "receta de pan casero")).toBeLessThan(0.3);
  });
});

describe("brand guardrails", () => {
  it("catches a forbidden word", () => {
    const findings = checkBrand({ brand, playbook: getPlaybook("instagram"), texts: ["Un enfoque revolucionario para tu equipo"] });
    expect(codes(findings)).toContain("brand.forbidden_word");
  });
  it("catches a forbidden claim", () => {
    const findings = checkBrand({ brand, playbook: getPlaybook("linkedin"), texts: ["Ofrecemos resultados garantizados"] });
    expect(codes(findings)).toContain("brand.forbidden_claim");
  });
  it("warns when the platform allows a looser register than the brand", () => {
    const findings = checkBrand({ brand, playbook: getPlaybook("tiktok"), texts: ["texto con proceso del equipo"] });
    expect(codes(findings)).toContain("brand.register_ceiling");
  });
  it("takes the stricter of brand and platform ceiling", () => {
    expect(effectiveInformalityCeiling(brand, getPlaybook("tiktok"))).toBe("conversational");
    expect(effectiveInformalityCeiling(brand, getPlaybook("linkedin"))).toBe("professional");
  });
  it("passes clean copy that uses preferred terminology", () => {
    const findings = checkBrand({ brand, playbook: getPlaybook("linkedin"), texts: ["El equipo documenta el proceso antes de automatizarlo"] });
    expect(codes(findings)).not.toContain("brand.forbidden_word");
    expect(codes(findings)).not.toContain("brand.preferred_terminology");
  });
});

describe("claims and evidence", () => {
  it("rejects guarantee language outright", () => {
    const findings = checkClaims({ texts: ["Resultados garantizados en 30 días"], declaredClaims: [], platform: "linkedin", hookImpliesClaim: false });
    expect(codes(findings)).toContain("claim.guarantee_language");
  });
  it("rejects a figure with no declared claim behind it", () => {
    const findings = checkClaims({ texts: ["Reduce costos 70%"], declaredClaims: [], platform: "linkedin", hookImpliesClaim: false });
    expect(codes(findings)).toContain("claim.undeclared_figure");
  });
  it("rejects a declared claim with no evidence reference", () => {
    const findings = checkClaims({ texts: ["Bajamos el tiempo de respuesta"], declaredClaims: [{ text: "Bajamos el tiempo un 40%", requiresEvidence: true, evidenceRefs: [] }], platform: "linkedin", hookImpliesClaim: false });
    expect(codes(findings)).toContain("claim.requires_evidence");
  });
  it("accepts a claim that carries evidence", () => {
    const findings = checkClaims({ texts: ["Bajamos el tiempo un 40%"], declaredClaims: [{ text: "Bajamos el tiempo un 40%", requiresEvidence: true, evidenceRefs: ["estudio-interno-2026"] }], platform: "linkedin", hookImpliesClaim: true });
    expect(codes(findings)).not.toContain("claim.requires_evidence");
    expect(codes(findings)).not.toContain("claim.undeclared_figure");
  });
  it("recognises measurable claims for a future evidence store", () => {
    expect(looksLikeMeasurableClaim("reduce costos 70%")).toBe(true);
    expect(looksLikeMeasurableClaim("escribí el proceso antes de automatizar")).toBe(false);
  });
});

describe("content safety", () => {
  it("blocks credentials", () => {
    expect(codes(checkSafety({ texts: ["api_key_abcdef0123456789abcdef"], platform: "instagram" }))).toContain("safety.api_key");
  });
  it("blocks server-only environment variables", () => {
    expect(codes(checkSafety({ texts: ["usá SUPABASE_SERVICE_ROLE_KEY"], platform: "instagram" }))).toContain("safety.env_var");
  });
  it("blocks internal instruction leakage", () => {
    expect(codes(checkSafety({ texts: ["You are an assistant that writes ads"], platform: "tiktok" }))).toContain("safety.prompt_leak");
  });
  it("blocks personal data unless the brand opts in", () => {
    const texts = ["escribinos a hola@empresa.com"];
    expect(codes(checkSafety({ texts, platform: "facebook" }))).toContain("safety.email");
    expect(codes(checkSafety({ texts, platform: "facebook", allowContactEmail: true }))).not.toContain("safety.email");
  });
  it("passes clean copy", () => {
    expect(checkSafety({ texts: ["Escribí el proceso antes de automatizarlo."], platform: "linkedin" })).toEqual([]);
  });
});

describe("cross-platform duplication", () => {
  it("flags the same text published on two platforms", () => {
    expect(codes(checkDuplication(duplicateVariants))).toContain("duplication.cross_platform");
  });
  it("passes genuinely native variants", () => {
    expect(codes(checkDuplication(draftsFor(context)))).not.toContain("duplication.cross_platform");
  });
  it("flags a repeated hook even when the bodies diverge", () => {
    const [instagram, tiktok] = [draftsFor(context)[0], draftsFor(context)[1]];
    const shared = { ...tiktok, hook: instagram.hook, body: "Un cuerpo completamente distinto sobre otro asunto sin relación alguna con el anterior." };
    const findings = codes(checkDuplication([instagram, shared]));
    expect(findings.some((code) => code.startsWith("duplication."))).toBe(true);
  });
  it("flags near-duplicate hook options inside one platform", () => {
    expect(codes(checkDuplicateHooks(["Nadie te avisa esto", "Nadie te avisa esto."]))).toContain("duplication.duplicate_hook");
  });
});

describe("content mix", () => {
  it("warns on an overly promotional plan", () => {
    const types = [...Array(18).fill("conversion"), ...Array(2).fill("product")] as never;
    expect(codes(checkContentMix(types))).toContain("mix.overly_promotional");
  });
  it("warns when one type dominates", () => {
    expect(codes(checkContentMix(["educational", "educational", "educational", "educational", "product"]))).toContain("mix.single_type_dominance");
  });
  it("warns when a plan has no awareness content", () => {
    expect(codes(checkContentMix(["product", "conversion", "case_study", "comparison"]))).toContain("mix.no_awareness");
  });
  it("stays quiet on a balanced plan", () => {
    expect(checkContentMix(["educational", "problem_awareness", "case_study", "product", "storytelling", "social_proof"])).toEqual([]);
  });
  it("summarises the plan without deciding a formula", () => {
    const summary = summarizeMix(["educational", "product"]);
    expect(summary.total).toBe(2);
    expect(summary.promotionalRatio).toBe(0.5);
  });
});

describe("content quality evaluator", () => {
  it("passes a native short-form script", () => {
    const result = evaluateContent({ items: [goodTiktokScript] });
    expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
    expect(result.passed).toBe(true);
  });
  it("passes a native professional post", () => {
    const result = evaluateContent({ items: [goodLinkedinPost] });
    expect(result.errors, JSON.stringify(result.errors)).toEqual([]);
    expect(result.passed).toBe(true);
  });
  it("fails a missing call to action", () => {
    const result = evaluateContent({ items: [missingCta] });
    expect(codes(result.errors)).toContain("content.missing_cta");
    expect(result.passed).toBe(false);
  });
  it("fails a forbidden claim", () => {
    const result = evaluateContent({ items: [forbiddenClaim] });
    expect(codes(result.errors)).toContain("claim.guarantee_language");
    expect(result.brandIssues.length + result.claimIssues.length).toBeGreaterThan(0);
  });
  it("fails an undeclared figure", () => {
    expect(codes(evaluateContent({ items: [undeclaredFigure] }).errors)).toContain("claim.undeclared_figure");
  });
  it("fails a brand violation", () => {
    expect(codes(evaluateContent({ items: [brandViolation] }).errors)).toContain("brand.forbidden_word");
  });
  it("fails leaked credentials", () => {
    expect(codes(evaluateContent({ items: [unsafeContent] }).errors)).toContain("safety.api_key");
  });
  it("fails a call to action the campaign has not earned", () => {
    expect(codes(evaluateContent({ items: [incoherentCta] }).errors)).toContain("cta.incoherent_with_objective");
  });
  it("catches the Instagram text pasted into TikTok", () => {
    const result = evaluateContent({ items: [badTiktokCopyPaste, goodLinkedinPost] });
    const all = codes([...result.errors, ...result.warnings]);
    expect(all.some((code) => code.startsWith("platform.") || code.startsWith("duplication."))).toBe(true);
  });
  it("reports a check ratio rather than a predicted performance figure", () => {
    const result = evaluateContent({ items: [goodTiktokScript] });
    expect(result.score.total).toBeGreaterThan(0);
    expect(result.score.passed).toBeLessThanOrEqual(result.score.total);
    expect(JSON.stringify(result)).not.toMatch(/viral|probabilidad|%/i);
  });
  it("offers recommendations that name the fix", () => {
    const result = evaluateContent({ items: [forbiddenClaim] });
    expect(result.recommendations.length).toBeGreaterThan(0);
  });
});
