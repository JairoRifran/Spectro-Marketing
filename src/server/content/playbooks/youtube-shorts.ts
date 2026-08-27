import type { PlatformPlaybook } from "./types";

export const youtubeShortsPlaybook: PlatformPlaybook = {
  platform: "youtube_shorts",
  summary: "Short vertical video inside a search-and-library platform: the piece has to hold to the end and pay off, and its title and description keep working long after the feed has moved on.",
  primaryObjectives: ["educational", "entertainment", "authority", "problem_awareness", "case_study"],
  preferredFormats: ["short_video"],
  tone: {
    register: "Clear and instructive; a knowledgeable person explaining something worth knowing.",
    informalityCeiling: "conversational",
    notes: [
      "Closer to teaching than to performing, without becoming a lecture.",
      "Viewers often arrive from search rather than a feed, so context can be assumed less.",
    ],
  },
  hookGuidelines: {
    preferredTypes: ["question", "problem", "curiosity_gap", "specific_result", "demonstration", "mistake"],
    discouragedTypes: [],
    notes: [
      "State what the viewer will know by the end, then start delivering it immediately.",
      "A hook that over-promises costs the payoff; retention is lost at the moment the promise breaks.",
    ],
  },
  lengthGuidelines: {
    captionChars: { min: 40, max: 900 },
    durationSeconds: { min: 20, max: 60 },
    hookMaxWords: 12,
  },
  captionGuidelines: [
    "The description carries the searchable context the video cannot say out loud.",
    "Lead the description with the same promise the hook makes.",
  ],
  ctaGuidelines: {
    preferredTypes: ["follow", "learn_more", "visit_site", "comment", "share"],
    notes: [
      "Place the ask after the payoff, never before it.",
      "Subscribing is a reasonable ask when the piece belongs to a recurring series.",
    ],
  },
  visualGuidelines: {
    aspectRatios: ["9:16"],
    safeAreaNotes: [
      "Keep text out of the lower third where the title and controls overlay.",
    ],
    notes: [
      "Frame changes should mark progression through the explanation, not decorate it.",
    ],
  },
  videoGuidelines: {
    openingWindowSeconds: 3,
    aspectRatio: "9:16",
    captionsRequired: true,
    notes: [
      "Structure for retention: every beat should open the next question.",
      "Land a real payoff; an unresolved piece trains the viewer to leave early next time.",
      "A clean loop back to the opening line is a legitimate ending, not a trick.",
    ],
  },
  storytellingPatterns: [
    "promise → build → payoff → loop back to the opening line",
    "question → three escalating answers → the one that actually matters",
    "demonstration → why it works → where it breaks",
  ],
  do: [
    "Write a title that reads as a question a person would type.",
    "Deliver the promise inside the runtime.",
    "Keep the description useful on its own.",
  ],
  dont: [
    "Do not stretch a fifteen-second idea to sixty.",
    "Do not end on the call to action without the payoff.",
    "Do not describe performance the piece cannot be shown to have achieved.",
  ],
  qualityChecks: [
    { id: "youtube_shorts.hook_present", description: "The script opens with an explicit hook.", severity: "error" },
    { id: "youtube_shorts.payoff_present", description: "The script resolves the promise its hook made.", severity: "error" },
    { id: "youtube_shorts.duration", description: "Estimated duration sits inside the platform guideline.", severity: "warning" },
    { id: "youtube_shorts.metadata", description: "Title and description are prepared for the platform library.", severity: "warning" },
  ],
};
