// What a call cost, in dollars.
//
// Tokens are the fact and the database stores them; this turns them into money. Kept in one file
// with the date it was checked, because a price table scattered through call sites is a table
// nobody updates, and a number in a UI that silently drifts from the invoice is worse than no
// number at all.
//
// Prices are Anthropic's published first-party rates, in US dollars per million tokens, checked
// on 2026-08-31. A model that is not listed costs nothing here rather than guessing: a local
// model genuinely is free, and an unknown one is better reported as zero-and-obvious than as a
// plausible invention.

interface Price {
  /** Fresh prompt tokens. */
  input: number;
  /** Generated tokens, thinking included — adaptive thinking bills from the same budget. */
  output: number;
}

const PRICES: Record<string, Price> = {
  "claude-opus-5": { input: 5, output: 25 },
  "claude-sonnet-5": { input: 2, output: 10 },
  "claude-haiku-4-5": { input: 1, output: 5 },
};

/**
 * Cache multipliers, applied to the model's own input rate.
 *
 * A read is roughly a tenth of a fresh token, which is the entire reason for the caching work. A
 * write is roughly a quarter more than a fresh one — so a prefix written and never read is a
 * small loss, and that is measured rather than assumed.
 */
const CACHE_READ = 0.1;
const CACHE_WRITE = 1.25;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
}

export const EMPTY_USAGE: TokenUsage = { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 };

/** Whether we can price this model at all. Callers show a token count either way. */
export function isPriced(model: string): boolean {
  return model in PRICES;
}

/** Dollars for one call. Rounded to the millionth, which is the column's precision. */
export function costUsd(model: string, usage: TokenUsage): number {
  const price = PRICES[model];
  if (!price) return 0;
  const perToken = price.input / 1_000_000;
  const total =
    usage.inputTokens * perToken +
    usage.cacheReadTokens * perToken * CACHE_READ +
    usage.cacheWriteTokens * perToken * CACHE_WRITE +
    usage.outputTokens * (price.output / 1_000_000);
  return Math.round(total * 1_000_000) / 1_000_000;
}

/**
 * What the same call would have cost with nothing cached.
 *
 * The saving is only legible against this: a bill that fell is indistinguishable from a month
 * with fewer campaigns unless you can say what the identical work used to cost.
 */
export function uncachedCostUsd(model: string, usage: TokenUsage): number {
  return costUsd(model, {
    inputTokens: usage.inputTokens + usage.cacheReadTokens + usage.cacheWriteTokens,
    outputTokens: usage.outputTokens,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
  });
}
