export function retryDelayMs(attempt: number, baseMs = 30_000, maxMs = 3_600_000) {
  if (!Number.isInteger(attempt) || attempt < 1) throw new Error("attempt must be a positive integer");
  return Math.min(maxMs, baseMs * 2 ** (attempt - 1));
}

export function retryDecision(attemptCount: number, maxAttempts: number, retryable: boolean) {
  if (!retryable || attemptCount >= maxAttempts) return { retry: false as const, delayMs: 0 };
  return { retry: true as const, delayMs: retryDelayMs(attemptCount) };
}
