export const CAMPAIGN_STRATEGY_TASK_TYPES = [
  "campaign.strategy.draft",
  "campaign.research",
  "campaign.channel_strategy",
  "campaign.content_plan",
  "campaign.strategy.finalize",
] as const;

export function isCampaignStrategyTask(type: string) {
  return (CAMPAIGN_STRATEGY_TASK_TYPES as readonly string[]).includes(type);
}

/**
 * Preserve every previous attempt and grant only the capacity needed for one explicit retry.
 * The table caps max_attempts at twenty, so a permanently broken stage cannot be reopened forever.
 */
export function retryAttemptCeiling(attemptCount: number, maxAttempts: number) {
  if (!Number.isInteger(attemptCount) || !Number.isInteger(maxAttempts) || attemptCount < 0 || attemptCount >= 20) return null;
  return Math.min(20, Math.max(maxAttempts, attemptCount + 1));
}
