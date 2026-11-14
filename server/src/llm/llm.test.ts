import { describe, expect, it } from 'vitest';
import { buildWorkRequest } from '../orchestrator/prompts';
import { testTeam } from '../test/fixtures';
import { createLimiter } from './limiter';
import { createMockProvider } from './mock';

const team = testTeam();
const agentA = team.agents[1]!;

describe('createLimiter', () => {
  it('never runs more than `max` jobs at once', async () => {
    const run = createLimiter(2);
    let active = 0;
    let peak = 0;
    const job = () =>
      run(async () => {
        active++;
        peak = Math.max(peak, active);
        await new Promise((r) => setTimeout(r, 5));
        active--;
      });
    await Promise.all([job(), job(), job(), job(), job()]);
    expect(peak).toBe(2);
  });
});

describe('mock provider', () => {
  const mock = createMockProvider({ minDelayMs: 0, maxDelayMs: 0 });
  const request = (lang: 'en' | 'tr', revision?: { note: string }, agent = agentA) =>
    buildWorkRequest({
      team,
      agent,
      task: 'Blink an LED',
      lang,
      title: 'Wiring',
      instructions: 'Explain the wiring.',
      sources: [],
      revision: revision
        ? {
            previous: { version: 1, markdown: 'old', summary: 'old', createdAt: '' },
            note: revision.note,
          }
        : undefined,
    });

  it('answers in the requested language with usage numbers', async () => {
    const en = await mock.generate(request('en'));
    const tr = await mock.generate(request('tr'));
    expect(en.text).toContain('## Approach');
    expect(tr.text).toContain('## Yaklaşım');
    expect(en.usage?.outputTokens).toBeGreaterThan(0);
  });

  it('mentions the review note in a revision', async () => {
    const res = await mock.generate(request('en', { note: 'Use pin 9' }));
    expect(res.text).toContain('Revised version 2');
    expect(res.text).toContain('Use pin 9');
  });

  it('uses the agent mockResponse when the team config has one', async () => {
    const custom = { ...agentA, mockResponse: 'Custom for {{task}}' };
    const res = await mock.generate(request('en', undefined, custom));
    expect(res.text).toContain('Custom for Blink an LED');
  });

  it('stops waiting when the call is aborted', async () => {
    const slow = createMockProvider({ minDelayMs: 1000, maxDelayMs: 1000 });
    const controller = new AbortController();
    const pending = slow.generate({ ...request('en'), signal: controller.signal });
    controller.abort(new Error('stop'));
    await expect(pending).rejects.toThrow('stop');
  });
});
