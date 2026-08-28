import type { BrandIdentity } from "./identity";

// Colour arithmetic for composition.
//
// Deterministic on purpose: a frame's decoration is derived from its own key, so a carousel's
// slides feel like one set without being identical, and the same slide always comes out the same.
// Randomness here would make every render a different picture and nothing diffable or cacheable.

function clamp(value: number) {
  return Math.max(0, Math.min(255, Math.round(value)));
}

function parse(hex: string) {
  return {
    r: parseInt(hex.slice(1, 3), 16),
    g: parseInt(hex.slice(3, 5), 16),
    b: parseInt(hex.slice(5, 7), 16),
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }) {
  return `#${[r, g, b].map((channel) => clamp(channel).toString(16).padStart(2, "0")).join("")}`;
}

/** Moves a colour toward white or black. Positive lightens, negative darkens. */
export function shift(hex: string, amount: number): string {
  const { r, g, b } = parse(hex);
  const target = amount >= 0 ? 255 : 0;
  const ratio = Math.abs(amount);
  return toHex({
    r: r + (target - r) * ratio,
    g: g + (target - g) * ratio,
    b: b + (target - b) * ratio,
  });
}

/** Blends two colours. Used for tinting a surface toward the accent without shouting. */
export function mix(from: string, to: string, ratio: number): string {
  const a = parse(from);
  const b = parse(to);
  return toHex({
    r: a.r + (b.r - a.r) * ratio,
    g: a.g + (b.g - a.g) * ratio,
    b: a.b + (b.b - a.b) * ratio,
  });
}

/**
 * Relative luminance, for deciding what text can sit on a colour.
 *
 * Composition uses it rather than assuming: an accent chosen by a brand can be pale enough that
 * white text on it is unreadable, and shipping that only shows up once somebody looks at the
 * exported file.
 */
export function luminance(hex: string): number {
  const { r, g, b } = parse(hex);
  const channel = (value: number) => {
    const scaled = value / 255;
    return scaled <= 0.03928 ? scaled / 12.92 : ((scaled + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

/** The identity's ink or its surface, whichever is readable on the given colour. */
export function readableOn(hex: string, identity: BrandIdentity): string {
  const light = luminance(hex) > 0.45;
  return light ? (luminance(identity.ink) < 0.45 ? identity.ink : "#101010") : (luminance(identity.ink) > 0.45 ? identity.ink : "#ffffff");
}

/** A stable number from a string, so decoration varies by frame without varying by render. */
export function seedOf(value: string): number {
  let hash = 0;
  for (const character of value) hash = (hash * 31 + character.codePointAt(0)!) % 100_003;
  return hash;
}
