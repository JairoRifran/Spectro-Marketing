import type { PlatformPlaybook } from "./types";

export const linkedinPlaybook: PlatformPlaybook = {
  platform: "linkedin",
  summary: "A professional context where credibility is the currency: a piece earns attention by saying something specific and defensible about work the reader recognises.",
  primaryObjectives: ["authority", "case_study", "educational", "comparison", "social_proof", "objection_handling"],
  preferredFormats: ["text_post", "document_post", "short_video", "static_post"],
  tone: {
    register: "Considered and specific. Plain professional language, not corporate abstraction.",
    informalityCeiling: "professional",
    notes: [
      "Concrete beats grand: one real example outperforms three general claims.",
      "A contrarian angle is welcome when it is grounded; a contrarian angle with nothing behind it reads as bait.",
    ],
  },
  hookGuidelines: {
    preferredTypes: ["contrarian", "specific_result", "statistic", "mistake", "question", "comparison", "story"],
    discouragedTypes: ["challenge"],
    notes: [
      "The first two lines are what shows before the reader expands the post; the point has to survive that truncation.",
      "Numbers in the opening must be traceable to something the brand can show.",
    ],
  },
  lengthGuidelines: {
    captionChars: { min: 400, max: 3000 },
    durationSeconds: { min: 30, max: 180 },
    hookMaxWords: 20,
  },
  captionGuidelines: [
    "Short paragraphs, one idea each; density without whitespace does not get read.",
    "Close with the insight, not with a summary of what was already said.",
    "State the source when a figure appears.",
  ],
  ctaGuidelines: {
    preferredTypes: ["comment", "learn_more", "visit_site", "request_demo", "register", "send_message"],
    notes: [
      "An invitation to disagree gets better discussion than an invitation to agree.",
      "A demo request is reasonable here in a way it is not on a purely social feed.",
    ],
  },
  visualGuidelines: {
    aspectRatios: ["1:1", "4:5", "16:9"],
    safeAreaNotes: [
      "Document pages are read at small size in the feed; set type accordingly.",
    ],
    notes: [
      "Charts must be readable and honestly scaled; a misleading axis is a credibility cost.",
      "Restraint reads as competence in this context.",
    ],
  },
  videoGuidelines: {
    openingWindowSeconds: 5,
    aspectRatio: "1:1",
    captionsRequired: true,
    notes: [
      "Video here is usually watched with the sound off in a work context.",
      "Talking-head framing is acceptable; production polish matters less than the argument.",
    ],
  },
  storytellingPatterns: [
    "common assumption → why it fails in practice → what we do instead → what it cost to learn",
    "situation → decision → measurable outcome → the caveat",
    "data point → interpretation → implication for the reader's own work",
  ],
  do: [
    "Anchor the argument in something specific that actually happened.",
    "Make the first two lines carry the whole point.",
    "Say what would have to be true for you to be wrong.",
  ],
  dont: [
    "Do not repost a TikTok script with the slang removed and call it a LinkedIn post.",
    "Do not open with an engagement-bait line unrelated to the content.",
    "Do not cite a figure the brand cannot evidence.",
  ],
  qualityChecks: [
    { id: "linkedin.hook_present", description: "The post opens with an explicit hook.", severity: "error" },
    { id: "linkedin.substance", description: "The post carries a specific insight rather than general advice.", severity: "warning" },
    { id: "linkedin.evidence", description: "Figures and outcome claims carry evidence references.", severity: "error" },
    { id: "linkedin.length", description: "Body length sits inside the platform guideline.", severity: "warning" },
  ],
};
