/**
 * OpenRouter: many models behind one OpenAI-compatible API. Structured plans ask
 * for `response_format: json_schema`; models that don't support it get the same
 * request again without it (the plan parser copes with plain JSON text).
 */
import { LLMError } from '../errors';
import { PLAN_JSON_SCHEMA } from '../planSchema';
import { toUsage } from '../usage';
import type { LLMProvider, LLMRequest, LLMResponse } from '../types';
import { postJson, type FetchLike } from './http';

export const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

export interface OpenRouterOptions {
  apiKey: string;
  fetch?: FetchLike;
}

interface ChatCompletion {
  choices?: Array<{ message?: { content?: string | null }; finish_reason?: string }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number };
}

export function createOpenRouterProvider(options: OpenRouterOptions): LLMProvider {
  const fetchImpl = options.fetch ?? fetch;

  function complete(request: LLMRequest, model: string, structured: boolean) {
    return postJson<ChatCompletion>(
      {
        provider: 'openrouter',
        model,
        fetch: fetchImpl,
        unreachable: 'openrouter.ai could not be reached',
      },
      OPENROUTER_URL,
      {
        model,
        max_tokens: request.maxOutputTokens,
        messages: [{ role: 'system', content: request.system }, ...request.messages],
        ...(structured
          ? {
              response_format: {
                type: 'json_schema',
                json_schema: { name: 'plan', strict: true, schema: PLAN_JSON_SCHEMA },
              },
            }
          : {}),
      },
      {
        // A generic app name only: nothing about the user goes to the provider.
        headers: { Authorization: `Bearer ${options.apiKey}`, 'X-Title': 'AgentOffice' },
        signal: request.signal,
      },
    );
  }

  return {
    name: 'openrouter',
    async generate(request: LLMRequest): Promise<LLMResponse> {
      const model = request.model ?? '';
      let data: ChatCompletion;
      try {
        data = await complete(request, model, !!request.json);
      } catch (err) {
        const unsupported =
          err instanceof LLMError &&
          err.status === 400 &&
          /response_format|json_schema|structured/i.test(err.message);
        if (!request.json || !unsupported) throw err;
        data = await complete(request, model, false);
      }
      return {
        text: data.choices?.[0]?.message?.content ?? '',
        usage: toUsage(data.usage?.prompt_tokens, data.usage?.completion_tokens),
      };
    },
  };
}
