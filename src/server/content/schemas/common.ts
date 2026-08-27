import { z } from "zod";
import { CONTENT_TYPES } from "../content-types";
import { CAMPAIGN_OBJECTIVES, CTA_TYPES } from "../ctas";
import { HOOK_TYPES } from "../hooks";
import { CONTENT_FORMATS, PLATFORMS, SUPPORTED_PLATFORMS } from "../platforms";

// One Zod mirror per taxonomy, derived from the same const arrays the domain uses, so a new
// platform or hook cannot be added to one half and forgotten in the other.

export const platformSchema = z.enum(PLATFORMS);
export const supportedPlatformSchema = z.enum(SUPPORTED_PLATFORMS);
export const contentFormatSchema = z.enum(CONTENT_FORMATS);
export const contentTypeSchema = z.enum(CONTENT_TYPES);
export const hookTypeSchema = z.enum(HOOK_TYPES);
export const ctaTypeSchema = z.enum(CTA_TYPES);
export const campaignObjectiveSchema = z.enum(CAMPAIGN_OBJECTIVES);

export const shortText = z.string().trim().min(1).max(300);
export const bodyText = z.string().trim().min(1).max(6000);
export const noteText = z.string().trim().min(1).max(600);
export const notes = z.array(noteText).max(20).default([]);

/**
 * A claim the piece makes that a reader could reasonably ask us to prove. Carrying it as
 * structured data rather than prose is what lets the quality engine refuse to wave it
 * through, and what gives a future evidence store something to attach to.
 */
export const claimSchema = z.object({
  text: shortText,
  requiresEvidence: z.boolean().default(true),
  evidenceRefs: z.array(z.string().trim().min(1).max(200)).max(10).default([]),
});
export type Claim = z.infer<typeof claimSchema>;

/** Stable identifier shared by every variant born from one idea. See content lineage. */
export const conceptIdSchema = z.string().trim().regex(/^CONCEPT-[A-Za-z0-9_-]{1,40}$/, "conceptId must look like CONCEPT-<id>");
