import { type FunnelStage, FUNNEL_STAGES } from "./content-types";
import type { SupportedPlatform } from "./platforms";

// Campaign objectives as the Content Factory expects to receive them. Campaign Brain owns
// the campaign record itself; this is only the vocabulary the editorial layer needs in
// order to keep a call to action coherent with why the campaign exists. Map at the
// boundary if Campaign Brain settles on different names.

export const CAMPAIGN_OBJECTIVES = ["awareness", "engagement", "traffic", "lead_generation", "sales", "loyalty"] as const;
export type CampaignObjective = (typeof CAMPAIGN_OBJECTIVES)[number];

export const CTA_TYPES = [
  "learn_more",
  "visit_site",
  "comment",
  "save",
  "share",
  "follow",
  "register",
  "request_demo",
  "purchase",
  "send_message",
] as const;

export type CtaType = (typeof CTA_TYPES)[number];

export interface CtaProfile {
  type: CtaType;
  /** The furthest the audience has to have travelled for this ask to be reasonable. */
  minimumStage: FunnelStage;
  platforms: readonly SupportedPlatform[];
}

const ALL_PLATFORMS: readonly SupportedPlatform[] = ["instagram", "facebook", "tiktok", "youtube_shorts", "linkedin"];

export const CTA_PROFILES: Record<CtaType, CtaProfile> = {
  save: { type: "save", minimumStage: "awareness", platforms: ["instagram", "tiktok", "linkedin", "facebook"] },
  share: { type: "share", minimumStage: "awareness", platforms: ALL_PLATFORMS },
  follow: { type: "follow", minimumStage: "awareness", platforms: ALL_PLATFORMS },
  comment: { type: "comment", minimumStage: "awareness", platforms: ALL_PLATFORMS },
  learn_more: { type: "learn_more", minimumStage: "consideration", platforms: ALL_PLATFORMS },
  visit_site: { type: "visit_site", minimumStage: "consideration", platforms: ALL_PLATFORMS },
  send_message: { type: "send_message", minimumStage: "consideration", platforms: ["instagram", "facebook", "linkedin"] },
  register: { type: "register", minimumStage: "decision", platforms: ALL_PLATFORMS },
  request_demo: { type: "request_demo", minimumStage: "decision", platforms: ["linkedin", "facebook", "instagram"] },
  purchase: { type: "purchase", minimumStage: "decision", platforms: ALL_PLATFORMS },
};

const STAGE_BY_OBJECTIVE: Record<CampaignObjective, FunnelStage> = {
  awareness: "awareness",
  engagement: "awareness",
  traffic: "consideration",
  lead_generation: "decision",
  sales: "decision",
  loyalty: "consideration",
};

export function isCtaType(value: string): value is CtaType {
  return (CTA_TYPES as readonly string[]).includes(value);
}

export function stageOfObjective(objective: CampaignObjective): FunnelStage {
  return STAGE_BY_OBJECTIVE[objective];
}

function stageRank(stage: FunnelStage) {
  return FUNNEL_STAGES.indexOf(stage);
}

/**
 * A call to action is coherent when the campaign has earned the right to make that ask.
 * An awareness campaign may still ask for a save or a follow; it may not demand a purchase.
 * The rule is one-directional on purpose: a sales campaign asking for a save is a soft ask,
 * not an incoherent one.
 */
export function ctaIsCoherent(cta: CtaType, objective: CampaignObjective) {
  return stageRank(CTA_PROFILES[cta].minimumStage) <= stageRank(stageOfObjective(objective));
}

export function ctaAvailableOn(cta: CtaType, platform: SupportedPlatform) {
  return CTA_PROFILES[cta].platforms.includes(platform);
}

/** Every call to action that both fits the platform and the campaign has earned. */
export function selectCtaTypes(input: { platform: SupportedPlatform; objective: CampaignObjective }): CtaType[] {
  return CTA_TYPES.filter((cta) => ctaAvailableOn(cta, input.platform) && ctaIsCoherent(cta, input.objective));
}
