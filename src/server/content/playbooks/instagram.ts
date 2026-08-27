import type { PlatformPlaybook } from "./types";

export const instagramPlaybook: PlatformPlaybook = {
  platform: "instagram",
  summary: "A visual-first feed where a piece earns its second look through craft, and earns distribution through saves and shares rather than through volume.",
  primaryObjectives: ["educational", "authority", "product", "storytelling", "behind_the_scenes", "social_proof"],
  preferredFormats: ["reel", "carousel", "story", "static_post"],
  tone: {
    register: "Warm and confident, closer to a knowledgeable peer than to a brand account.",
    informalityCeiling: "conversational",
    notes: [
      "Match the brand tone first; the platform only sets the ceiling, never the floor.",
      "Write captions in the first person the brand already uses elsewhere.",
    ],
  },
  hookGuidelines: {
    preferredTypes: ["problem", "curiosity_gap", "mistake", "demonstration", "specific_result"],
    discouragedTypes: ["statistic"],
    notes: [
      "A Reel hook is visual and verbal at once: what is on screen has to justify staying, not only what is said.",
      "A carousel hook lives on the cover slide and must be readable at thumbnail size.",
    ],
  },
  lengthGuidelines: {
    captionChars: { min: 80, max: 1400 },
    durationSeconds: { min: 7, max: 90 },
    hookMaxWords: 12,
  },
  captionGuidelines: [
    "Open with the line that would still work if the caption were truncated.",
    "Break into short paragraphs; a wall of text is skipped on a phone.",
    "Put the call to action on its own line at the end.",
    "Hashtags are categorisation, not reach strategy: a handful of specific ones beats thirty generic ones.",
  ],
  ctaGuidelines: {
    preferredTypes: ["save", "share", "comment", "follow", "learn_more", "send_message"],
    notes: [
      "Saves and shares are the asks that suit educational and reference pieces.",
      "Ask for exactly one action; two asks in one caption means neither is taken.",
    ],
  },
  visualGuidelines: {
    aspectRatios: ["9:16", "4:5", "1:1"],
    safeAreaNotes: [
      "Keep text clear of the bottom quarter of a Reel where the caption and controls sit.",
      "Carousel covers must read at roughly 160 px wide.",
    ],
    notes: [
      "Hold one visual system across the set: a carousel that changes style mid-way reads as unfinished.",
      "Legibility over decoration; a clever type treatment that cannot be read has failed.",
    ],
  },
  videoGuidelines: {
    openingWindowSeconds: 2,
    aspectRatio: "9:16",
    captionsRequired: true,
    notes: [
      "Assume sound is off until the viewer chooses otherwise; burn in on-screen text.",
      "Change the frame regularly enough that the eye has a reason to stay.",
    ],
  },
  storytellingPatterns: [
    "problem → why the usual fix fails → what to do instead → proof",
    "before → the change → after, with the mechanism made visible",
    "one idea per piece, expanded rather than a list of unrelated tips",
  ],
  do: [
    "Design the cover or first frame as the piece the audience actually decides on.",
    "Give the caption a job the visual cannot do.",
    "Keep a recognisable visual identity across formats.",
  ],
  dont: [
    "Do not repost a TikTok edit with its native watermark and call it an Instagram piece.",
    "Do not bury the point below three lines of preamble.",
    "Do not promise a result the brand cannot evidence.",
  ],
  qualityChecks: [
    { id: "instagram.hook_present", description: "The piece opens with an explicit hook.", severity: "error" },
    { id: "instagram.caption_length", description: "Caption sits inside the platform guideline.", severity: "warning" },
    { id: "instagram.visual_direction", description: "Visual direction is specified for a visual-first platform.", severity: "error" },
    { id: "instagram.single_cta", description: "Exactly one call to action is requested.", severity: "warning" },
  ],
};
