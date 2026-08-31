import { isDemoMode } from "@/lib/env";
import { getOrganizationContext } from "@/features/organizations/context";
import { uncachedCostUsd, type TokenUsage } from "@/server/agents/pricing";

// What a campaign cost, read back.
//
// Storing the tokens was half the job. A number nobody can see is a number nobody acts on, and
// the whole reason this work started was that "make it cheaper" had no denominator: not a bill,
// not a per-campaign figure, nothing but estimates.
//
// Two figures are shown, never one. The amount spent is meaningless on its own -- a smaller bill
// and a quieter month look identical -- so it is paired with what the same calls would have cost
// with nothing cached. That difference is the only honest evidence that the caching works, and
// if it ever collapses to zero, something silently invalidated the prefix.

export interface CampaignCost {
  /** Runs that actually billed. A deterministic or local run is not one of them. */
  calls: number;
  usd: number;
  /** The same calls priced as if nothing had been cached. */
  wouldHaveCostUsd: number;
  tokens: TokenUsage;
  /** Which models answered, most expensive first, so the routing is visible. */
  byModel: Array<{ model: string; calls: number; usd: number }>;
}

interface RunRow {
  model: string | null;
  input_tokens: number | null;
  output_tokens: number | null;
  cache_read_tokens: number | null;
  cache_write_tokens: number | null;
  cost_usd: number | string | null;
}

export function summarise(rows: RunRow[]): CampaignCost {
  const tokens: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };
  const models = new Map<string, { calls: number; usd: number }>();
  let usd = 0;
  let wouldHaveCostUsd = 0;
  let calls = 0;

  for (const row of rows) {
    // `cost_usd` arrives as a string from a numeric column often enough to be worth coercing.
    const rowUsd = Number(row.cost_usd ?? 0);
    if (!rowUsd) continue;
    const model = row.model ?? "desconocido";
    const rowTokens: TokenUsage = {
      inputTokens: row.input_tokens ?? 0,
      outputTokens: row.output_tokens ?? 0,
      cacheReadTokens: row.cache_read_tokens ?? 0,
      cacheWriteTokens: row.cache_write_tokens ?? 0,
    };

    calls += 1;
    usd += rowUsd;
    wouldHaveCostUsd += uncachedCostUsd(model, rowTokens);
    for (const key of Object.keys(tokens) as Array<keyof TokenUsage>) tokens[key] += rowTokens[key];

    const seen = models.get(model) ?? { calls: 0, usd: 0 };
    models.set(model, { calls: seen.calls + 1, usd: seen.usd + rowUsd });
  }

  return {
    calls,
    usd: Math.round(usd * 1_000_000) / 1_000_000,
    wouldHaveCostUsd: Math.round(wouldHaveCostUsd * 1_000_000) / 1_000_000,
    tokens,
    byModel: [...models.entries()]
      .map(([model, value]) => ({ model, ...value }))
      .sort((a, b) => b.usd - a.usd),
  };
}

export async function getCampaignCost(campaignId: string): Promise<CampaignCost | null> {
  if (isDemoMode) return null;
  const ctx = await getOrganizationContext();
  if (!ctx) return null;

  // Joined through tasks because that is where the campaign lives; a run knows its task, not its
  // campaign. Bounded like every other read on this page.
  const { data } = await ctx.db
    .from("agent_runs")
    .select("model,input_tokens,output_tokens,cache_read_tokens,cache_write_tokens,cost_usd,tasks!inner(campaign_id)")
    .eq("organization_id", ctx.orgId)
    .eq("tasks.campaign_id", campaignId)
    .limit(500);

  const cost = summarise((data ?? []) as unknown as RunRow[]);
  return cost.calls > 0 ? cost : null;
}
