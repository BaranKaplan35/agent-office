import type { LLMProviderName } from '@agent-office/shared';

/**
 * A failed model call, with enough detail to retry it sensibly and to tell the user
 * which provider and model failed (the message always starts with them).
 */
export class LLMError extends Error {
  override name = 'LLMError';
  readonly provider: LLMProviderName;
  readonly model: string;
  /** HTTP status, when there was a response. */
  readonly status?: number;
  /** Worth trying again (rate limit, overload, server error, network hiccup). */
  readonly retryable: boolean;
  /** The provider asked us to wait this long before retrying. */
  readonly retryAfterMs?: number;

  constructor(options: {
    provider: LLMProviderName;
    model: string;
    message: string;
    status?: number;
    retryable?: boolean;
    retryAfterMs?: number;
    cause?: unknown;
  }) {
    super(`${options.provider} · ${options.model}: ${options.message}`, { cause: options.cause });
    this.provider = options.provider;
    this.model = options.model;
    this.status = options.status;
    this.retryable = options.retryable ?? false;
    this.retryAfterMs = options.retryAfterMs;
  }
}

/** 408, 425, 429 and 5xx are worth a retry; other 4xx are not. */
export function isRetryableStatus(status: number): boolean {
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

/** Parse a Retry-After header (seconds or an HTTP date) into milliseconds. */
export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const seconds = Number(value);
  if (Number.isFinite(seconds)) return Math.max(0, seconds * 1000);
  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - now);
}

/** A short, human message for an HTTP failure. */
export function describeStatus(status: number, detail?: string): string {
  const what =
    status === 401 || status === 403
      ? 'the API key was rejected'
      : status === 404
        ? 'model not found'
        : status === 429
          ? 'rate limit reached (free tiers are strict; it retries with a pause)'
          : status >= 500
            ? 'the provider had a server error'
            : 'the request was refused';
  return detail ? `${what} (HTTP ${status}: ${detail})` : `${what} (HTTP ${status})`;
}

/** Was this thrown because the call was aborted (cancel or timeout)? */
export function isAbort(err: unknown): boolean {
  return err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError');
}
