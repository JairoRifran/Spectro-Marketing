// Prompt identifiers for the Content Factory task types, following the M02.1 convention.
// The reusable, provider-neutral templates themselves live in Content Intelligence
// (`src/server/content/prompts/templates.ts`); this file only records which template version
// each task type is running, so a persisted artefact can always name what produced it.

export const CONTENT_PROMPTS = {
  contentPlan: { version: "content-plan.v1", role: "content_strategist", template: "copywriter.platform_variant" },
  contentCopy: { version: "content-copy.v1", role: "copywriter", template: "copywriter.platform_variant" },
  creativeReview: { version: "content-creative-review.v1", role: "creative_director", template: "creative.review" },
} as const;
