import { describe, expect, it } from 'vitest';
import { defaultPlan } from '../teams/defaultPlan';
import { testTeam } from '../test/fixtures';
import { extractJson, parsePlan, PlanParseError } from './planParser';

const team = testTeam();
const sub = (assignee: string, id?: string, dependsOn: string[] = []) => ({
  id,
  assignee,
  title: `Work for ${assignee}`,
  instructions: `Do the ${assignee} part.`,
  dependsOn,
});
const plan = (subtasks: unknown[], summary = 'Plan') => JSON.stringify({ summary, subtasks });

describe('extractJson', () => {
  it('handles fences and chatter around the JSON', () => {
    expect(extractJson('Here you go:\n```json\n{"a":1}\n```\nThanks!')).toEqual({ a: 1 });
  });

  it('throws PlanParseError when there is no JSON', () => {
    expect(() => extractJson('no json here')).toThrow(PlanParseError);
    expect(() => extractJson('{ broken')).toThrow(PlanParseError);
  });
});

describe('parsePlan', () => {
  it('keeps a valid plan and renumbers ids', () => {
    const result = parsePlan(plan([sub('a', 'x1'), sub('b', 'x2', ['x1'])]), team);
    expect(result.summary).toBe('Plan');
    expect(result.subtasks.map((s) => [s.id, s.assignee, s.dependsOn])).toEqual([
      ['sub_1', 'a', []],
      ['sub_2', 'b', ['sub_1']],
    ]);
  });

  it('drops unknown assignees and the coordinator', () => {
    const result = parsePlan(plan([sub('ghost'), sub('lead'), sub('c')]), team);
    expect(result.subtasks.map((s) => s.assignee)).toEqual(['c']);
  });

  it('merges a second subtask for the same worker into the first', () => {
    const result = parsePlan(plan([sub('a', 's1'), sub('a', 's2'), sub('b', 's3', ['s2'])]), team);
    expect(result.subtasks).toHaveLength(2);
    expect(result.subtasks[0]?.instructions).toContain('Do the a part.');
    expect(result.subtasks[1]?.dependsOn).toEqual(['sub_1']);
  });

  it('removes unknown and self dependencies and breaks cycles', () => {
    const result = parsePlan(
      plan([sub('a', 's1', ['s2', 'nope', 's1']), sub('b', 's2', ['s1'])]),
      team,
    );
    const deps = Object.fromEntries(result.subtasks.map((s) => [s.id, s.dependsOn]));
    const edges = deps.sub_1!.length + deps.sub_2!.length;
    expect(edges).toBe(1); // one direction of the a ⇄ b cycle survives
  });

  it('uses positional ids when the model omits them', () => {
    const result = parsePlan(plan([sub('a'), sub('b', undefined, ['sub_1'])]), team);
    expect(result.subtasks[1]?.dependsOn).toEqual(['sub_1']);
  });

  it('throws when nothing usable is left', () => {
    expect(() => parsePlan(plan([sub('ghost')]), team)).toThrow(/no known team member/);
    expect(() => parsePlan(plan([]), team)).toThrow(PlanParseError);
  });
});

describe('defaultPlan', () => {
  it('creates one subtask per worker wired with the config hand-offs', () => {
    const result = defaultPlan(team, 'Make a robot', 'tr');
    expect(result.subtasks.map((s) => [s.id, s.assignee, s.dependsOn])).toEqual([
      ['sub_1', 'a', []],
      ['sub_2', 'b', ['sub_1']],
      ['sub_3', 'c', []],
    ]);
    expect(result.subtasks[0]?.title).toBe('Rol a');
    expect(result.summary).toMatch(/3 alt göreve/);
  });

  it('is accepted by the parser unchanged (the mock relies on this)', () => {
    const draft = defaultPlan(team, 'Make a robot', 'en');
    expect(parsePlan(JSON.stringify(draft), team)).toEqual(draft);
  });
});
