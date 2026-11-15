/**
 * THE place where a provider name becomes an adapter. Nothing else in the
 * codebase imports a provider SDK or calls a provider URL.
 *
 * The router answers every model call with the model of the agent it is for
 * (`resolve.ts`): an agent's own `llm` from the team file, or the `.env` default.
 * Each provider gets its own concurrency limit and timeout (local Ollama: one
 * call at a time and more patience), and rate limits / server errors are
 * retried with backoff. Adding a provider = one adapter file + one case below.
 */
import type { LLMProviderName } from '@agent-office/shared';
import type { Env } from '../env';
import { LLMError } from './errors';
import { createLimiter } from './limiter';
import { createMockProvider } from './mock';
import { createAnthropicProvider } from './providers/anthropic';
import { createGeminiProvider } from './providers/gemini';
import type { FetchLike } from './providers/http';
import { createOllamaProvider } from './providers/ollama';
import { createOpenRouterProvider } from './providers/openrouter';
import { agentForCall, resolveModel, type ResolvedModel } from './resolve';
import { withRetry } from './retry';
import type { LLMProvider, LLMRequest, LLMResponse } from './types';

export type { LLMProvider, LLMRequest, LLMResponse, LLMCallMeta, ChatMessage } from './types';
export { LLMError } from './errors';

export interface LLMRouter extends LLMProvider {
  /** The longest single-call timeout of any provider (for the orchestrator's safety net). */
  readonly maxTimeoutMs: number;
  /** The model an agent's calls go to. */
  resolve(agent: Parameters<typeof resolveModel>[0]): ResolvedModel;
}

export interface RouterDeps {
  /** Replace adapters (tests). */
  adapters?: Partial<Record<LLMProviderName, LLMProvider>>;
  fetch?: FetchLike;
  sleep?: (ms: number, signal?: AbortSignal) => Promise<void>;
}

function missingKey(provider: LLMProviderName, variable: string): LLMProvider {
  return {
    name: provider,
    async generate(request: LLMRequest): Promise<LLMResponse> {
      throw new LLMError({
        provider,
        model: request.model ?? '',
        message: `${variable} is not set in .env`,
      });
    },
  };
}

function createAdapter(provider: LLMProviderName, env: Env, deps: RouterDeps): LLMProvider {
  switch (provider) {
    case 'mock':
      return createMockProvider({
        minDelayMs: env.MOCK_MIN_DELAY_MS,
        maxDelayMs: env.MOCK_MAX_DELAY_MS,
        walkInMs: env.MOCK_WALK_IN_MS,
      });
    case 'gemini':
      return env.GEMINI_API_KEY
        ? createGeminiProvider({ apiKey: env.GEMINI_API_KEY })
        : missingKey(provider, 'GEMINI_API_KEY');
    case 'anthropic':
      return env.ANTHROPIC_API_KEY
        ? createAnthropicProvider({ apiKey: env.ANTHROPIC_API_KEY })
        : missingKey(provider, 'ANTHROPIC_API_KEY');
    case 'ollama':
      return createOllamaProvider({ baseUrl: env.OLLAMA_BASE_URL, fetch: deps.fetch });
    case 'openrouter':
      return env.OPENROUTER_API_KEY
        ? createOpenRouterProvider({ apiKey: env.OPENROUTER_API_KEY, fetch: deps.fetch })
        : missingKey(provider, 'OPENROUTER_API_KEY');
  }
}

export function timeoutFor(provider: LLMProviderName, env: Env): number {
  return provider === 'ollama' ? env.OLLAMA_TIMEOUT_MS : env.LLM_TIMEOUT_MS;
}

export function concurrencyFor(provider: LLMProviderName, env: Env): number {
  return provider === 'ollama' ? env.OLLAMA_CONCURRENCY : env.LLM_CONCURRENCY;
}

export function createLLMProvider(env: Env, deps: RouterDeps = {}): LLMRouter {
  const adapters = new Map<LLMProviderName, LLMProvider>();
  const limiters = new Map<LLMProviderName, ReturnType<typeof createLimiter>>();

  const adapterFor = (provider: LLMProviderName): LLMProvider => {
    let adapter = adapters.get(provider);
    if (!adapter) {
      adapter = deps.adapters?.[provider] ?? createAdapter(provider, env, deps);
      adapters.set(provider, adapter);
    }
    return adapter;
  };
  const limiterFor = (provider: LLMProviderName) => {
    let run = limiters.get(provider);
    if (!run) {
      run = createLimiter(concurrencyFor(provider, env));
      limiters.set(provider, run);
    }
    return run;
  };

  return {
    name: env.LLM_PROVIDER,
    maxTimeoutMs: Math.max(env.LLM_TIMEOUT_MS, env.OLLAMA_TIMEOUT_MS),
    resolve: (agent) => resolveModel(agent, env),

    generate(request: LLMRequest): Promise<LLMResponse> {
      const { provider, model } = resolveModel(agentForCall(request.meta), env);
      const adapter = adapterFor(provider);
      const timeoutMs = timeoutFor(provider, env);

      const attempt = async (): Promise<LLMResponse> => {
        const timeout = AbortSignal.timeout(timeoutMs);
        const signal = request.signal ? AbortSignal.any([request.signal, timeout]) : timeout;
        try {
          return await adapter.generate({ ...request, model, signal });
        } catch (err) {
          if (timeout.aborted && !request.signal?.aborted) {
            throw new LLMError({
              provider,
              model,
              message: `no answer within ${Math.round(timeoutMs / 1000)} s`,
              retryable: false,
              cause: err,
            });
          }
          throw err;
        }
      };

      // The slot stays taken while backing off, so a rate limit really slows us down.
      return limiterFor(provider)(() =>
        withRetry(attempt, { retries: env.LLM_RETRIES, signal: request.signal, sleep: deps.sleep }),
      );
    },
  };
}
