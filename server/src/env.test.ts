import { describe, expect, it } from 'vitest';
import { parseEnv } from './env';

describe('parseEnv', () => {
  it('defaults to the mock provider so the app runs without any API key', () => {
    const env = parseEnv({});
    expect(env.LLM_PROVIDER).toBe('mock');
    expect(env.port).toBe(3001);
  });

  it('ignores PORT in development (it usually belongs to the frontend dev server)', () => {
    expect(parseEnv({ PORT: '5173' }).port).toBe(3001);
  });

  it('honours PORT in production, but SERVER_PORT always wins', () => {
    expect(parseEnv({ NODE_ENV: 'production', PORT: '8080' }).port).toBe(8080);
    expect(parseEnv({ NODE_ENV: 'production', PORT: '8080', SERVER_PORT: '4000' }).port).toBe(4000);
    expect(parseEnv({ SERVER_PORT: '4000' }).port).toBe(4000);
  });

  it('does not stop the server for a missing key (the preflight reports it instead)', () => {
    const env = parseEnv({ LLM_PROVIDER: 'gemini' });
    expect(env.GEMINI_API_KEY).toBeUndefined();
    expect(env.GEMINI_MODEL).toBe('gemini-3.6-flash');
  });

  it('has local-model defaults: one Ollama call at a time, more patience', () => {
    const env = parseEnv({});
    expect(env.OLLAMA_BASE_URL).toBe('http://localhost:11434');
    expect(env.OLLAMA_CONCURRENCY).toBe(1);
    expect(env.OLLAMA_TIMEOUT_MS).toBeGreaterThan(env.LLM_TIMEOUT_MS);
  });

  it('accepts every provider and treats blank keys as missing', () => {
    for (const p of ['mock', 'gemini', 'anthropic', 'ollama', 'openrouter']) {
      expect(parseEnv({ LLM_PROVIDER: p }).LLM_PROVIDER).toBe(p);
    }
    expect(parseEnv({ OPENROUTER_API_KEY: '  ' }).OPENROUTER_API_KEY).toBeUndefined();
  });

  it('rejects unknown providers', () => {
    expect(() => parseEnv({ LLM_PROVIDER: 'openai' })).toThrow(/LLM_PROVIDER/);
  });
});
