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

  it('requires a Gemini key when the Gemini provider is selected', () => {
    expect(() => parseEnv({ LLM_PROVIDER: 'gemini' })).toThrow(/GEMINI_API_KEY/);
  });

  it('requires an Anthropic key when the Anthropic provider is selected', () => {
    expect(() => parseEnv({ LLM_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '' })).toThrow(
      /ANTHROPIC_API_KEY/,
    );
  });

  it('rejects unknown providers', () => {
    expect(() => parseEnv({ LLM_PROVIDER: 'openai' })).toThrow(/LLM_PROVIDER/);
  });
});
