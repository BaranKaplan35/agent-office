/** Small helpers for the providers that use plain `fetch` (Ollama, OpenRouter). */
import type { LLMProviderName } from '@agent-office/shared';
import { describeStatus, isAbort, isRetryableStatus, LLMError, parseRetryAfter } from '../errors';

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

interface Ctx {
  provider: LLMProviderName;
  model: string;
  fetch: FetchLike;
  /** Message for a connection failure (nothing listening, DNS …). */
  unreachable: string;
}

/** The error text a provider put in its JSON body, if any. */
export async function errorDetail(res: Response): Promise<string | undefined> {
  try {
    const text = await res.text();
    try {
      const body = JSON.parse(text) as { error?: string | { message?: string } };
      const err = body.error;
      return (typeof err === 'string' ? err : err?.message)?.slice(0, 300) ?? text.slice(0, 300);
    } catch {
      return text.slice(0, 300) || undefined;
    }
  } catch {
    return undefined;
  }
}

/** POST JSON and return the parsed JSON body, turning every failure into an `LLMError`. */
export async function postJson<T>(
  ctx: Ctx,
  url: string,
  body: unknown,
  init: { headers?: Record<string, string>; signal?: AbortSignal } = {},
): Promise<T> {
  let res: Response;
  try {
    res = await ctx.fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...init.headers },
      body: JSON.stringify(body),
      signal: init.signal,
    });
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new LLMError({
      provider: ctx.provider,
      model: ctx.model,
      message: ctx.unreachable,
      retryable: false,
      cause: err,
    });
  }

  if (!res.ok) {
    const detail = await errorDetail(res);
    throw new LLMError({
      provider: ctx.provider,
      model: ctx.model,
      status: res.status,
      message: describeStatus(res.status, detail),
      retryable: isRetryableStatus(res.status),
      retryAfterMs: parseRetryAfter(res.headers.get('retry-after')),
    });
  }

  try {
    return (await res.json()) as T;
  } catch (err) {
    if (isAbort(err)) throw err;
    throw new LLMError({
      provider: ctx.provider,
      model: ctx.model,
      message: 'the answer was not valid JSON',
      retryable: true,
      cause: err,
    });
  }
}
