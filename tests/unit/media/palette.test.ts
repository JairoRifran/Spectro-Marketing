import { describe, expect, it } from "vitest";
import { luminance, mix, readableOn, seedOf, shift } from "@/server/media/palette";
import { SPECTRO_IDENTITY, SPECTRO_IDENTITY_LIGHT } from "@/server/media/identity";
import { gradientVector } from "@/server/media/spec";

describe("colour arithmetic", () => {
  it("lightens toward white and darkens toward black", () => {
    expect(luminance(shift("#808080", 0.5))).toBeGreaterThan(luminance("#808080"));
    expect(luminance(shift("#808080", -0.5))).toBeLessThan(luminance("#808080"));
  });

  it("never leaves the range a colour can hold", () => {
    expect(shift("#ffffff", 1)).toBe("#ffffff");
    expect(shift("#000000", -1)).toBe("#000000");
  });

  it("always returns a six-digit hex value", () => {
    for (const colour of [shift("#010203", 0.3), mix("#010203", "#fefdfc", 0.5)]) {
      expect(colour).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it("mixes proportionally and reaches each end exactly", () => {
    expect(mix("#000000", "#ffffff", 0)).toBe("#000000");
    expect(mix("#000000", "#ffffff", 1)).toBe("#ffffff");
    expect(mix("#000000", "#ffffff", 0.5)).toBe("#808080");
  });
});

describe("readability", () => {
  it("puts light text on a dark surface and dark text on a light one", () => {
    // A brand accent can be pale enough that the usual ink is unreadable on it, and that only
    // shows up once somebody opens the exported file.
    expect(luminance(readableOn("#0a0a0a", SPECTRO_IDENTITY))).toBeGreaterThan(0.5);
    expect(luminance(readableOn("#f4f4f4", SPECTRO_IDENTITY))).toBeLessThan(0.5);
  });

  it("holds for both shipped identities", () => {
    for (const identity of [SPECTRO_IDENTITY, SPECTRO_IDENTITY_LIGHT]) {
      for (const surface of ["#ffffff", "#000000", identity.accent, identity.surface]) {
        const ink = readableOn(surface, identity);
        const contrast = Math.abs(luminance(ink) - luminance(surface));
        expect(contrast, `${identity.surface} on ${surface}`).toBeGreaterThan(0.25);
      }
    }
  });
});

describe("seeded variation", () => {
  it("is stable for the same key", () => {
    expect(seedOf("slide-2")).toBe(seedOf("slide-2"));
  });

  it("differs between keys, so a set is not five identical frames", () => {
    const seeds = ["slide-0", "slide-1", "slide-2", "cover", "scene-1"].map(seedOf);
    expect(new Set(seeds).size).toBe(seeds.length);
  });
});

describe("gradient direction", () => {
  it("sweeps left to right at zero degrees", () => {
    const { x1, x2, y1, y2 } = gradientVector(0);
    expect(x1).toBeCloseTo(0, 6);
    expect(x2).toBeCloseTo(1, 6);
    expect(y1).toBeCloseTo(0.5, 6);
    expect(y2).toBeCloseTo(0.5, 6);
  });

  it("sweeps top to bottom at ninety", () => {
    const { y1, y2 } = gradientVector(90);
    expect(y1).toBeCloseTo(0, 6);
    expect(y2).toBeCloseTo(1, 6);
  });

  it("stays inside the box it fills", () => {
    // Shared by all three renderers, so a gradient points the same way in the preview, the PNG
    // and the server-rendered file.
    for (const angle of [0, 45, 90, 135, 180, 270, 360]) {
      const vector = gradientVector(angle);
      for (const value of Object.values(vector)) {
        expect(value).toBeGreaterThanOrEqual(-0.001);
        expect(value).toBeLessThanOrEqual(1.001);
      }
    }
  });
});
