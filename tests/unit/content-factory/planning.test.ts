import { describe, expect, it } from "vitest";
import { buildContentPlan, distributeByPillars, planChannels, weeklyCadence } from "@/server/content-factory/planning";
import { supportsFormat } from "@/server/content/platforms";

const pillars = [
  { name: "Education", weight: 30 },
  { name: "Problem", weight: 20 },
  { name: "Product", weight: 20 },
  { name: "Authority", weight: 15 },
  { name: "Social Proof", weight: 10 },
  { name: "Conversion", weight: 5 },
];

describe("pillar distribution", () => {
  it("distributes a large plan close to the declared weights", () => {
    const result = distributeByPillars(pillars, 100);
    expect(result.total).toBe(100);
    const byName = Object.fromEntries(result.allocations.map((allocation) => [allocation.name, allocation.count]));
    expect(byName).toEqual({ Education: 30, Problem: 20, Product: 20, Authority: 15, "Social Proof": 10, Conversion: 5 });
    expect(result.warnings).toEqual([]);
  });

  it("always allocates exactly the requested total", () => {
    for (const total of [1, 3, 7, 11, 13, 24, 47]) {
      expect(distributeByPillars(pillars, total).total, `total ${total}`).toBe(total);
    }
  });

  it("minimises deviation with largest remainder rather than demanding an impossible sum", () => {
    const result = distributeByPillars(pillars, 10);
    expect(result.total).toBe(10);
    // 30/20/20/15/10/5 over ten pieces cannot be exact; the biggest pillars keep their share.
    const byName = Object.fromEntries(result.allocations.map((allocation) => [allocation.name, allocation.count]));
    expect(byName.Education).toBe(3);
    expect(byName.Problem).toBe(2);
    expect(byName.Product).toBe(2);
  });

  it("warns when a small plan cannot honour a declared weight", () => {
    const result = distributeByPillars(pillars, 3);
    expect(result.total).toBe(3);
    expect(result.warnings.length).toBeGreaterThan(0);
    expect(result.warnings.join(" ")).toMatch(/sin ninguna pieza|demasiado chico/);
  });

  it("handles an empty or zero-weight plan without throwing", () => {
    expect(distributeByPillars([], 5).warnings.length).toBe(1);
    expect(distributeByPillars([{ name: "X", weight: 0 }], 5).warnings.length).toBe(1);
  });

  it("accepts fractional weights as readily as percentages", () => {
    const fractions = distributeByPillars([{ name: "A", weight: 0.75 }, { name: "B", weight: 0.25 }], 8);
    expect(fractions.allocations.map((allocation) => allocation.count)).toEqual([6, 2]);
  });
});

describe("channel cadence", () => {
  it("reads a frequency into a weekly cadence", () => {
    expect(weeklyCadence("Diario")).toBe(7);
    expect(weeklyCadence("3 veces por semana")).toBe(3);
    expect(weeklyCadence("semanal")).toBe(1);
    expect(weeklyCadence("mensual")).toBe(0.25);
  });
  it("falls back to weekly for text it cannot read", () => {
    expect(weeklyCadence("cuando se pueda")).toBe(1);
    expect(weeklyCadence(null)).toBe(1);
  });
});

describe("channel planning", () => {
  const channels = [
    { channel: "tiktok", enabled: true, priority: 3, formats: ["short_video"], publishingFrequency: "3 veces por semana" },
    { channel: "linkedin", enabled: true, priority: 2, formats: ["text_post"], publishingFrequency: "semanal" },
    { channel: "instagram", enabled: false, priority: 1, formats: ["reel"], publishingFrequency: "diario" },
    { channel: "threads", enabled: true, priority: 1, formats: ["text_post"], publishingFrequency: "semanal" },
  ];

  it("plans only enabled and supported channels", () => {
    const plans = planChannels(channels, 4);
    expect(plans.map((plan) => plan.platform)).toEqual(["tiktok", "linkedin"]);
  });

  it("derives volume from cadence and duration instead of hardcoding it", () => {
    const plans = planChannels(channels, 4);
    expect(plans.find((plan) => plan.platform === "tiktok")!.pieces).toBe(12);
    expect(plans.find((plan) => plan.platform === "linkedin")!.pieces).toBe(4);
    expect(planChannels(channels, 2).find((plan) => plan.platform === "tiktok")!.pieces).toBe(6);
  });

  it("never plans a format the platform cannot produce", () => {
    const plans = planChannels([{ channel: "tiktok", enabled: true, priority: 1, formats: ["carousel", "short_video"], publishingFrequency: "semanal" }], 2);
    expect(plans[0].formats).toEqual(["short_video"]);
    expect(plans[0].warnings.join(" ")).toMatch(/no admite carousel/);
  });

  it("falls back to the platform's own formats when none declared are usable", () => {
    const plans = planChannels([{ channel: "linkedin", enabled: true, priority: 1, formats: ["story"], publishingFrequency: "semanal" }], 2);
    expect(plans[0].formats.length).toBeGreaterThan(0);
    for (const format of plans[0].formats) expect(supportsFormat("linkedin", format)).toBe(true);
  });
});

describe("content plan", () => {
  const channels = planChannels(
    [
      { channel: "tiktok", enabled: true, priority: 3, formats: ["short_video"], publishingFrequency: "3 veces por semana" },
      { channel: "linkedin", enabled: true, priority: 2, formats: ["text_post"], publishingFrequency: "semanal" },
    ],
    4,
  );

  it("produces a piece per planned slot with a platform-valid format", () => {
    const plan = buildContentPlan({ channels, pillars, angles: ["Ángulo A", "Ángulo B"], maxPieces: 100 });
    expect(plan.pieces).toHaveLength(16);
    for (const piece of plan.pieces) expect(supportsFormat(piece.platform, piece.format)).toBe(true);
  });

  it("spreads pillars across channels rather than stacking one pillar on one platform", () => {
    const plan = buildContentPlan({ channels, pillars, angles: ["A", "B"], maxPieces: 100 });
    const tiktokPillars = new Set(plan.pieces.filter((piece) => piece.platform === "tiktok").map((piece) => piece.pillar));
    expect(tiktokPillars.size).toBeGreaterThan(1);
  });

  it("rotates angles so the set is not one idea repeated", () => {
    const plan = buildContentPlan({ channels, pillars, angles: ["A", "B", "C"], maxPieces: 100 });
    expect(new Set(plan.pieces.map((piece) => piece.angle)).size).toBe(3);
  });

  it("caps the plan and says so instead of silently truncating", () => {
    const plan = buildContentPlan({ channels, pillars, angles: ["A"], maxPieces: 6 });
    expect(plan.pieces).toHaveLength(6);
    expect(plan.warnings.join(" ")).toMatch(/se limita a 6/);
  });

  it("is deterministic", () => {
    const first = buildContentPlan({ channels, pillars, angles: ["A", "B"], maxPieces: 20 });
    const second = buildContentPlan({ channels, pillars, angles: ["A", "B"], maxPieces: 20 });
    expect(first.pieces).toEqual(second.pieces);
  });
});

describe("channel code mapping", () => {
  it("maps the campaign youtube channel onto the shorts playbook instead of dropping it", async () => {
    const { toSupportedPlatform } = await import("@/server/content-factory/planning");
    expect(toSupportedPlatform("youtube")).toBe("youtube_shorts");
    expect(toSupportedPlatform("tiktok")).toBe("tiktok");
    expect(toSupportedPlatform("x")).toBeNull();
  });
  it("plans a youtube channel declared by Campaign Brain", () => {
    const plans = planChannels([{ channel: "youtube", enabled: true, priority: 1, formats: ["short_video"], publishingFrequency: "semanal" }], 4);
    expect(plans.map((plan) => plan.platform)).toEqual(["youtube_shorts"]);
    expect(plans[0].pieces).toBe(4);
  });
});
