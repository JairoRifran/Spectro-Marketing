import type { PlatformPlaybook } from "./types";

export const tiktokPlaybook: PlatformPlaybook = {
  platform: "tiktok",
  summary: "A native-video platform where a piece is judged on whether it feels made for the feed rather than adapted into it, and where corporate register is itself a reason to scroll past.",
  primaryObjectives: ["entertainment", "educational", "problem_awareness", "trend", "behind_the_scenes", "storytelling"],
  preferredFormats: ["short_video"],
  tone: {
    register: "Direct, spoken, first person. Sentences the way a person actually says them.",
    informalityCeiling: "casual",
    notes: [
      "Relax only as far as the brand allows: a regulated brand stays precise even here.",
      "Read the script aloud. If nobody would say it out loud, rewrite it.",
      "Marketing register — 'unlock', 'seamless', 'revolutionise' — reads as an advert and is treated as one.",
    ],
  },
  hookGuidelines: {
    preferredTypes: ["problem", "contrarian", "curiosity_gap", "mistake", "challenge", "demonstration"],
    discouragedTypes: ["statistic"],
    notes: [
      "The first sentence is the whole decision. Start mid-thought; skip the greeting and the brand name.",
      "The visual has to change inside the opening window, not only the audio.",
    ],
  },
  lengthGuidelines: {
    captionChars: { min: 20, max: 300 },
    durationSeconds: { min: 15, max: 60 },
    hookMaxWords: 10,
  },
  captionGuidelines: [
    "The caption is context, not the script; the video has to work with the sound off and the caption unread.",
    "Keep it to one line where possible.",
  ],
  ctaGuidelines: {
    preferredTypes: ["comment", "follow", "save", "share", "learn_more"],
    notes: [
      "Ask conversationally and late; a hard ask early costs the rest of the video.",
      "Comment prompts work when they are a real question, not a growth tactic.",
    ],
  },
  visualGuidelines: {
    aspectRatios: ["9:16"],
    safeAreaNotes: [
      "Right edge and bottom third carry the interface; keep text out of both.",
    ],
    notes: [
      "Shot on a phone is a feature here, not a compromise.",
      "Avoid heavy brand framing and lower thirds; they signal advert immediately.",
    ],
  },
  videoGuidelines: {
    openingWindowSeconds: 1.5,
    aspectRatio: "9:16",
    captionsRequired: true,
    notes: [
      "Pace: keep the story moving; a static talking head with no progression loses the viewer.",
      "Give the viewer a visual interruption — a cut, a prop, a location change — before attention drifts.",
      "Every beat should answer why the next one is worth waiting for.",
    ],
  },
  storytellingPatterns: [
    "claim → immediate demonstration → the caveat nobody mentions",
    "mistake I made → what it cost → what I do now",
    "question asked straight to camera → answered by showing, not telling",
  ],
  do: [
    "Write for the ear, then cut anything the picture already says.",
    "Show the thing happening on screen.",
    "Keep one idea per video and finish it.",
  ],
  dont: [
    "Do not reuse an Instagram Reel edit unchanged; the register and pacing differ.",
    "Do not open with a logo, a greeting, or the brand name.",
    "Do not read a written caption aloud as if it were a script.",
  ],
  qualityChecks: [
    { id: "tiktok.hook_present", description: "The script opens with an explicit hook.", severity: "error" },
    { id: "tiktok.opening_window", description: "The hook fits inside the opening window.", severity: "warning" },
    { id: "tiktok.native_register", description: "Copy avoids corporate marketing register when the brand allows informality.", severity: "warning" },
    { id: "tiktok.duration", description: "Estimated duration sits inside the platform guideline.", severity: "warning" },
  ],
};
