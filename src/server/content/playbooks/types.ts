import type { ContentType } from "../content-types";
import type { CtaType } from "../ctas";
import type { HookType } from "../hooks";
import type { ContentFormat, SupportedPlatform } from "../platforms";

// A playbook is the maintainable source of truth for how one platform is written for.
// Everything here is documented best practice, never a performance promise: no field in
// this shape may claim a piece will reach, convert, or go viral. Ranking systems are not
// published and we do not model them.

export interface LengthGuideline {
  /** Inclusive character bounds for written copy the audience reads. */
  captionChars: { min: number; max: number };
  /** Inclusive second bounds for anything with a timeline. Absent for still formats. */
  durationSeconds?: { min: number; max: number };
  /** Words the opening should stay under so it lands before the audience decides. */
  hookMaxWords: number;
}

export interface VideoGuideline {
  /** How long the opening has to establish why to stay, in seconds. */
  openingWindowSeconds: number;
  aspectRatio: string;
  captionsRequired: boolean;
  notes: readonly string[];
}

export interface VisualGuideline {
  aspectRatios: readonly string[];
  safeAreaNotes: readonly string[];
  notes: readonly string[];
}

export interface QualityCheck {
  id: string;
  description: string;
  severity: "error" | "warning";
}

export interface PlatformPlaybook {
  platform: SupportedPlatform;
  /** One sentence a human can read to understand what this platform is for. */
  summary: string;
  primaryObjectives: readonly ContentType[];
  preferredFormats: readonly ContentFormat[];
  tone: {
    register: string;
    /** How far the brand may relax, when the brand allows it at all. */
    informalityCeiling: "formal" | "professional" | "conversational" | "casual";
    notes: readonly string[];
  };
  hookGuidelines: {
    preferredTypes: readonly HookType[];
    discouragedTypes: readonly HookType[];
    notes: readonly string[];
  };
  lengthGuidelines: LengthGuideline;
  captionGuidelines: readonly string[];
  ctaGuidelines: {
    preferredTypes: readonly CtaType[];
    notes: readonly string[];
  };
  visualGuidelines: VisualGuideline;
  videoGuidelines?: VideoGuideline;
  storytellingPatterns: readonly string[];
  do: readonly string[];
  dont: readonly string[];
  qualityChecks: readonly QualityCheck[];
}
