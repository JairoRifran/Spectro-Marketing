// Editorial intent taxonomy. A content type says what a piece is trying to do for the
// reader, which is separate from the campaign objective (what it is trying to do for the
// business) and from the format (how it is produced).

export const CONTENT_TYPES = [
  "educational",
  "problem_awareness",
  "product",
  "authority",
  "social_proof",
  "conversion",
  "entertainment",
  "storytelling",
  "comparison",
  "objection_handling",
  "case_study",
  "trend",
  "behind_the_scenes",
] as const;

export type ContentType = (typeof CONTENT_TYPES)[number];

// Funnel stage is used by the CTA coherence rules and by the content-mix warnings. It is a
// deliberate simplification: a type sits where it most often sits, not where it always sits.
export const FUNNEL_STAGES = ["awareness", "consideration", "decision"] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

const STAGE_BY_TYPE: Record<ContentType, FunnelStage> = {
  educational: "awareness",
  problem_awareness: "awareness",
  entertainment: "awareness",
  storytelling: "awareness",
  trend: "awareness",
  behind_the_scenes: "awareness",
  authority: "consideration",
  social_proof: "consideration",
  comparison: "consideration",
  case_study: "consideration",
  objection_handling: "consideration",
  product: "decision",
  conversion: "decision",
};

export function stageOf(type: ContentType): FunnelStage {
  return STAGE_BY_TYPE[type];
}

// Types whose whole job is to sell. The mix checker warns when these dominate a plan.
export const PROMOTIONAL_TYPES: readonly ContentType[] = ["product", "conversion"];

export function isPromotional(type: ContentType) {
  return PROMOTIONAL_TYPES.includes(type);
}
