// Platform and format taxonomy for the Content Intelligence layer.
// Supported platforms carry a full editorial playbook. Planned platforms exist so that
// callers can name them in contracts and tests without pretending we can already write
// natively for them; nothing may adapt content for a planned platform.

export const SUPPORTED_PLATFORMS = ["instagram", "facebook", "tiktok", "youtube_shorts", "linkedin"] as const;
export const PLANNED_PLATFORMS = ["threads", "x", "pinterest"] as const;
export const PLATFORMS = [...SUPPORTED_PLATFORMS, ...PLANNED_PLATFORMS] as const;

export type SupportedPlatform = (typeof SUPPORTED_PLATFORMS)[number];
export type PlannedPlatform = (typeof PLANNED_PLATFORMS)[number];
export type Platform = (typeof PLATFORMS)[number];

export const CONTENT_FORMATS = ["reel", "short_video", "carousel", "story", "static_post", "text_post", "document_post"] as const;
export type ContentFormat = (typeof CONTENT_FORMATS)[number];

// A format belongs to exactly one production shape. The shape decides which detail schema
// a variant must carry, so adapters and the quality engine agree without a lookup table
// per call site.
export const FORMAT_SHAPES = {
  reel: "video",
  short_video: "video",
  carousel: "carousel",
  story: "story",
  static_post: "static",
  text_post: "text",
  document_post: "carousel",
} as const satisfies Record<ContentFormat, "video" | "carousel" | "story" | "static" | "text">;

export type FormatShape = (typeof FORMAT_SHAPES)[ContentFormat];

const SUPPORTED_FORMATS: Record<SupportedPlatform, readonly ContentFormat[]> = {
  instagram: ["reel", "carousel", "story", "static_post"],
  facebook: ["reel", "short_video", "carousel", "story", "static_post", "text_post"],
  tiktok: ["short_video"],
  youtube_shorts: ["short_video"],
  linkedin: ["text_post", "document_post", "short_video", "static_post"],
};

export function isSupportedPlatform(value: string): value is SupportedPlatform {
  return (SUPPORTED_PLATFORMS as readonly string[]).includes(value);
}

export function isPlannedPlatform(value: string): value is PlannedPlatform {
  return (PLANNED_PLATFORMS as readonly string[]).includes(value);
}

export function formatsForPlatform(platform: SupportedPlatform): readonly ContentFormat[] {
  return SUPPORTED_FORMATS[platform];
}

export function supportsFormat(platform: SupportedPlatform, format: ContentFormat) {
  return SUPPORTED_FORMATS[platform].includes(format);
}

export function platformsForFormat(format: ContentFormat): SupportedPlatform[] {
  return SUPPORTED_PLATFORMS.filter((platform) => supportsFormat(platform, format));
}

export function shapeOf(format: ContentFormat): FormatShape {
  return FORMAT_SHAPES[format];
}
