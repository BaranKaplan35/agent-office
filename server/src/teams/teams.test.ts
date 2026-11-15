import { readdir } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { TEAMS_DIR } from '../paths';
import { loadTeamsFromDir, toPublicTeam } from './loader';
import { validateTeam } from './schema';

const agent = (id: string, type: 'coordinator' | 'worker', dependsOn?: string[]) => ({
  id,
  type,
  name: { en: id, tr: id },
  role: { en: `${id} role`, tr: `${id} rol` },
  icon: 'circle',
  deskColor: '#123456',
  systemPrompt: 'You are a helpful teammate in a test team.',
  ...(dependsOn ? { dependsOn } : {}),
});

const team = (agents: unknown[], extra: Record<string, unknown> = {}) => ({
  id: 'test-team',
  version: 1,
  name: { en: 'Test', tr: 'Test' },
  description: { en: 'd', tr: 'd' },
  taskPlaceholder: { en: 'p', tr: 'p' },
  finalTitle: { en: 'Final', tr: 'Final' },
  agents,
  ...extra,
});

const valid = () =>
  team([agent('lead', 'coordinator'), agent('a', 'worker'), agent('b', 'worker', ['a'])]);

function errorOf(raw: unknown): string {
  const result = validateTeam(raw);
  if (result.ok) throw new Error('expected validation to fail');
  return result.message;
}

describe('teams/ directory', () => {
  it('every team file is valid (this is how CI checks new templates)', async () => {
    const files = (await readdir(TEAMS_DIR)).filter((f) => /\.ya?ml$/.test(f));
    const { teams, errors } = await loadTeamsFromDir(TEAMS_DIR);
    expect(errors).toEqual([]);
    expect(teams).toHaveLength(files.length);
    expect(teams.map((t) => t.id)).toEqual(
      expect.arrayContaining(['maker-lesson-studio', 'software-startup']),
    );
  });

  it('public teams never expose system prompts or mock data', async () => {
    const { teams } = await loadTeamsFromDir(TEAMS_DIR);
    const json = JSON.stringify(teams.map((t) => toPublicTeam(t)));
    expect(json).not.toContain('systemPrompt');
    expect(json).not.toContain('mockResponse');
  });
});

describe('team schema', () => {
  it('accepts a valid team and fills defaults', () => {
    const result = validateTeam(valid());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.team.settings).toEqual({ maxRevisions: 3, maxOutputTokens: 2048 });
      expect(result.team.agents[1]?.dependsOn).toEqual([]);
    }
  });

  it('accepts an optional personality and rejects unknown ones', () => {
    const raw = valid();
    (raw.agents[1] as Record<string, unknown>).personality = 'coffee';
    const ok = validateTeam(raw);
    expect(ok.ok && ok.team.agents[1]?.personality).toBe('coffee');

    (raw.agents[1] as Record<string, unknown>).personality = 'grumpy';
    expect(errorOf(raw)).toMatch(/personality/);
  });

  it('accepts an optional llm per agent (model optional) and rejects unknown providers', () => {
    const raw = valid();
    (raw.agents[1] as Record<string, unknown>).llm = { provider: 'ollama', model: 'qwen3.5:9b' };
    (raw.agents[2] as Record<string, unknown>).llm = { provider: 'gemini' };
    const ok = validateTeam(raw);
    expect(ok.ok && ok.team.agents[1]?.llm).toEqual({ provider: 'ollama', model: 'qwen3.5:9b' });
    expect(ok.ok && ok.team.agents[2]?.llm).toEqual({ provider: 'gemini' });

    (raw.agents[1] as Record<string, unknown>).llm = { provider: 'openai', model: 'x' };
    expect(errorOf(raw)).toMatch(/llm/);
  });

  it('requires exactly one coordinator', () => {
    expect(errorOf(team([agent('a', 'worker'), agent('b', 'worker')]))).toMatch(
      /exactly one coordinator \(found 0\)/,
    );
    expect(
      errorOf(team([agent('x', 'coordinator'), agent('y', 'coordinator'), agent('a', 'worker')])),
    ).toMatch(/found 2/);
  });

  it('requires 2–5 workers', () => {
    expect(errorOf(team([agent('lead', 'coordinator'), agent('a', 'worker')]))).toMatch(
      /2–5 workers \(found 1\)/,
    );
    const six = ['a', 'b', 'c', 'd', 'e', 'f'].map((id) => agent(id, 'worker'));
    expect(errorOf(team([agent('lead', 'coordinator'), ...six]))).toMatch(/found 6/);
  });

  it('rejects duplicate ids, unknown or cyclic dependencies', () => {
    expect(
      errorOf(team([agent('lead', 'coordinator'), agent('a', 'worker'), agent('a', 'worker')])),
    ).toMatch(/duplicate agent id "a"/);
    expect(
      errorOf(
        team([agent('lead', 'coordinator'), agent('a', 'worker', ['zz']), agent('b', 'worker')]),
      ),
    ).toMatch(/unknown worker "zz"/);
    expect(
      errorOf(
        team([
          agent('lead', 'coordinator'),
          agent('a', 'worker', ['b']),
          agent('b', 'worker', ['a']),
        ]),
      ),
    ).toMatch(/cycle: a → b → a/);
  });

  it('rejects bad colours, unknown fields and missing translations, naming the field', () => {
    const bad = valid();
    (bad.agents[1] as Record<string, unknown>).deskColor = 'teal';
    expect(errorOf(bad)).toMatch(/agents\.1\.deskColor: must be a hex colour/);

    expect(errorOf({ ...valid(), colour: 'x' })).toMatch(/colour/);
    expect(errorOf({ ...valid(), name: { en: 'Only English' } })).toMatch(/name\.tr/);
  });
});
