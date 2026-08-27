import { z } from "zod";
import { conceptIdSchema, shortText, supportedPlatformSchema } from "./common";

// Lineage is a domain contract only. No table is created here: Campaign Brain (M02.1) owns
// the campaign schema and adding content tables now would collide with it. The recommended
// persistence is documented in docs/content-intelligence.md and should be implemented once
// M02.1 has landed.

export const LINEAGE_STAGES = ["campaign", "concept", "brief", "variant", "review", "approved"] as const;
export type LineageStage = (typeof LINEAGE_STAGES)[number];

export const lineageNodeSchema = z.object({
  stage: z.enum(LINEAGE_STAGES),
  /** Identifier of the artefact at this stage; the campaign id, the concept id, and so on. */
  ref: z.string().trim().min(1).max(200),
  /** Set on variant-scoped stages so a chain can be read per platform. */
  platform: supportedPlatformSchema.optional(),
  note: shortText.optional(),
});
export type LineageNode = z.infer<typeof lineageNodeSchema>;

/**
 * One idea, tracked from the campaign that motivated it through to approval, across every
 * platform it was executed for. `conceptId` is what makes cross-platform analytics possible
 * later: the same idea keeps its identity even though each variant is written natively.
 */
export const contentLineageSchema = z.object({
  conceptId: conceptIdSchema,
  campaignId: z.string().trim().min(1).max(100),
  nodes: z.array(lineageNodeSchema).min(1).max(60),
});
export type ContentLineage = z.infer<typeof contentLineageSchema>;

export function nextStage(stage: LineageStage): LineageStage | null {
  const index = LINEAGE_STAGES.indexOf(stage);
  return index >= 0 && index < LINEAGE_STAGES.length - 1 ? LINEAGE_STAGES[index + 1] : null;
}

/** A chain is well-formed when its stages only ever move forward. */
export function lineageIsOrdered(nodes: LineageNode[]) {
  let highest = -1;
  for (const node of nodes) {
    const index = LINEAGE_STAGES.indexOf(node.stage);
    if (index < highest) return false;
    highest = Math.max(highest, index);
  }
  return true;
}
