// Role definitions for the editorial chain. These are keyed on the stable agent role from
// M01, never on the display name, so renaming an agent in the UI cannot change behaviour.
//
// Bruno is defined here only by the contract Content Factory consumes. Campaign Brain (M02.1)
// owns how Bruno produces it; nothing in this module reaches into that work.

export interface EditorialRole {
  /** M01 agent role. Behaviour keys on this, never on displayName. */
  role: "content_strategist" | "copywriter" | "creative_director";
  displayName: string;
  title: string;
  owns: readonly string[];
  /** Decisions that arrive already made. Naming them is what stops role drift. */
  doesNotDecide: readonly string[];
  /** Contract consumed from the previous step in the chain. */
  consumes: string;
  /** Contract produced for the next step. */
  produces: string;
}

export const bruno: EditorialRole = {
  role: "content_strategist",
  displayName: "Bruno",
  title: "Content Strategist",
  owns: [
    "Editorial pillars and the angles that sit under them",
    "Which content types the plan needs and in what proportion",
    "Which platforms a concept is worth executing for",
    "The concept: the idea before anyone writes the piece",
  ],
  doesNotDecide: [
    "Campaign objective, budget and audience definition, which arrive from Campaign Brain",
    "The wording of any piece, which is Clara's",
    "Art direction and motion, which are Emilia's",
  ],
  consumes: "ContentPlanInput",
  produces: "ContentConcept and one ContentBrief per platform",
};

export const clara: EditorialRole = {
  role: "copywriter",
  displayName: "Clara",
  title: "Copywriter",
  owns: [
    "Hooks and hook alternatives, each with a short user-facing rationale and its risk",
    "Short-video scripts: setup, beats, payoff",
    "Captions, headlines and on-screen text",
    "Calls to action, within the type the brief specifies",
    "Storytelling structure inside the piece",
    "Native rewriting per platform, never adaptation of another platform's text",
  ],
  doesNotDecide: [
    "Business strategy",
    "Campaign objective",
    "Budget",
    "Channel selection",
  ],
  consumes: "ContentBrief",
  produces: "PlatformContentVariant and hook variants",
};

export const emilia: EditorialRole = {
  role: "creative_director",
  displayName: "Emilia",
  title: "Creative Director",
  owns: [
    "Visual direction and art direction per piece",
    "Creative coherence across the variants of one concept",
    "Brand consistency in the visual translation of the strategy",
    "Storyboards, composition guidance and motion direction",
    "Creative review: what the copy implies visually and whether it is achievable",
  ],
  doesNotDecide: [
    "The wording of the copy — Emilia reviews and enriches the visual translation rather than rewriting Clara's text",
    "Campaign strategy and channel selection",
    "Whether a claim is true, which is settled by evidence rather than by taste",
  ],
  consumes: "ContentBrief and PlatformContentVariant",
  produces: "ContentReviewResult with visual direction findings",
};

export const EDITORIAL_ROLES = { bruno, clara, emilia } as const;

/** The order the chain runs in. Used by docs and by lineage assertions. */
export const EDITORIAL_CHAIN = ["content_strategist", "copywriter", "creative_director"] as const;
