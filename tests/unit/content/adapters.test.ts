import { describe, expect, it } from "vitest";
import { briefsFor, draftsFor, getAdapter } from "@/server/content/adapters";
import { generateMockVariants, isMockContent, MOCK_NOTICE } from "@/server/content/adapters/mock-generator";
import { comparableText, DUPLICATE_THRESHOLD } from "@/server/content/quality/duplication";
import { textSimilarity } from "@/server/content/quality/text";
import { getPlaybook } from "@/server/content/playbooks";
import { shapeOf, supportsFormat } from "@/server/content/platforms";
import { contentBriefSchema } from "@/server/content/schemas/brief";
import { platformContentVariantSchema } from "@/server/content/schemas/variant";
import { context } from "../../fixtures/content/base";

describe("platform adapters", () => {
  it("refuses a platform it cannot write natively for", () => {
    expect(() => getAdapter("threads")).toThrowError(/adaptador/i);
    expect(() => getAdapter("myspace")).toThrowError(/desconocida/i);
  });

  it("produces a schema-valid brief per targeted platform", () => {
    const briefs = briefsFor(context);
    expect(briefs).toHaveLength(context.concept.platforms.length);
    for (const brief of briefs) expect(contentBriefSchema.safeParse(brief).success).toBe(true);
  });

  it("produces a schema-valid variant per targeted platform", () => {
    for (const variant of draftsFor(context)) {
      const parsed = platformContentVariantSchema.safeParse(variant);
      expect(parsed.success, `${variant.platform}: ${JSON.stringify(parsed.error?.issues)}`).toBe(true);
    }
  });

  it("only chooses formats the platform supports and the detail matches", () => {
    for (const variant of draftsFor(context)) {
      expect(supportsFormat(variant.platform, variant.format)).toBe(true);
      expect(variant.detail.shape).toBe(shapeOf(variant.format));
    }
  });

  it("keeps every hook inside its own platform word budget", () => {
    for (const variant of draftsFor(context)) {
      const budget = getPlaybook(variant.platform).lengthGuidelines.hookMaxWords;
      expect(variant.hook.split(/\s+/).length, `${variant.platform} hook too long`).toBeLessThanOrEqual(budget);
    }
  });

  it("writes a genuinely different execution for every platform", () => {
    const variants = draftsFor(context);
    for (let i = 0; i < variants.length; i += 1) {
      for (let j = i + 1; j < variants.length; j += 1) {
        const similarity = textSimilarity(comparableText(variants[i]), comparableText(variants[j]));
        expect(similarity, `${variants[i].platform} vs ${variants[j].platform} too similar (${similarity.toFixed(2)})`).toBeLessThan(DUPLICATE_THRESHOLD);
      }
    }
  });

  it("gives TikTok and LinkedIn visibly different registers", () => {
    const tiktok = draftsFor(context).find((variant) => variant.platform === "tiktok")!;
    const linkedin = draftsFor(context).find((variant) => variant.platform === "linkedin")!;
    expect(tiktok.body.length).toBeLessThan(linkedin.body.length);
    expect(tiktok.detail.shape).toBe("video");
    expect(linkedin.detail.shape).toBe("text");
  });

  it("carries video direction on video shapes and visual direction on visual ones", () => {
    for (const variant of draftsFor(context)) {
      if (variant.detail.shape === "video") expect(variant.videoDirection ?? "").not.toBe("");
      if (variant.detail.shape !== "text") expect(variant.visualDirection ?? "").not.toBe("");
    }
  });

  it("prepares Shorts metadata without integrating any platform API", () => {
    const shorts = draftsFor(context).find((variant) => variant.platform === "youtube_shorts")!;
    expect(shorts.metadata.title).toBeTruthy();
    expect(shorts.metadata.description).toBeTruthy();
  });
});

describe("mock content generator", () => {
  it("is deterministic", () => {
    expect(generateMockVariants(context)).toEqual(generateMockVariants(context));
  });
  it("marks everything it produces as mock", () => {
    for (const variant of generateMockVariants(context)) {
      expect(isMockContent(variant)).toBe(true);
      expect(variant.generatedBy).toBe("mock");
      expect(variant.metadata.mock).toBe(MOCK_NOTICE);
    }
  });
  it("never presents itself as provider output", () => {
    expect(generateMockVariants(context).some((variant) => variant.generatedBy === "provider")).toBe(false);
  });
});
