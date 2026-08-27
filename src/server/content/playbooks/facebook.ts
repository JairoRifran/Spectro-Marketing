import type { PlatformPlaybook } from "./types";

export const facebookPlaybook: PlatformPlaybook = {
  platform: "facebook",
  summary: "A community-oriented feed with a broader and often older audience than Instagram, where context in the copy is welcome and a piece can afford to explain itself.",
  primaryObjectives: ["problem_awareness", "social_proof", "storytelling", "educational", "case_study", "product"],
  preferredFormats: ["reel", "short_video", "carousel", "story", "static_post", "text_post"],
  tone: {
    register: "Plain and personable; explanatory rather than clipped.",
    informalityCeiling: "conversational",
    notes: [
      "The audience skews broader than Instagram: assume less shared jargon.",
      "Copy that reads as a person talking to a group outperforms copy that reads as a campaign.",
    ],
  },
  hookGuidelines: {
    preferredTypes: ["story", "problem", "question", "specific_result", "mistake", "comparison"],
    discouragedTypes: ["challenge"],
    notes: [
      "Longer setups are tolerated here; the opening still has to say why to keep reading.",
      "A local or community angle lands where an abstract one does not.",
    ],
  },
  lengthGuidelines: {
    captionChars: { min: 100, max: 2000 },
    durationSeconds: { min: 15, max: 120 },
    hookMaxWords: 15,
  },
  captionGuidelines: [
    "Give the context Instagram would cut; this is the platform where explanation is an asset.",
    "Keep the first line above the fold self-sufficient.",
    "One link, placed deliberately.",
  ],
  ctaGuidelines: {
    preferredTypes: ["comment", "share", "learn_more", "visit_site", "send_message", "register"],
    notes: [
      "Sharing is the native community action and the most honest ask here.",
      "Questions that invite experience get answered; questions that invite opinion get argued.",
    ],
  },
  visualGuidelines: {
    aspectRatios: ["9:16", "1:1", "4:5"],
    safeAreaNotes: [
      "Reels share Instagram's interface constraints; keep the lower third clear.",
    ],
    notes: [
      "Images with readable text perform a job the caption cannot when the feed is scrolled quickly.",
    ],
  },
  videoGuidelines: {
    openingWindowSeconds: 3,
    aspectRatio: "9:16",
    captionsRequired: true,
    notes: [
      "Sound-off viewing is the default; burn in text.",
      "A Facebook Reel is not automatically the Instagram edit: pacing can be slightly slower and context heavier.",
    ],
  },
  storytellingPatterns: [
    "someone's situation → what changed → what it means for people like them",
    "question the community actually asks → a straight answer → an invitation to add to it",
    "behind the scenes → why the decision was made → what it cost",
  ],
  do: [
    "Write the caption as if the visual might not load.",
    "Give the community something to reply with.",
    "Treat this as its own platform with its own audience.",
  ],
  dont: [
    "Do not cross-post the Instagram caption unchanged.",
    "Do not rely on visual-only storytelling here.",
    "Do not use engagement bait; it is a community cost, not a tactic.",
  ],
  qualityChecks: [
    { id: "facebook.hook_present", description: "The piece opens with an explicit hook.", severity: "error" },
    { id: "facebook.context_present", description: "The copy carries the context the visual cannot.", severity: "warning" },
    { id: "facebook.distinct_from_instagram", description: "The variant is not a verbatim copy of the Instagram variant.", severity: "warning" },
    { id: "facebook.caption_length", description: "Caption sits inside the platform guideline.", severity: "warning" },
  ],
};
