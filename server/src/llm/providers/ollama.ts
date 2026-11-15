/**
 * Ollama: local models over its HTTP API (`/api/chat`), no key. Structured plans
 * use `format` with the plan's JSON schema. Thinking is switched off: it makes
 * local models much slower and the office already shows them "working".
 */
import { LLMError } from '../errors';
import { PLAN_JSON_SCHEMA } from '../planSchema';
import type { LLMProvider, LLMRequest, LLMResponse } from '../types';
import { postJson, type FetchLike } from './http';

export interface OllamaOptions {
  baseUrl: string;
  fetch?: FetchLike;
}

interface OllamaChatResponse {
  message?: { content?: string };
  prompt_eval_count?: number;
  eval_count?: number;
  done_reason?: string;
}

export function trimSlash(url: string): string {
  return url.replace(/\/+$/, '');
}

export function createOllamaProvider(options: OllamaOptions): LLMProvider {
  const fetchImpl = options.fetch ?? fetch;
  const base = trimSlash(options.baseUrl);

  async function chat(request: LLMRequest, model: string, think: boolean | undefined) {
    return postJson<OllamaChatResponse>(
      {
        provider: 'ollama',
        model,
        fetch: fetchImpl,
        unreachable: `Ollama is not running at ${base} (start it with "ollama serve")`,
      },
      `${base}/api/chat`,
      {
        model,
        stream: false,
        ...(think === undefined ? {} : { think }),
        messages: [{ role: 'system', content: request.system }, ...request.messages],
        ...(request.json ? { format: PLAN_JSON_SCHEMA } : {}),
        options: { num_predict: request.maxOutputTokens },
      },
      { signal: request.signal },
    );
  }

  return {
    name: 'ollama',
    async generate(request: LLMRequest): Promise<LLMResponse> {
      const model = request.model ?? '';
      let data: OllamaChatResponse;
      try {
        data = await chat(request, model, false);
      } catch (err) {
        // Models without a thinking mode refuse the `think` flag: ask again without it.
        if (err instanceof LLMError && err.status === 400 && /think/i.test(err.message)) {
          data = await chat(request, model, undefined);
        } else if (err instanceof LLMError && err.status === 404) {
          throw new LLMError({
            provider: 'ollama',
            model,
            status: 404,
            message: `the model is not pulled yet (run "ollama pull ${model}")`,
          });
        } else {
          throw err;
        }
      }
      return {
        text: data.message?.content ?? '',
        usage: { inputTokens: data.prompt_eval_count ?? 0, outputTokens: data.eval_count ?? 0 },
      };
    },
  };
}
