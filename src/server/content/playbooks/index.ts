import { DomainError } from "@/server/errors";
import { isPlannedPlatform, type SupportedPlatform } from "../platforms";
import { facebookPlaybook } from "./facebook";
import { instagramPlaybook } from "./instagram";
import { linkedinPlaybook } from "./linkedin";
import { tiktokPlaybook } from "./tiktok";
import type { PlatformPlaybook } from "./types";
import { youtubeShortsPlaybook } from "./youtube-shorts";

export type { PlatformPlaybook, QualityCheck, LengthGuideline, VideoGuideline, VisualGuideline } from "./types";

export const PLAYBOOKS: Record<SupportedPlatform, PlatformPlaybook> = {
  instagram: instagramPlaybook,
  facebook: facebookPlaybook,
  tiktok: tiktokPlaybook,
  youtube_shorts: youtubeShortsPlaybook,
  linkedin: linkedinPlaybook,
};

/**
 * A playbook is the only sanctioned source of platform editorial rules. Planned platforms
 * fail loudly rather than falling back to a neighbour's rules, because a silent fallback is
 * exactly how one text ends up copied across every network.
 */
export function getPlaybook(platform: string): PlatformPlaybook {
  const playbook = PLAYBOOKS[platform as SupportedPlatform];
  if (playbook) return playbook;
  if (isPlannedPlatform(platform)) {
    throw new DomainError("validation", `La plataforma ${platform} todavía no tiene playbook editorial.`, "platform_not_supported");
  }
  throw new DomainError("validation", `Plataforma desconocida: ${platform}.`, "platform_unknown");
}

export function allPlaybooks(): PlatformPlaybook[] {
  return Object.values(PLAYBOOKS);
}
