import { getAdapter } from "@/server/content/adapters";
import type { ContentBrief } from "@/server/content/schemas/brief";
import type { PlatformContentVariant } from "@/server/content/schemas/variant";
import { brand, campaign, concept, context } from "./base";

// Named evaluation scenarios. Each one isolates a single failure the quality engine has to
// catch, so a regression names the rule it broke instead of a whole suite going red.

function briefFor(platform: string): ContentBrief {
  return getAdapter(platform).brief(context);
}

function draftFor(platform: string): PlatformContentVariant {
  return getAdapter(platform).draft(context);
}

/** A native short-form script that should pass every deterministic check. */
export const goodTiktokScript = { brief: briefFor("tiktok"), variant: draftFor("tiktok") };

/** A professional post that should pass every deterministic check. */
export const goodLinkedinPost = { brief: briefFor("linkedin"), variant: draftFor("linkedin") };

/** The Instagram text pasted into TikTok: the failure this whole layer exists to prevent. */
export const badTiktokCopyPaste = (() => {
  const instagram = draftFor("instagram");
  const tiktok = draftFor("tiktok");
  return {
    brief: briefFor("tiktok"),
    variant: { ...tiktok, hook: instagram.hook, body: instagram.body, caption: instagram.caption, cta: instagram.cta },
    reference: instagram,
  };
})();

/** Two platforms carrying the same text, for the cross-platform duplication check. */
export const duplicateVariants = (() => {
  const instagram = draftFor("instagram");
  const facebook = draftFor("facebook");
  return [instagram, { ...facebook, hook: instagram.hook, body: instagram.body, caption: instagram.caption, cta: instagram.cta }];
})();

/** Copy that promises a result the brand cannot evidence. */
export const forbiddenClaim = (() => {
  const variant = draftFor("linkedin");
  return {
    brief: briefFor("linkedin"),
    variant: { ...variant, body: `${variant.body}\n\nCon este método los resultados garantizados llegan en 30 días.` },
  };
})();

/** A figure stated with no declared evidence behind it. */
export const undeclaredFigure = (() => {
  const variant = draftFor("linkedin");
  return {
    brief: { ...briefFor("linkedin"), evidence: [] },
    variant: { ...variant, claims: [], body: `${variant.body}\n\nReduce los costos operativos un 70%.` },
  };
})();

/** A variant with the call to action removed. */
export const missingCta = (() => {
  const variant = draftFor("instagram");
  return { brief: briefFor("instagram"), variant: { ...variant, cta: "" } };
})();

/** Copy using a word the brand forbids. */
export const brandViolation = (() => {
  const variant = draftFor("instagram");
  return {
    brief: briefFor("instagram"),
    variant: { ...variant, body: `${variant.body} Un enfoque revolucionario para tu equipo.` },
  };
})();

/** A credential pasted into copy. */
export const unsafeContent = (() => {
  const variant = draftFor("instagram");
  return {
    brief: briefFor("instagram"),
    variant: { ...variant, caption: `${variant.caption}\n\napi_key_abcdef0123456789abcdef` },
  };
})();

/** A call to action the campaign objective has not earned. */
export const incoherentCta = (() => {
  const variant = draftFor("instagram");
  return {
    brief: briefFor("instagram"),
    variant: { ...variant, ctaType: "purchase" as const, cta: "Comprá ahora." },
  };
})();

export { brand, campaign, concept, context };
