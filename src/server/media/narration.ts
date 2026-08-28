import type { PlatformContentVariant } from "../content/schemas/variant";

// The words that actually get spoken.
//
// This is the string the vendor bills for, so it is built once, here, and the estimate and the
// request are both taken from it. Building narration in one place and estimating from another is
// how a ceiling ends up enforced against a number unrelated to the invoice.
//
// Only a video has a voiceover. A carousel is read by the person scrolling it and a text post is
// read silently; synthesising either would be producing something nobody asked for and charging
// for it.

/** A line the narrator says, with what it is for, so a person can check it before paying. */
export interface NarrationLine {
  role: "hook" | "scene" | "payoff" | "cta";
  text: string;
}

export interface Narration {
  lines: NarrationLine[];
  /** Exactly what will be sent. Nothing else is billed and nothing else is estimated. */
  text: string;
}

function clean(value: string | undefined | null): string {
  return (value ?? "").replace(/\s+/g, " ").trim();
}

/**
 * Builds the narration, or nothing when the piece has none to build.
 *
 * A scene contributes its voiceover if it has one. Where it does not, it contributes nothing
 * rather than falling back to on-screen text: burnt-in text is written to be read, not spoken,
 * and reading it aloud produces narration nobody wrote.
 */
export function buildNarration(variant: PlatformContentVariant): Narration | null {
  if (variant.detail.shape !== "video") return null;
  const script = variant.detail.script;

  const lines: NarrationLine[] = [];
  const hook = clean(script.hook);
  if (hook) lines.push({ role: "hook", text: hook });

  for (const scene of script.scenes) {
    const spoken = clean(scene.voiceover);
    if (spoken) lines.push({ role: "scene", text: spoken });
  }

  const payoff = clean(script.payoff);
  if (payoff) lines.push({ role: "payoff", text: payoff });

  const cta = clean(script.cta);
  if (cta) lines.push({ role: "cta", text: cta });

  if (lines.length === 0) return null;

  // Joined with a full stop and a space so the synthesiser pauses between beats rather than
  // running the whole script together as one breath.
  const text = lines.map((line) => line.text.replace(/[.\s]+$/, "")).join(". ") + ".";
  return { lines, text };
}
