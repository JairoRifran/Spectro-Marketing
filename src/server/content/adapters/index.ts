import { DomainError } from "@/server/errors";
import { isPlannedPlatform, type SupportedPlatform } from "../platforms";
import type { ContentBrief } from "../schemas/brief";
import type { PlatformContentVariant } from "../schemas/variant";
import { ADAPTERS } from "./platform-adapters";
import type { AdaptContext, PlatformAdapter } from "./types";

export type { AdaptContext, CampaignContext, PlatformAdapter } from "./types";
export { ADAPTERS, facebookAdapter, instagramAdapter, linkedinAdapter, tiktokAdapter, youtubeShortsAdapter } from "./platform-adapters";

export function getAdapter(platform: string): PlatformAdapter {
  const adapter = ADAPTERS[platform];
  if (adapter) return adapter;
  if (isPlannedPlatform(platform)) {
    throw new DomainError("validation", `La plataforma ${platform} todavía no tiene adaptador.`, "platform_not_supported");
  }
  throw new DomainError("validation", `Plataforma desconocida: ${platform}.`, "platform_unknown");
}

/** One brief per platform the concept targets. */
export function briefsFor(context: AdaptContext): ContentBrief[] {
  return context.concept.platforms.map((platform: SupportedPlatform) => getAdapter(platform).brief(context));
}

/** One native draft per platform the concept targets. All are marked as mock output. */
export function draftsFor(context: AdaptContext): PlatformContentVariant[] {
  return context.concept.platforms.map((platform: SupportedPlatform) => getAdapter(platform).draft(context));
}
