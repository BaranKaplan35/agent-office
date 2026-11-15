import { describe, expect, it } from 'vitest';
import type { AgentActivity } from '../../state/selectors';
import { calmGoalFor, goalFor, NOD_SECONDS, sameGoal } from './activities';

const ALL: AgentActivity[] = [
  'idle',
  'notNeeded',
  'planning',
  'coordinating',
  'waiting',
  'working',
  'revising',
  'review',
  'approved',
  'failed',
  'merging',
  'done',
];

describe('goalFor', () => {
  it('has a goal for every activity', () => {
    for (const activity of ALL) expect(goalFor(activity)).toBeDefined();
  });

  it('works at the desk while planning, working, revising and merging', () => {
    for (const a of ['planning', 'working', 'revising', 'merging'] as const) {
      expect(goalFor(a)).toEqual({ kind: 'desk', pose: 'typing' });
    }
  });

  it('raises a hand when a report waits for review, and slumps on failure', () => {
    expect(goalFor('review')).toEqual({ kind: 'desk', pose: 'handRaised' });
    expect(goalFor('failed')).toEqual({ kind: 'desk', pose: 'slumped' });
  });

  it('nods once when approved, then goes back to wandering', () => {
    expect(goalFor('approved')).toEqual({ kind: 'desk', pose: 'nod', thenFree: NOD_SECONDS });
  });

  it('wanders when idle, not needed or waiting for teammates', () => {
    for (const a of ['idle', 'notNeeded', 'waiting'] as const) {
      expect(goalFor(a)).toEqual({ kind: 'free' });
    }
  });

  it('celebrates when everything is done', () => {
    expect(goalFor('done')).toEqual({ kind: 'celebrate' });
  });

  it('compares goals', () => {
    expect(sameGoal(goalFor('working'), goalFor('planning'))).toBe(true);
    expect(sameGoal(goalFor('working'), goalFor('review'))).toBe(false);
    expect(sameGoal(goalFor('idle'), goalFor('waiting'))).toBe(true);
    expect(sameGoal(goalFor('approved'), { kind: 'desk', pose: 'nod' })).toBe(false);
  });
});

describe('calmGoalFor (reduced motion)', () => {
  it('never wanders and never leaves the desk on a timer', () => {
    for (const activity of ALL) {
      const goal = calmGoalFor(activity);
      expect(goal.kind).not.toBe('free');
      if (goal.kind === 'desk') expect(goal.thenFree).toBeUndefined();
    }
  });

  it('keeps the meaningful poses', () => {
    expect(calmGoalFor('review')).toEqual({ kind: 'desk', pose: 'handRaised' });
    expect(calmGoalFor('approved')).toEqual({ kind: 'desk', pose: 'nod' });
    expect(calmGoalFor('idle')).toEqual({ kind: 'desk', pose: 'reading' });
    expect(calmGoalFor('done')).toEqual({ kind: 'celebrate' });
  });
});
