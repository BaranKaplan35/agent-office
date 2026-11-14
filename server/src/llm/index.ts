/**
 * THE place where the model backend is chosen. Nothing else in the codebase
 * imports a provider SDK. Switch providers with LLM_PROVIDER in .env.
 */
import type { Env } from '../env';
import { withConcurrencyLimit } from './limiter';
import { createMockProvider } from './mock';
import type { LLMProvider } from './types';

export type { LLMProvider, LLMRequest, LLMResponse, LLMCallMeta, ChatMessage } from './types';

export function createLLMProvider(env: Env): LLMProvider {
  let provider: LLMProvider;
  switch (env.LLM_PROVIDER) {
    case 'mock':
      provider = createMockProvider({
        minDelayMs: env.MOCK_MIN_DELAY_MS,
        maxDelayMs: env.MOCK_MAX_DELAY_MS,
      });
      break;
    case 'gemini':
    case 'anthropic':
      throw new Error(
        `The "${env.LLM_PROVIDER}" provider arrives in phase 2. Use LLM_PROVIDER=mock for now.`,
      );
  }
  return withConcurrencyLimit(provider, env.LLM_CONCURRENCY);
}
