// Shared retry timing: exponential backoff that also honours a server's retry-after hint.
const MAX_HINT_MS = 60000;

export const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/** Wait before retry number `attempt` (1-based): base, 2x base, 4x base ... (never less than retry-after, capped at 60 s). */
export function backoffDelay(attempt, baseMs, error) {
  const exponential = baseMs * 2 ** (attempt - 1);
  const seconds = Number(error?.headers?.get?.('retry-after'));
  const hinted = Number.isFinite(seconds) && seconds > 0 ? Math.min(seconds * 1000, MAX_HINT_MS) : 0;
  return Math.max(exponential, hinted);
}
