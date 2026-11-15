import { describe, expect, it } from 'vitest';
import { parseEnv } from '../env';
import { testTeam } from '../test/fixtures';
import { describeModels, formatProblem, hasOllamaModel, preflight } from './preflight';
import type { FetchLike } from './providers/http';

const mixed = () => {
  const team = testTeam();
  team.agents[3] = { ...team.agents[3]!, llm: { provider: 'ollama', model: 'qwen3.5:9b' } };
  return team;
};

const tags =
  (...names: string[]): FetchLike =>
  async () =>
    new Response(JSON.stringify({ models: names.map((name) => ({ name, model: name })) }));
const down: FetchLike = async () => {
  throw new TypeError('fetch failed');
};

describe('preflight', () => {
  it('passes when every key is set and Ollama has the model', async () => {
    const env = parseEnv({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' });
    expect(await preflight([mixed()], env, { fetch: tags('qwen3.5:9b') })).toEqual([]);
  });

  it('names every agent of every team that lacks a key', async () => {
    const env = parseEnv({ LLM_PROVIDER: 'gemini' });
    const problems = await preflight([testTeam()], env, { fetch: tags() });
    expect(problems.map((p) => p.agentId)).toEqual(['lead', 'a', 'b', 'c']);
    expect(problems[0]!.reason).toBe('GEMINI_API_KEY is not set in .env');
  });

  it('reports a stopped Ollama or a model that is not pulled, only for its agents', async () => {
    const env = parseEnv({ LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'k' });
    const stopped = await preflight([mixed()], env, { fetch: down });
    expect(stopped).toHaveLength(1);
    expect(stopped[0]).toMatchObject({ agentId: 'c', provider: 'ollama', model: 'qwen3.5:9b' });
    expect(formatProblem(stopped[0]!)).toBe(
      '⚠ test-team › C (c) → ollama:qwen3.5:9b — Ollama is not running at http://localhost:11434 (start it with "ollama serve")',
    );

    const missing = await preflight([mixed()], env, { fetch: tags('llama3:latest') });
    expect(missing[0]!.reason).toBe('the model is not pulled (run "ollama pull qwen3.5:9b")');
  });

  it('does not contact Ollama when no agent uses it', async () => {
    let called = false;
    const spy: FetchLike = async () => {
      called = true;
      return new Response('{}');
    };
    await preflight([testTeam()], parseEnv({}), { fetch: spy });
    expect(called).toBe(false);
  });

  it('matches untagged model names against ":latest"', () => {
    expect(hasOllamaModel(['llama3:latest'], 'llama3')).toBe(true);
    expect(hasOllamaModel(['qwen3.5:9b'], 'qwen3.5:9b')).toBe(true);
    expect(hasOllamaModel(['qwen3.5:9b'], 'qwen3.5')).toBe(false);
  });

  it('lists the model of every agent for the startup log', () => {
    const lines = describeModels([mixed()], parseEnv({ LLM_PROVIDER: 'gemini' }));
    expect(lines[0]).toBe(
      '  test-team: LEAD gemini:gemini-3.6-flash, A gemini:gemini-3.6-flash, B gemini:gemini-3.6-flash, C ollama:qwen3.5:9b',
    );
  });
});
