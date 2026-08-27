import type { CampaignObjective } from "../ctas";
import type { ContentFormat, SupportedPlatform } from "../platforms";
import type { BrandContext, ContentBrief } from "../schemas/brief";
import type { ContentConcept } from "../schemas/concept";
import type { PlatformContentVariant } from "../schemas/variant";

export interface CampaignContext {
  campaignId: string;
  name: string;
  objective: CampaignObjective;
}

export interface AdaptContext {
  concept: ContentConcept;
  brand: BrandContext;
  campaign: CampaignContext;
}

/**
 * A platform adapter owns one platform's translation of an idea. It is split in two on
 * purpose: `brief` is the deterministic instruction set a writer receives, and `draft` is a
 * concrete execution. Today `draft` is deterministic and marked as mock; when a provider is
 * wired in it replaces the draft step alone, and the brief stays exactly as it is.
 */
export interface PlatformAdapter {
  readonly platform: SupportedPlatform;
  /** The format this platform uses for the concept, always one it actually supports. */
  chooseFormat(concept: ContentConcept): ContentFormat;
  brief(context: AdaptContext): ContentBrief;
  draft(context: AdaptContext): PlatformContentVariant;
}
