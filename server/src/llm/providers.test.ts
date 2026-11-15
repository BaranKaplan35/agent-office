import Anthropic from '@anthropic-ai/sdk';
import { ApiError } from '@google/genai';
import { describe, expect, it, vi } from 'vitest';
import { parseEnv } from '../env';
import { buildPlanRequest, buildWorkRequest } from '../orchestrator/prompts';
import { testTeam } from '../test/fixtures';
import { isRetryableStatus, LLMError, parseRetryAfter } from './errors';
import { createLLMProvider } from './index';
import { PLAN_JSON_SCHEMA } from './planSchema';
import { createAnthropicProvider, type AnthropicMessages } from './providers/anthropic';
import { createGeminiProvider, thinkingFor, type GeminiModels } from './providers/gemini';
import type { FetchLike } from './providers/http';
import { createOllamaProvider } from './providers/ollama';
import { createOpenRouterProvider, OPENROUTER_URL } from './providers/openrouter';
import { agentForCall, resolveModel } from './resolve';
import { backoffDelay, withRetry } from './retry';
import type { LLMProvider, LLMRequest } from './types';

const team = testTeam();
const worker = team.agents[1]!;
const env = parseEnv({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'test-key' });

const work = (agent = worker): LLMRequest => ({
  ...buildWorkRequest({
    team,
    agent,
    task: 'Blink an LED',
    lang: 'en',
    title: 'Wiring',
    instructions: 'Explain the wiring.',
    sources: [],
  }),
  model: 'some-model',
});
const plan = (): LLMRequest => ({ ...buildPlanRequest(team, 'Blink an LED', 'en'), model: 'm' });

/** A fake fetch that records requests and answers from a script. */
function fakeFetch(answer: (url: string, body: Record<string, unknown>) => Response) {
  const calls: Array<{ url: string; body: Record<string, unknown>; headers: Headers }> = [];
  const fn: FetchLike = async (url, init) => {
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>;
    calls.push({ url, body, headers: new Headers(init?.headers) });
    return answer(url, body);
  };
  return { fn, calls };
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { 'content-type': 'application/json', ...headers },
  });

// --------------------------------------------------------------- resolution

describe('model resolution', () => {
  it("uses the agent's own llm, else the .env default and that provider's default model", () => {
    expect(resolveModel({}, env)).toEqual({ provider: 'gemini', model: 'gemini-3.6-flash' });
    expect(resolveModel({ llm: { provider: 'ollama', model: 'qwen3.5:9b' } }, env)).toEqual({
      provider: 'ollama',
      model: 'qwen3.5:9b',
    });
    expect(resolveModel({ llm: { provider: 'anthropic' } }, env)).toEqual({
      provider: 'anthropic',
      model: 'claude-haiku-5-5',
    });
  });

  it('answers work with the worker, plans and merges with the coordinator', () => {
    expect(agentForCall(work().meta).id).toBe('a');
    expect(agentForCall(plan().meta).id).toBe('lead');
  });
});

// ------------------------------------------------------------ errors, retry

describe('retry policy', () => {
  it('retries rate limits and server errors, not other failures', async () => {
    expect(isRetryableStatus(429)).toBe(true);
    expect(isRetryableStatus(503)).toBe(true);
    expect(isRetryableStatus(401)).toBe(false);

    const sleep = vi.fn(async () => undefined);
    let calls = 0;
    const flaky = () => {
      calls++;
      if (calls < 3) {
        return Promise.reject(
          new LLMError({
            provider: 'gemini',
            model: 'm',
            message: 'busy',
            status: 429,
            retryable: true,
          }),
        );
      }
      return Promise.resolve('ok');
    };
    await expect(withRetry(flaky, { retries: 2, sleep })).resolves.toBe('ok');
    expect(sleep).toHaveBeenCalledTimes(2);

    const fatal = vi.fn(() =>
      Promise.reject(
        new LLMError({ provider: 'gemini', model: 'm', message: 'bad key', status: 401 }),
      ),
    );
    await expect(withRetry(fatal, { retries: 3, sleep })).rejects.toThrow('bad key');
    expect(fatal).toHaveBeenCalledTimes(1);
  });

  it('backs off exponentially and honours Retry-After', () => {
    const plain = new LLMError({ provider: 'gemini', model: 'm', message: 'x', retryable: true });
    const opts = { retries: 3, baseDelayMs: 1000, random: () => 0.5 };
    expect(backoffDelay(1, plain, opts)).toBe(1000);
    expect(backoffDelay(2, plain, opts)).toBe(2000);
    const asked = new LLMError({
      provider: 'gemini',
      model: 'm',
      message: 'x',
      retryable: true,
      retryAfterMs: 7000,
    });
    expect(backoffDelay(1, asked, opts)).toBe(7000);
    expect(parseRetryAfter('3')).toBe(3000);
    expect(parseRetryAfter('nonsense')).toBeUndefined();
  });
});

// ------------------------------------------------------------------- gemini

describe('gemini adapter', () => {
  function fake(answer: Awaited<ReturnType<GeminiModels['generateContent']>> | Error) {
    const generateContent = vi.fn(async (_params: unknown) => {
      if (answer instanceof Error) throw answer;
      return answer;
    });
    return { models: { generateContent } as GeminiModels, generateContent };
  }

  it('sends system, messages and the plan schema, and maps usage (thinking counts as output)', async () => {
    const { models, generateContent } = fake({
      text: '{"summary":"s","subtasks":[]}',
      usageMetadata: { promptTokenCount: 100, candidatesTokenCount: 40, thoughtsTokenCount: 10 },
    });
    const res = await createGeminiProvider({ apiKey: 'k', models }).generate({
      ...plan(),
      model: 'gemini-3.6-flash',
    });
    expect(res.usage).toEqual({ inputTokens: 100, outputTokens: 50 });
    const params = generateContent.mock.calls[0]![0] as unknown as {
      model: string;
      contents: Array<{ role: string }>;
      config: Record<string, unknown>;
    };
    expect(params.model).toBe('gemini-3.6-flash');
    expect(params.contents[0]!.role).toBe('user');
    expect(params.config.responseMimeType).toBe('application/json');
    expect(params.config.responseJsonSchema).toBe(PLAN_JSON_SCHEMA);
    expect(params.config.systemInstruction).toContain('You are lead');
  });

  it('uses a thinking level on 3.x and a budget on 2.x', () => {
    expect(thinkingFor('gemini-3.6-flash')).toEqual({ thinkingConfig: { thinkingLevel: 'LOW' } });
    expect(thinkingFor('gemini-2.5-flash')).toEqual({ thinkingConfig: { thinkingBudget: 512 } });
    expect(thinkingFor('gemma-3')).toEqual({});
  });

  it('turns API errors into named, retry-aware errors', async () => {
    const { models } = fake(new ApiError({ message: 'Resource exhausted', status: 429 }));
    const err = await createGeminiProvider({ apiKey: 'k', models })
      .generate({ ...work(), model: 'gemini-3.6-flash' })
      .catch((e: unknown) => e);
    expect(err).toBeInstanceOf(LLMError);
    expect((err as LLMError).retryable).toBe(true);
    expect((err as LLMError).message).toMatch(/^gemini · gemini-3.6-flash: rate limit/);
  });

  it('refuses an empty answer', async () => {
    const { models } = fake({ text: '', candidates: [{ finishReason: 'MAX_TOKENS' }] });
    await expect(createGeminiProvider({ apiKey: 'k', models }).generate(work())).rejects.toThrow(
      /no text \(finish reason: MAX_TOKENS\)/,
    );
  });
});

// ---------------------------------------------------------------- anthropic

describe('anthropic adapter', () => {
  function fake(answer: Awaited<ReturnType<AnthropicMessages['create']>> | Error) {
    const create = vi.fn(async (_params: unknown, _options?: unknown) => {
      if (answer instanceof Error) throw answer;
      return answer;
    });
    return { messages: { create } as unknown as AnthropicMessages, create };
  }

  it('maps text answers and usage', async () => {
    const { messages } = fake({
      content: [{ type: 'text', text: '# Report' }],
      usage: { input_tokens: 12, output_tokens: 34 },
    });
    const res = await createAnthropicProvider({ apiKey: 'k', messages }).generate(work());
    expect(res).toEqual({ text: '# Report', usage: { inputTokens: 12, outputTokens: 34 } });
  });

  it('asks for the plan through a forced tool call and returns its input as JSON', async () => {
    const input = { summary: 's', subtasks: [] };
    const { messages, create } = fake({
      content: [{ type: 'tool_use', name: 'submit_plan', input }],
      usage: { input_tokens: 1, output_tokens: 2 },
    });
    const res = await createAnthropicProvider({ apiKey: 'k', messages }).generate(plan());
    expect(JSON.parse(res.text)).toEqual(input);
    const params = create.mock.calls[0]![0] as unknown as { tool_choice: unknown; system: string };
    expect(params.tool_choice).toEqual({ type: 'tool', name: 'submit_plan' });
    expect(params.system).toContain('You are lead');
  });

  it('turns API errors into named, retry-aware errors', async () => {
    const apiError = new Anthropic.APIError(
      529,
      { type: 'error', error: { type: 'overloaded_error', message: 'Overloaded' } },
      'Overloaded',
      new Headers({ 'retry-after': '4' }),
    );
    const { messages } = fake(apiError);
    const err = (await createAnthropicProvider({ apiKey: 'k', messages })
      .generate(work())
      .catch((e: unknown) => e)) as LLMError;
    expect(err).toBeInstanceOf(LLMError);
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(4000);
    expect(err.message).toMatch(/^anthropic · some-model:/);
  });
});

// ------------------------------------------------------------------- ollama

describe('ollama adapter', () => {
  it('posts to /api/chat without thinking, with the schema for plans, and maps usage', async () => {
    const { fn, calls } = fakeFetch(() =>
      json({ message: { content: '{"summary":"s"}' }, prompt_eval_count: 30, eval_count: 7 }),
    );
    const res = await createOllamaProvider({
      baseUrl: 'http://localhost:11434/',
      fetch: fn,
    }).generate({
      ...plan(),
      model: 'qwen3.5:9b',
    });
    expect(res.usage).toEqual({ inputTokens: 30, outputTokens: 7 });
    expect(calls[0]!.url).toBe('http://localhost:11434/api/chat');
    expect(calls[0]!.body).toMatchObject({ model: 'qwen3.5:9b', stream: false, think: false });
    expect(calls[0]!.body.format).toEqual(PLAN_JSON_SCHEMA);
    expect((calls[0]!.body.messages as Array<{ role: string }>)[0]!.role).toBe('system');
  });

  it('says plainly when Ollama is not running or the model is not pulled', async () => {
    const down: FetchLike = async () => {
      throw new TypeError('fetch failed');
    };
    await expect(
      createOllamaProvider({ baseUrl: 'http://localhost:11434', fetch: down }).generate(work()),
    ).rejects.toThrow(/Ollama is not running at http:\/\/localhost:11434/);

    const { fn } = fakeFetch(() => json({ error: 'model "x" not found' }, 404));
    await expect(
      createOllamaProvider({ baseUrl: 'http://h', fetch: fn }).generate({ ...work(), model: 'x' }),
    ).rejects.toThrow(/ollama pull x/);
  });

  it('asks again without the thinking flag for models that have no thinking mode', async () => {
    const { fn, calls } = fakeFetch((_url, body) =>
      'think' in body
        ? json({ error: 'model does not support thinking' }, 400)
        : json({ message: { content: 'ok' } }),
    );
    const res = await createOllamaProvider({ baseUrl: 'http://h', fetch: fn }).generate(work());
    expect(res.text).toBe('ok');
    expect(calls).toHaveLength(2);
  });
});

// --------------------------------------------------------------- openrouter

describe('openrouter adapter', () => {
  it('sends the key as a bearer token and a JSON schema for plans; maps usage', async () => {
    const { fn, calls } = fakeFetch(() =>
      json({
        choices: [{ message: { content: '{"summary":"s"}' } }],
        usage: { prompt_tokens: 5, completion_tokens: 6 },
      }),
    );
    const res = await createOpenRouterProvider({ apiKey: 'or-key', fetch: fn }).generate(plan());
    expect(res.usage).toEqual({ inputTokens: 5, outputTokens: 6 });
    expect(calls[0]!.url).toBe(OPENROUTER_URL);
    expect(calls[0]!.headers.get('authorization')).toBe('Bearer or-key');
    expect(calls[0]!.body.response_format).toMatchObject({ type: 'json_schema' });
  });

  it('falls back to plain JSON text when the model has no structured output', async () => {
    const { fn, calls } = fakeFetch((_url, body) =>
      body.response_format
        ? json({ error: { message: 'response_format is not supported by this model' } }, 400)
        : json({ choices: [{ message: { content: '{}' } }] }),
    );
    await createOpenRouterProvider({ apiKey: 'k', fetch: fn }).generate(plan());
    expect(calls).toHaveLength(2);
    expect(calls[1]!.body.response_format).toBeUndefined();
  });

  it('marks rate limits as retryable with the requested pause', async () => {
    const { fn } = fakeFetch(() =>
      json({ error: { message: 'slow down' } }, 429, { 'retry-after': '2' }),
    );
    const err = (await createOpenRouterProvider({ apiKey: 'k', fetch: fn })
      .generate(work())
      .catch((e: unknown) => e)) as LLMError;
    expect(err.retryable).toBe(true);
    expect(err.retryAfterMs).toBe(2000);
  });
});

// ------------------------------------------------------------------- router

describe('router', () => {
  const recording = (name: LLMProvider['name']) => {
    const seen: LLMRequest[] = [];
    const adapter: LLMProvider = {
      name,
      generate: async (req) => {
        seen.push(req);
        return { text: `from ${name}`, usage: { inputTokens: 1, outputTokens: 1 } };
      },
    };
    return { adapter, seen };
  };

  it("sends each call to the agent's provider and model (a mixed team)", async () => {
    const mixedTeam = testTeam();
    mixedTeam.agents[3] = {
      ...mixedTeam.agents[3]!,
      llm: { provider: 'ollama', model: 'qwen3.5:9b' },
    };
    const gemini = recording('gemini');
    const ollama = recording('ollama');
    const router = createLLMProvider(env, {
      adapters: { gemini: gemini.adapter, ollama: ollama.adapter },
    });

    const forC = buildWorkRequest({
      team: mixedTeam,
      agent: mixedTeam.agents[3]!,
      task: 't',
      lang: 'en',
      title: 'T',
      instructions: 'I',
      sources: [],
    });
    expect((await router.generate(forC)).text).toBe('from ollama');
    expect(ollama.seen[0]!.model).toBe('qwen3.5:9b');
    expect((await router.generate(buildPlanRequest(mixedTeam, 't', 'en'))).text).toBe(
      'from gemini',
    );
    expect(gemini.seen[0]!.model).toBe('gemini-3.6-flash');
  });

  it('runs one Ollama call at a time by default', async () => {
    let active = 0;
    let peak = 0;
    const slow: LLMProvider = {
      name: 'ollama',
      generate: async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 20));
        active--;
        return { text: 'x' };
      },
    };
    const local = parseEnv({ LLM_PROVIDER: 'ollama' });
    const router = createLLMProvider(local, { adapters: { ollama: slow } });
    await Promise.all([router.generate(work()), router.generate(work()), router.generate(work())]);
    expect(peak).toBe(1);
  });

  it('gives up after the provider timeout with a clear message', async () => {
    const hang: LLMProvider = {
      name: 'gemini',
      generate: (req) =>
        new Promise((_resolve, reject) => {
          req.signal?.addEventListener('abort', () => reject(req.signal?.reason));
        }),
    };
    const quick = parseEnv({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k', LLM_TIMEOUT_MS: '30' });
    const router = createLLMProvider(quick, { adapters: { gemini: hang } });
    await expect(router.generate(work())).rejects.toThrow(
      /^gemini · gemini-3.6-flash: no answer within 0 s/,
    );
  });

  it('retries a rate limit and then succeeds', async () => {
    let calls = 0;
    const limited: LLMProvider = {
      name: 'gemini',
      generate: async () => {
        if (calls++ === 0) {
          throw new LLMError({
            provider: 'gemini',
            model: 'm',
            message: '429',
            status: 429,
            retryable: true,
          });
        }
        return { text: 'ok' };
      },
    };
    const router = createLLMProvider(env, {
      adapters: { gemini: limited },
      sleep: async () => undefined,
    });
    expect((await router.generate(work())).text).toBe('ok');
    expect(calls).toBe(2);
  });

  it('names the missing key instead of calling the provider', async () => {
    const router = createLLMProvider(parseEnv({ LLM_PROVIDER: 'openrouter' }));
    await expect(router.generate(work())).rejects.toThrow(/OPENROUTER_API_KEY is not set/);
  });
});
