import { LLMError } from './errors';

export interface RetryOptions {
  /** Extra attempts after the first one. */
  retries: number;
  /** First pause; doubles each time (plus a little jitter). */
  baseDelayMs?: number;
  /** Never wait longer than this between attempts. */
  maxDelayMs?: number;
  signal?: AbortSignal;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
  random?: () => number;
}

export function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal?.reason);
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

/** How long to wait before attempt `attempt` (1-based retry number). */
export function backoffDelay(
  attempt: number,
  err: unknown,
  { baseDelayMs = 1500, maxDelayMs = 20_000, random = Math.random }: RetryOptions,
): number {
  const asked = err instanceof LLMError ? err.retryAfterMs : undefined;
  const exponential = baseDelayMs * 2 ** (attempt - 1) * (0.8 + 0.4 * random());
  return Math.min(maxDelayMs, Math.max(asked ?? 0, exponential));
}

/**
 * Run `job`, retrying retryable `LLMError`s (rate limits, server errors) with
 * exponential backoff. Stops at once when the call is aborted.
 */
export async function withRetry<T>(job: () => Promise<T>, options: RetryOptions): Promise<T> {
  const wait = options.sleep ?? sleep;
  for (let attempt = 0; ; attempt++) {
    try {
      return await job();
    } catch (err) {
      const retryable = err instanceof LLMError && err.retryable;
      if (!retryable || attempt >= options.retries || options.signal?.aborted) throw err;
      await wait(backoffDelay(attempt + 1, err, options), options.signal);
    }
  }
}
