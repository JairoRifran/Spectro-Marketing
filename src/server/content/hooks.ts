import type { ContentType } from "./content-types";
import type { SupportedPlatform } from "./platforms";

// Hook taxonomy. These are shapes an opening can take, not phrases: the module never ships
// Spectro-specific copy, because the copy belongs to the brand and comes from Clara.

export const HOOK_TYPES = [
  "question",
  "contrarian",
  "problem",
  "curiosity_gap",
  "specific_result",
  "mistake",
  "comparison",
  "story",
  "challenge",
  "statistic",
  "demonstration",
] as const;

export type HookType = (typeof HOOK_TYPES)[number];

export interface HookProfile {
  type: HookType;
  description: string;
  // A hook that leans on a number or an outcome has to be backed by something. The claim
  // checker reads this flag rather than guessing from the text.
  impliesClaim: boolean;
  platforms: readonly SupportedPlatform[];
  contentTypes: readonly ContentType[];
}

const ALL_PLATFORMS: readonly SupportedPlatform[] = ["instagram", "facebook", "tiktok", "youtube_shorts", "linkedin"];
const FAST_PLATFORMS: readonly SupportedPlatform[] = ["tiktok", "youtube_shorts", "instagram"];

export const HOOK_PROFILES: Record<HookType, HookProfile> = {
  question: {
    type: "question",
    description: "Opens with the question the audience is already asking itself.",
    impliesClaim: false,
    platforms: ALL_PLATFORMS,
    contentTypes: ["educational", "problem_awareness", "objection_handling", "authority"],
  },
  contrarian: {
    type: "contrarian",
    description: "States a defensible position against the common assumption, then grounds it.",
    impliesClaim: true,
    platforms: ["linkedin", "tiktok", "youtube_shorts", "instagram"],
    contentTypes: ["authority", "comparison", "problem_awareness", "objection_handling"],
  },
  problem: {
    type: "problem",
    description: "Names the friction the audience lives with, in their own words.",
    impliesClaim: false,
    platforms: ALL_PLATFORMS,
    contentTypes: ["problem_awareness", "educational", "product", "objection_handling"],
  },
  curiosity_gap: {
    type: "curiosity_gap",
    description: "Promises a specific missing piece and pays it off inside the same piece.",
    impliesClaim: false,
    platforms: FAST_PLATFORMS,
    contentTypes: ["educational", "entertainment", "storytelling", "trend"],
  },
  specific_result: {
    type: "specific_result",
    description: "Leads with a concrete outcome that actually happened.",
    impliesClaim: true,
    platforms: ALL_PLATFORMS,
    contentTypes: ["case_study", "social_proof", "conversion", "product"],
  },
  mistake: {
    type: "mistake",
    description: "Surfaces an error the audience is likely making right now.",
    impliesClaim: false,
    platforms: ALL_PLATFORMS,
    contentTypes: ["educational", "problem_awareness", "authority", "objection_handling"],
  },
  comparison: {
    type: "comparison",
    description: "Sets two concrete options side by side on one axis that matters.",
    impliesClaim: true,
    platforms: ALL_PLATFORMS,
    contentTypes: ["comparison", "product", "objection_handling", "educational"],
  },
  story: {
    type: "story",
    description: "Drops into a moment with a person and a stake.",
    impliesClaim: false,
    platforms: ALL_PLATFORMS,
    contentTypes: ["storytelling", "case_study", "behind_the_scenes", "social_proof"],
  },
  challenge: {
    type: "challenge",
    description: "Invites the viewer to test something themselves before the piece ends.",
    impliesClaim: false,
    platforms: FAST_PLATFORMS,
    contentTypes: ["entertainment", "educational", "trend", "product"],
  },
  statistic: {
    type: "statistic",
    description: "Opens on a figure the audience did not expect.",
    impliesClaim: true,
    platforms: ["linkedin", "facebook", "instagram", "youtube_shorts"],
    contentTypes: ["authority", "problem_awareness", "case_study", "comparison"],
  },
  demonstration: {
    type: "demonstration",
    description: "Shows the thing working before explaining any of it.",
    impliesClaim: false,
    platforms: FAST_PLATFORMS.concat("facebook"),
    contentTypes: ["product", "educational", "behind_the_scenes", "social_proof"],
  },
};

export function isHookType(value: string): value is HookType {
  return (HOOK_TYPES as readonly string[]).includes(value);
}

export function hookProfile(type: HookType) {
  return HOOK_PROFILES[type];
}

/** Hooks that fit a platform and content type. Returns every hook that fits, ranked stably. */
export function selectHookTypes(input: { platform: SupportedPlatform; contentType: ContentType }): HookType[] {
  return HOOK_TYPES.filter((type) => {
    const profile = HOOK_PROFILES[type];
    return profile.platforms.includes(input.platform) && profile.contentTypes.includes(input.contentType);
  });
}

export function hookFits(type: HookType, input: { platform: SupportedPlatform; contentType: ContentType }) {
  return selectHookTypes(input).includes(type);
}

/** A hook whose shape asserts an outcome needs evidence behind it. */
export function hookRequiresEvidence(type: HookType) {
  return HOOK_PROFILES[type].impliesClaim;
}
