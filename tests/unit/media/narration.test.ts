import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { buildNarration } from "@/server/media/narration";
import { getAdapter } from "@/server/content/adapters";
import { estimateCost } from "@/server/spend/pricing";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";
import type { ContentConcept } from "@/server/content/schemas/concept";

const brand = {
  name: "Spectro", toneOfVoice: "Claro", personality: [], preferredWords: [], forbiddenWords: [],
  forbiddenClaims: [], informalityCeiling: "conversational" as const, visualInstructions: "",
};
const concept: ContentConcept = {
  conceptId: "C1", title: "T", internalName: "t", pillar: "Educacion", angle: "A", objective: "educational",
  audience: { persona: "P", problem: "Pr.", promise: "Pm." }, coreIdea: "Idea.",
  hookDirection: { preferredTypes: ["problem"] }, format: "short_video",
  platforms: ["tiktok"], cta: "save", evidenceRequired: [], creativeNotes: [],
};
const videoVariant = () => getAdapter("tiktok").draft({ concept, brand, campaign: { campaignId: "c", name: "n", objective: "awareness" } });

function scripted(scenes: Array<{ voiceover?: string; onScreenText?: string }>): PlatformContentVariant {
  const base = videoVariant();
  if (base.detail.shape !== "video") throw new Error("expected a video");
  return {
    ...base,
    detail: {
      shape: "video",
      script: {
        ...base.detail.script,
        hook: "Nadie te avisa esto",
        payoff: "Por eso conviene escribirlo",
        cta: "Contame en comentarios",
        scenes: scenes.map((scene) => ({
          durationSeconds: 5,
          visual: "Plano fijo",
          voiceover: scene.voiceover,
          onScreenText: scene.onScreenText,
        })),
      },
    },
  };
}

describe("what gets spoken", () => {
  it("has nothing to narrate for a piece nobody speaks", () => {
    // A carousel is read by the person scrolling it; synthesising one would be producing
    // something nobody asked for and charging for it.
    for (const platform of ["instagram", "linkedin"] as const) {
      const variant = getAdapter(platform).draft({
        concept: { ...concept, format: platform === "linkedin" ? "text_post" : "carousel", platforms: [platform] },
        brand,
        campaign: { campaignId: "c", name: "n", objective: "awareness" },
      });
      if (variant.detail.shape === "video") continue;
      expect(buildNarration(variant), platform).toBeNull();
    }
  });

  it("narrates a video from its hook, spoken lines, payoff and call to action", () => {
    const narration = buildNarration(scripted([{ voiceover: "Primera linea" }, { voiceover: "Segunda linea" }]));
    expect(narration?.lines.map((line) => line.role)).toEqual(["hook", "scene", "scene", "payoff", "cta"]);
    expect(narration?.text).toContain("Primera linea");
    expect(narration?.text).toContain("Segunda linea");
  });

  it("skips a scene with no spoken line rather than reading its on-screen text aloud", () => {
    // Burnt-in text is written to be read, not spoken. Reading it aloud invents narration.
    const narration = buildNarration(scripted([{ onScreenText: "TEXTO EN PANTALLA" }, { voiceover: "Esto si se dice" }]));
    expect(narration?.text).not.toContain("TEXTO EN PANTALLA");
    expect(narration?.lines.filter((line) => line.role === "scene")).toHaveLength(1);
  });

  it("has nothing to narrate when no line is spoken at all", () => {
    const base = scripted([{ onScreenText: "solo texto" }]);
    if (base.detail.shape !== "video") throw new Error("expected a video");
    const silent = { ...base, detail: { shape: "video" as const, script: { ...base.detail.script, hook: "", payoff: "", cta: "" } } };
    expect(buildNarration(silent)).toBeNull();
  });

  it("separates the beats so they are not read as one breath", () => {
    const narration = buildNarration(scripted([{ voiceover: "Una" }, { voiceover: "Dos" }]));
    expect(narration?.text).toMatch(/Una\. Dos\./);
    expect(narration?.text.endsWith(".")).toBe(true);
  });

  it("does not double a full stop a line already ended with", () => {
    const narration = buildNarration(scripted([{ voiceover: "Termina en punto." }]));
    expect(narration?.text).not.toContain("..");
  });

  it("collapses whitespace, so line breaks do not become pauses nobody wrote", () => {
    const narration = buildNarration(scripted([{ voiceover: "Con   varios\n\nespacios" }]));
    expect(narration?.text).toContain("Con varios espacios");
  });

  it("is deterministic, so the same piece always costs the same", () => {
    const variant = scripted([{ voiceover: "Una" }]);
    expect(buildNarration(variant)).toEqual(buildNarration(variant));
  });

  it("is the exact string the estimate is taken from", () => {
    // Estimating from anything other than what is sent enforces the ceiling against a number
    // unrelated to the invoice.
    const narration = buildNarration(scripted([{ voiceover: "Una linea" }]))!;
    const rates = { ttsPerCharacterMicros: 10, minimumChargeMicros: 0 };
    expect(estimateCost({ operation: "media.tts", text: narration.text }, rates)).toBe([...narration.text].length * 10);
  });
});

describe("the route that spends", () => {
  const route = readFileSync(new URL("../../../src/app/api/content/[id]/voiceover/route.ts", import.meta.url), "utf8");

  it("only spends on POST, so a preflight can never become a purchase", () => {
    const get = route.slice(route.indexOf("export async function GET"), route.indexOf("export async function POST"));
    expect(get).not.toContain("produceVoiceover");
    expect(get).toContain("estimateCost");
  });

  it("says what it would cost before anything is spent", () => {
    expect(route).toContain("formatMoney(estimateCost(");
  });

  it("keeps a viewer from spending", () => {
    expect(route).toContain('context.role === "viewer"');
  });

  it("tells the refusals apart instead of collapsing them into one failure", () => {
    for (const outcome of ["spend_refused", "spend_unavailable", "provider_failed"]) {
      expect(route, outcome).toContain(outcome);
    }
    // Payment required, not a generic error: the ceiling refused, nothing broke.
    expect(route).toContain("status: 402");
  });

  it("scopes the idempotency key to the piece and its version", () => {
    // Otherwise one client's retry could collide with another piece's request.
    expect(route).toMatch(/tts:\$\{id\}:v\$\{piece\.item\.current_version\}/);
  });
});
