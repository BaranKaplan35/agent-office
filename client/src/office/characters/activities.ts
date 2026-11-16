/**
 * What a character does for each agent activity (pure). The activity comes from
 * `state/selectors.ts` (`agentActivity`), so the 3D office and the panels always
 * agree about who is doing what.
 */
import type { AgentActivity } from '../../state/selectors';

/** Poses a character can hold while sitting at the desk. */
export type DeskPose = 'typing' | 'reading' | 'handRaised' | 'slumped' | 'nod';

export type Goal =
  /** Sit at the desk. `thenFree`: after this many seconds, get up and wander off. */
  | { kind: 'desk'; pose: DeskPose; thenFree?: number }
  /** Wander the office: coffee, windows, bookshelf, a stretch … */
  | { kind: 'free' }
  /** Gather on the rug and cheer. */
  | { kind: 'celebrate' };

/** How long the "approved" nod lasts before the agent gets up again. */
export const NOD_SECONDS = 2.2;

export function goalFor(activity: AgentActivity): Goal {
  switch (activity) {
    case 'planning':
    case 'working':
    case 'revising':
    case 'merging':
      return { kind: 'desk', pose: 'typing' };
    case 'coordinating':
      return { kind: 'desk', pose: 'reading' };
    case 'review':
    case 'asking':
      return { kind: 'desk', pose: 'handRaised' };
    case 'approved':
      return { kind: 'desk', pose: 'nod', thenFree: NOD_SECONDS };
    case 'failed':
      return { kind: 'desk', pose: 'slumped' };
    case 'done':
      return { kind: 'celebrate' };
    case 'idle':
    case 'notNeeded':
    case 'waiting':
      return { kind: 'free' };
  }
}

/**
 * Reduced motion: nobody wanders and nothing loops. Free time is spent quietly
 * at the desk, and an approval no longer sends the agent off afterwards.
 */
export function calmGoalFor(activity: AgentActivity): Goal {
  const goal = goalFor(activity);
  if (goal.kind === 'free') return { kind: 'desk', pose: 'reading' };
  if (goal.kind === 'desk' && goal.thenFree !== undefined) return { kind: 'desk', pose: goal.pose };
  return goal;
}

/** Activities that mean "sit down and work": shown as "on the way" until the agent sits. */
export function isDeskWork(activity: AgentActivity): boolean {
  return (
    activity === 'planning' ||
    activity === 'working' ||
    activity === 'revising' ||
    activity === 'merging'
  );
}

export function sameGoal(a: Goal, b: Goal): boolean {
  if (a.kind !== b.kind) return false;
  if (a.kind === 'desk' && b.kind === 'desk') return a.pose === b.pose && a.thenFree === b.thenFree;
  return true;
}
