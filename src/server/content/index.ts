// Content Intelligence layer — the editorial reasoning that M02.2 Content Factory will run on.
//
// It owns everything from editorial strategy downwards: what an idea is, how each platform
// executes it natively, and whether the result is publishable. It does not publish, does not
// call an external network, does not generate media, and creates no tables: Campaign Brain
// (M02.1) owns campaign persistence and this layer must not collide with it.

export * from "./platforms";
export * from "./content-types";
export * from "./hooks";
export * from "./ctas";
export * from "./roles";
export * from "./structured-output";

export { PLAYBOOKS, allPlaybooks, getPlaybook } from "./playbooks";
export type { PlatformPlaybook, QualityCheck } from "./playbooks";

export { brandContextSchema, contentBriefSchema, contentPlanInputSchema } from "./schemas/brief";
export type { BrandContext, ContentBrief, ContentPlanInput } from "./schemas/brief";
export { claimSchema, conceptIdSchema } from "./schemas/common";
export type { Claim } from "./schemas/common";
export { contentConceptSchema } from "./schemas/concept";
export type { ContentConcept } from "./schemas/concept";
export * from "./schemas/formats";
export { hookVariantSchema, hookVariantSetSchema, platformContentVariantSchema, variantDetailSchema } from "./schemas/variant";
export type { HookVariant, PlatformContentVariant, VariantDetail } from "./schemas/variant";
export { contentExplanationSchema, contentReviewResultSchema, findingSchema } from "./schemas/review";
export type { ContentExplanation, ContentReviewResult, Finding } from "./schemas/review";
export * from "./schemas/lineage";

export { getAdapter, briefsFor, draftsFor, ADAPTERS } from "./adapters";
export type { AdaptContext, CampaignContext, PlatformAdapter } from "./adapters";
export { generateMockVariant, generateMockVariants, isMockContent, MOCK_NOTICE } from "./adapters/mock-generator";

export { evaluateContent } from "./quality/evaluator";
export type { EvaluationInput, VariantUnderReview } from "./quality/evaluator";
export { checkBrand, effectiveInformalityCeiling } from "./quality/brand";
export { checkClaims, looksLikeMeasurableClaim } from "./quality/claims";
export { checkSafety } from "./quality/safety";
export { checkContentMix, summarizeMix } from "./quality/mix";
export { checkDuplication, checkDuplicateHooks, compareVariants, comparableText, DUPLICATE_THRESHOLD, WEAK_DIFFERENTIATION_THRESHOLD } from "./quality/duplication";
export { normalize, textSimilarity, containsTerm, wordCount } from "./quality/text";

export { PROMPT_TEMPLATES, copywriterHooksTemplate, copywriterVariantTemplate, contentReviewerTemplate, creativeReviewTemplate, platformAdapterTemplate } from "./prompts/templates";
export { templateKey, contextBlock, STRUCTURED_OUTPUT_INSTRUCTION } from "./prompts/types";
export type { PromptRole, PromptTemplate } from "./prompts/types";
