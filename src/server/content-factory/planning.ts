import type { ContentFormat, SupportedPlatform } from "@/server/content/platforms";
import { formatsForPlatform, isSupportedPlatform, supportsFormat } from "@/server/content/platforms";

// Deterministic editorial planning. Nothing here is hardcoded to "5 TikToks, 3 Reels": the
// volume and the shape of a plan are derived from the campaign's own channels, duration,
// frequency and pillar weights. Given the same campaign it always produces the same plan.

export interface PillarWeight {
  name: string;
  /** Share of the plan this pillar should carry, as a fraction or a percentage. */
  weight: number;
}

export interface PillarAllocation {
  name: string;
  weight: number;
  targetShare: number;
  count: number;
  /** Signed difference between the share achieved and the share asked for. */
  deviation: number;
}

export interface DistributionResult {
  allocations: PillarAllocation[];
  total: number;
  warnings: string[];
}

/** Deviation above which a rounding difference stops being a rounding difference. */
export const PILLAR_DEVIATION_WARNING = 0.15;

/**
 * Distributes a fixed number of pieces across weighted pillars using largest remainder.
 * Exact proportional splits are usually impossible at small counts, so the method minimises
 * total deviation instead of demanding a sum that cannot exist, and reports what it could not
 * honour rather than hiding it.
 */
export function distributeByPillars(pillars: PillarWeight[], total: number): DistributionResult {
  const warnings: string[] = [];
  if (total < 0 || !Number.isInteger(total)) throw new Error("Plan size must be a non-negative integer");
  if (!pillars.length) return { allocations: [], total: 0, warnings: ["El plan no tiene pilares definidos."] };

  const positive = pillars.filter((pillar) => pillar.weight > 0);
  if (!positive.length) return { allocations: [], total: 0, warnings: ["Todos los pilares tienen peso cero."] };

  const weightSum = positive.reduce((sum, pillar) => sum + pillar.weight, 0);
  const shares = positive.map((pillar) => ({ ...pillar, targetShare: pillar.weight / weightSum }));

  const exact = shares.map((pillar) => pillar.targetShare * total);
  const counts = exact.map((value) => Math.floor(value));
  let remaining = total - counts.reduce((sum, value) => sum + value, 0);

  // Largest remainder: the pieces left over by flooring go to the pillars that lost the most.
  const order = exact
    .map((value, index) => ({ index, remainder: value - Math.floor(value) }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index);
  for (const entry of order) {
    if (remaining <= 0) break;
    counts[entry.index] += 1;
    remaining -= 1;
  }

  const allocations: PillarAllocation[] = shares.map((pillar, index) => {
    const achieved = total ? counts[index] / total : 0;
    return { name: pillar.name, weight: pillar.weight, targetShare: pillar.targetShare, count: counts[index], deviation: achieved - pillar.targetShare };
  });

  for (const allocation of allocations) {
    if (Math.abs(allocation.deviation) > PILLAR_DEVIATION_WARNING) {
      warnings.push(
        `El pilar "${allocation.name}" queda en ${(allocation.count / (total || 1) * 100).toFixed(0)}% frente al ${(allocation.targetShare * 100).toFixed(0)}% previsto; el plan es demasiado chico para respetar el peso.`,
      );
    }
    if (allocation.targetShare > 0 && allocation.count === 0) {
      warnings.push(`El pilar "${allocation.name}" queda sin ninguna pieza en un plan de ${total}.`);
    }
  }

  return { allocations, total: counts.reduce((sum, value) => sum + value, 0), warnings };
}

export interface CampaignChannel {
  channel: string;
  enabled: boolean;
  priority: number;
  formats: string[];
  publishingFrequency: string | null;
}

export interface ChannelPlan {
  platform: SupportedPlatform;
  pieces: number;
  formats: ContentFormat[];
  warnings: string[];
}

// Campaign Brain stores channel codes from its own enum, where short-form video on YouTube
// is simply "youtube". Content Intelligence names the same surface "youtube_shorts" because it
// writes for that format specifically. Map at this boundary rather than widening either
// vocabulary, and never drop a configured channel silently.
const CHANNEL_CODE_ALIASES: Record<string, SupportedPlatform> = { youtube: "youtube_shorts" };

export function toSupportedPlatform(channelCode: string): SupportedPlatform | null {
  if (isSupportedPlatform(channelCode)) return channelCode;
  return CHANNEL_CODE_ALIASES[channelCode] ?? null;
}

/** Weekly cadence implied by a free-text frequency. Unknown text falls back to weekly. */
export function weeklyCadence(frequency: string | null | undefined): number {
  const text = (frequency ?? "").toLowerCase();
  if (/diar|daily|todos los d/.test(text)) return 7;
  if (/3.*(semana|week)|tres.*semana/.test(text)) return 3;
  if (/2.*(semana|week)|dos.*semana|quincen/.test(text)) return 2;
  if (/semanal|weekly|1.*semana/.test(text)) return 1;
  if (/mensual|monthly/.test(text)) return 0.25;
  return 1;
}

/**
 * How much content each enabled channel needs, from the campaign's own configuration.
 * A channel whose declared formats the platform cannot produce falls back to the platform's
 * own supported formats and says so, rather than planning something unproducible.
 */
export function planChannels(channels: CampaignChannel[], durationWeeks: number): ChannelPlan[] {
  const weeks = Math.max(1, Math.round(durationWeeks));
  const plans: ChannelPlan[] = [];

  for (const channel of channels) {
    if (!channel.enabled) continue;
    const platform = toSupportedPlatform(channel.channel);
    if (!platform) continue;
    const warnings: string[] = [];

    const declared = channel.formats.filter((format): format is ContentFormat => supportsFormat(platform, format as ContentFormat));
    if (declared.length !== channel.formats.length) {
      const rejected = channel.formats.filter((format) => !supportsFormat(platform, format as ContentFormat));
      warnings.push(`${platform} no admite ${rejected.join(", ")}; se usan los formatos soportados por la plataforma.`);
    }
    const formats = declared.length ? declared : [...formatsForPlatform(platform)];

    const pieces = Math.max(1, Math.round(weeklyCadence(channel.publishingFrequency) * weeks));
    plans.push({ platform, pieces, formats, warnings });
  }

  // Higher priority first so a truncated plan keeps the channels the campaign cares about.
  return plans.sort((a, b) => {
    const priorityA = channels.find((channel) => toSupportedPlatform(channel.channel) === a.platform)?.priority ?? 0;
    const priorityB = channels.find((channel) => toSupportedPlatform(channel.channel) === b.platform)?.priority ?? 0;
    return priorityB - priorityA || a.platform.localeCompare(b.platform);
  });
}

export interface PlannedPiece {
  platform: SupportedPlatform;
  format: ContentFormat;
  pillar: string;
  angle: string;
  index: number;
}

/**
 * The concrete plan: which platform, which format, which pillar and which angle each piece
 * carries. Pillars are assigned round-robin over the distribution so a single pillar never
 * lands entirely on one channel, and angles rotate so the set is not one idea repeated.
 */
export function buildContentPlan(input: {
  channels: ChannelPlan[];
  pillars: PillarWeight[];
  angles: string[];
  maxPieces: number;
}): { pieces: PlannedPiece[]; distribution: DistributionResult; warnings: string[] } {
  const warnings: string[] = [];
  const requested = input.channels.reduce((sum, plan) => sum + plan.pieces, 0);
  const total = Math.min(requested, input.maxPieces);
  if (requested > input.maxPieces) {
    warnings.push(`La campaña pide ${requested} piezas y el plan se limita a ${input.maxPieces} en esta ejecución.`);
  }

  const distribution = distributeByPillars(input.pillars, total);
  warnings.push(...distribution.warnings);

  // Flatten the pillar allocation into a sequence, then deal it across channels in turn.
  const pillarQueue: string[] = [];
  for (const allocation of distribution.allocations) {
    for (let index = 0; index < allocation.count; index += 1) pillarQueue.push(allocation.name);
  }
  pillarQueue.sort((a, b) => a.localeCompare(b));

  const slots: Array<{ platform: SupportedPlatform; format: ContentFormat }> = [];
  const remaining = input.channels.map((plan) => ({ ...plan, left: plan.pieces }));
  let cursor = 0;
  while (slots.length < total) {
    const channel = remaining[cursor % remaining.length];
    cursor += 1;
    if (!remaining.some((entry) => entry.left > 0)) break;
    if (channel.left <= 0) continue;
    const format = channel.formats[(channel.pieces - channel.left) % channel.formats.length];
    slots.push({ platform: channel.platform, format });
    channel.left -= 1;
  }

  const angles = input.angles.length ? input.angles : ["Ángulo principal"];
  const pieces: PlannedPiece[] = slots.map((slot, index) => ({
    platform: slot.platform,
    format: slot.format,
    pillar: pillarQueue[index] ?? distribution.allocations[0]?.name ?? "General",
    angle: angles[index % angles.length],
    index,
  }));

  return { pieces, distribution, warnings };
}
