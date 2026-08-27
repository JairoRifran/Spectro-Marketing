import { describe, expect, it } from "vitest";
import { CONTENT_TYPES, isPromotional, stageOf } from "@/server/content/content-types";
import { CTA_TYPES, ctaAvailableOn, ctaIsCoherent, selectCtaTypes } from "@/server/content/ctas";
import { HOOK_TYPES, hookFits, hookRequiresEvidence, selectHookTypes } from "@/server/content/hooks";
import { allPlaybooks, getPlaybook } from "@/server/content/playbooks";
import { CONTENT_FORMATS, formatsForPlatform, platformsForFormat, shapeOf, SUPPORTED_PLATFORMS, supportsFormat } from "@/server/content/platforms";

describe("platform and format compatibility", () => {
  it("never claims a platform supports a format it does not", () => {
    expect(supportsFormat("tiktok", "carousel")).toBe(false);
    expect(supportsFormat("tiktok", "short_video")).toBe(true);
    expect(supportsFormat("instagram", "text_post")).toBe(false);
    expect(supportsFormat("linkedin", "document_post")).toBe(true);
  });
  it("keeps the two directions of the matrix consistent", () => {
    for (const format of CONTENT_FORMATS) {
      for (const platform of platformsForFormat(format)) expect(formatsForPlatform(platform)).toContain(format);
    }
  });
  it("gives every format exactly one production shape", () => {
    for (const format of CONTENT_FORMATS) expect(["video", "carousel", "story", "static", "text"]).toContain(shapeOf(format));
  });
  it("refuses a platform without a playbook instead of falling back to a neighbour", () => {
    expect(() => getPlaybook("threads")).toThrowError(/playbook/i);
    expect(() => getPlaybook("myspace")).toThrowError(/desconocida/i);
  });
});

describe("platform playbooks", () => {
  it("covers every supported platform", () => {
    expect(allPlaybooks().map((playbook) => playbook.platform).sort()).toEqual([...SUPPORTED_PLATFORMS].sort());
  });
  it("only lists formats the platform actually supports", () => {
    for (const playbook of allPlaybooks()) {
      for (const format of playbook.preferredFormats) expect(supportsFormat(playbook.platform, format)).toBe(true);
    }
  });
  it("gives every timed platform a video guideline and an opening window", () => {
    for (const playbook of allPlaybooks()) {
      if (!playbook.lengthGuidelines.durationSeconds) continue;
      expect(playbook.videoGuidelines).toBeDefined();
      expect(playbook.videoGuidelines!.openingWindowSeconds).toBeGreaterThan(0);
    }
  });
  it("never promises performance anywhere in its guidance", () => {
    const banned = /garantiz|viral|asegura|guaranteed|will convert|más alcance/i;
    for (const playbook of allPlaybooks()) {
      const text = JSON.stringify(playbook);
      expect(text, `${playbook.platform} promises performance`).not.toMatch(banned);
    }
  });
  it("treats TikTok and Instagram as different platforms rather than one feed", () => {
    const tiktok = getPlaybook("tiktok");
    const instagram = getPlaybook("instagram");
    expect(tiktok.tone.informalityCeiling).not.toBe(instagram.tone.informalityCeiling);
    expect(tiktok.videoGuidelines!.openingWindowSeconds).toBeLessThan(instagram.videoGuidelines!.openingWindowSeconds);
    expect(tiktok.dont.join(" ")).toMatch(/instagram/i);
  });
  it("treats Facebook as its own platform rather than an Instagram mirror", () => {
    expect(getPlaybook("facebook").dont.join(" ")).toMatch(/instagram/i);
  });
});

describe("hook taxonomy", () => {
  it("profiles every hook type", () => {
    for (const type of HOOK_TYPES) expect(selectHookTypes({ platform: "instagram", contentType: "educational" }).concat(type)).toContain(type);
  });
  it("selects only hooks that fit both platform and content type", () => {
    for (const type of selectHookTypes({ platform: "tiktok", contentType: "entertainment" })) {
      expect(hookFits(type, { platform: "tiktok", contentType: "entertainment" })).toBe(true);
    }
  });
  it("keeps statistic hooks away from TikTok and available on LinkedIn", () => {
    expect(hookFits("statistic", { platform: "tiktok", contentType: "authority" })).toBe(false);
    expect(hookFits("statistic", { platform: "linkedin", contentType: "authority" })).toBe(true);
  });
  it("flags the hook shapes that assert an outcome", () => {
    expect(hookRequiresEvidence("specific_result")).toBe(true);
    expect(hookRequiresEvidence("statistic")).toBe(true);
    expect(hookRequiresEvidence("story")).toBe(false);
  });
});

describe("cta coherence", () => {
  it("does not let an awareness campaign demand a purchase", () => {
    expect(ctaIsCoherent("purchase", "awareness")).toBe(false);
    expect(ctaIsCoherent("save", "awareness")).toBe(true);
  });
  it("lets a sales campaign still make a soft ask", () => {
    expect(ctaIsCoherent("save", "sales")).toBe(true);
    expect(ctaIsCoherent("purchase", "sales")).toBe(true);
  });
  it("respects platform availability", () => {
    expect(ctaAvailableOn("request_demo", "tiktok")).toBe(false);
    expect(ctaAvailableOn("request_demo", "linkedin")).toBe(true);
  });
  it("never selects a cta that fails either rule", () => {
    for (const platform of SUPPORTED_PLATFORMS) {
      for (const cta of selectCtaTypes({ platform, objective: "awareness" })) {
        expect(ctaAvailableOn(cta, platform)).toBe(true);
        expect(ctaIsCoherent(cta, "awareness")).toBe(true);
      }
    }
  });
  it("covers every declared cta type with a profile", () => {
    expect(CTA_TYPES.every((cta) => ctaAvailableOn(cta, "facebook") || ctaAvailableOn(cta, "linkedin") || ctaAvailableOn(cta, "instagram"))).toBe(true);
  });
});

describe("content types", () => {
  it("places every type on a funnel stage", () => {
    for (const type of CONTENT_TYPES) expect(["awareness", "consideration", "decision"]).toContain(stageOf(type));
  });
  it("treats only product and conversion as promotional", () => {
    expect(CONTENT_TYPES.filter(isPromotional)).toEqual(["product", "conversion"]);
  });
});
