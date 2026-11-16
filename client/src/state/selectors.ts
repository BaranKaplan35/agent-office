/**
 * Pure functions that derive UI data from a task snapshot. No React, no store —
 * so they are easy to test and the 3D office (phase 1c) can reuse them.
 */
import type {
  AgentMessage,
  Clarification,
  PublicAgent,
  PublicTeam,
  ReportVersion,
  Subtask,
  Task,
} from '@agent-office/shared';

export type Selection = { kind: 'subtask'; id: string } | { kind: 'final' };

export const TERMINAL_STATUSES: ReadonlyArray<Task['status']> = [
  'completed',
  'cancelled',
  'failed',
];

export function isTaskActive(task: Task | null | undefined): boolean {
  return !!task && !TERMINAL_STATUSES.includes(task.status);
}

export function sameSelection(a: Selection | null, b: Selection | null): boolean {
  if (!a || !b) return a === b;
  if (a.kind === 'final' || b.kind === 'final') return a.kind === b.kind;
  return a.id === b.id;
}

// ---------------------------------------------------------------------------
// What each agent is doing (drives desk labels now and the 3D office later)
// ---------------------------------------------------------------------------

export type AgentActivity =
  | 'idle'
  | 'notNeeded'
  | 'planning'
  /** The coordinator asked the user for details before planning. */
  | 'asking'
  | 'coordinating'
  | 'waiting'
  | 'working'
  | 'revising'
  | 'review'
  | 'approved'
  | 'failed'
  | 'merging'
  | 'done';

export function agentActivity(task: Task | null, agent: PublicAgent): AgentActivity {
  if (!task || task.status === 'cancelled') return 'idle';

  if (agent.type === 'coordinator') {
    switch (task.status) {
      case 'planning':
        return 'planning';
      case 'awaiting_clarification':
        return 'asking';
      case 'running':
        return 'coordinating';
      case 'merging':
        return task.final?.status === 'failed' ? 'failed' : 'merging';
      case 'awaiting_final_review':
        return 'review';
      case 'completed':
        return 'done';
      case 'failed':
        return 'failed';
    }
  }

  if (
    task.status === 'planning' ||
    task.status === 'awaiting_clarification' ||
    task.status === 'failed'
  ) {
    return 'idle';
  }
  const sub = task.subtasks.find((s) => s.assignee === agent.id);
  if (!sub) return 'notNeeded';
  switch (sub.status) {
    case 'blocked':
      return 'waiting';
    case 'working':
      return 'working';
    case 'revising':
      return 'revising';
    case 'awaiting_review':
      return 'review';
    case 'failed':
      return 'failed';
    case 'approved':
      return task.status === 'completed' ? 'done' : 'approved';
  }
}

export type ActivityTone = 'muted' | 'working' | 'review' | 'ok' | 'danger';

export function activityTone(activity: AgentActivity): ActivityTone {
  switch (activity) {
    case 'planning':
    case 'coordinating':
    case 'working':
    case 'revising':
    case 'merging':
      return 'working';
    case 'review':
    case 'asking':
      return 'review';
    case 'approved':
    case 'done':
      return 'ok';
    case 'failed':
      return 'danger';
    default:
      return 'muted';
  }
}

// ---------------------------------------------------------------------------
// Review queue
// ---------------------------------------------------------------------------

export interface QueueItem {
  selection: Selection;
  agentId: string;
  title: string;
  version: number;
  summary: string;
  createdAt: string;
}

export interface FailedItem {
  selection: Selection;
  agentId: string;
  title: string;
  error: string;
}

export function latestVersion(versions: ReportVersion[]): ReportVersion | undefined {
  return versions[versions.length - 1];
}

/** Everything waiting for the user's decision, oldest delivery first. */
export function reviewQueue(task: Task | null, team: PublicTeam | null): QueueItem[] {
  if (!task || !team) return [];
  const items: QueueItem[] = [];

  for (const sub of task.subtasks) {
    const latest = latestVersion(sub.versions);
    if (sub.status !== 'awaiting_review' || !latest) continue;
    items.push({
      selection: { kind: 'subtask', id: sub.id },
      agentId: sub.assignee,
      title: sub.title,
      version: latest.version,
      summary: latest.summary,
      createdAt: latest.createdAt,
    });
  }

  const finalLatest = task.final && latestVersion(task.final.versions);
  if (task.final?.status === 'awaiting_review' && finalLatest) {
    items.push({
      selection: { kind: 'final' },
      agentId: coordinatorOf(team)?.id ?? '',
      title: team.finalTitle[task.lang],
      version: finalLatest.version,
      summary: finalLatest.summary,
      createdAt: finalLatest.createdAt,
    });
  }

  return items.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function failedItems(task: Task | null, team: PublicTeam | null): FailedItem[] {
  if (!task || !team) return [];
  const items: FailedItem[] = task.subtasks
    .filter((s) => s.status === 'failed')
    .map((s) => ({
      selection: { kind: 'subtask', id: s.id },
      agentId: s.assignee,
      title: s.title,
      error: s.error ?? '',
    }));
  if (task.final?.status === 'failed') {
    items.push({
      selection: { kind: 'final' },
      agentId: coordinatorOf(team)?.id ?? '',
      title: team.finalTitle[task.lang],
      error: task.final.error ?? '',
    });
  }
  return items;
}

/** What the user asked for, with any answers to the coordinator's questions ("selam — a habit app"). */
export function requestText(task: Task): string {
  return [task.prompt, ...task.clarifications.flatMap((c) => (c.answer ? [c.answer] : []))].join(
    ' — ',
  );
}

/** The coordinator's open question round, while it waits for the user's answer. */
export function openClarification(task: Task | null): Clarification | null {
  if (task?.status !== 'awaiting_clarification') return null;
  const last = task.clarifications.at(-1);
  return last && last.answer === undefined ? last : null;
}

export function progress(task: Task | null): { approved: number; total: number } {
  if (!task) return { approved: 0, total: 0 };
  return {
    approved: task.subtasks.filter((s) => s.status === 'approved').length,
    total: task.subtasks.length,
  };
}

export function revisionsLeft(versions: ReportVersion[], maxRevisions: number): number {
  return Math.max(0, maxRevisions - Math.max(0, versions.length - 1));
}

// ---------------------------------------------------------------------------
// Report viewer model: one shape for subtasks and the final output
// ---------------------------------------------------------------------------

export type ReviewableState =
  'waiting' | 'working' | 'revising' | 'review' | 'approved' | 'failed' | 'merging';

export interface Reviewable {
  selection: Selection;
  agentId: string;
  title: string;
  instructions?: string;
  state: ReviewableState;
  versions: ReportVersion[];
  approvedVersion?: number;
  error?: string;
  /** Agent ids this subtask is still waiting for. */
  waitingFor: string[];
}

export function reviewableFor(
  task: Task | null,
  team: PublicTeam | null,
  selection: Selection | null,
): Reviewable | null {
  if (!task || !team || !selection) return null;

  if (selection.kind === 'final') {
    const final = task.final;
    if (!final) return null;
    const state: ReviewableState =
      final.status === 'awaiting_review'
        ? 'review'
        : final.status === 'revising'
          ? 'revising'
          : final.status;
    return {
      selection,
      agentId: coordinatorOf(team)?.id ?? '',
      title: team.finalTitle[task.lang],
      state,
      versions: final.versions,
      approvedVersion: final.approvedVersion,
      error: final.error,
      waitingFor: [],
    };
  }

  const sub = task.subtasks.find((s) => s.id === selection.id);
  if (!sub) return null;
  return {
    selection,
    agentId: sub.assignee,
    title: sub.title,
    instructions: sub.instructions,
    state: subtaskState(sub),
    versions: sub.versions,
    approvedVersion: sub.approvedVersion,
    error: sub.error,
    waitingFor: sub.dependsOn
      .map((id) => task.subtasks.find((s) => s.id === id))
      .filter((d): d is Subtask => !!d && d.status !== 'approved')
      .map((d) => d.assignee),
  };
}

function subtaskState(sub: Subtask): ReviewableState {
  switch (sub.status) {
    case 'blocked':
      return 'waiting';
    case 'awaiting_review':
      return 'review';
    default:
      return sub.status;
  }
}

// ---------------------------------------------------------------------------
// Misc helpers
// ---------------------------------------------------------------------------

export function coordinatorOf(team: PublicTeam): PublicAgent | undefined {
  return team.agents.find((a) => a.type === 'coordinator');
}

/** Agents whose model can't be used right now; the team can't start a task while any exist. */
export function unavailableAgents(team: PublicTeam | null | undefined): PublicAgent[] {
  return team?.agents.filter((a) => !!a.unavailable) ?? [];
}

export function findAgent(team: PublicTeam | null, id: string): PublicAgent | undefined {
  return team?.agents.find((a) => a.id === id);
}

/** Selection for clicking an agent's desk: its subtask, or the final for the coordinator. */
export function selectionForAgent(task: Task | null, agent: PublicAgent): Selection | null {
  if (!task) return null;
  if (agent.type === 'coordinator') return task.final ? { kind: 'final' } : null;
  const sub = task.subtasks.find((s) => s.assignee === agent.id);
  return sub ? { kind: 'subtask', id: sub.id } : null;
}

/** "Traffic light with Arduino (ages 10–12)" → "traffic-light-with-arduino-ages-10-12.md" */
export function exportFilename(prompt: string): string {
  const slug = prompt
    .toLocaleLowerCase('en')
    .replace(/ı/g, 'i')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/g, '');
  return `${slug || 'agent-office'}.md`;
}

/** Messages the log shows, newest last. */
export function logMessages(task: Task | null): AgentMessage[] {
  return task?.messages ?? [];
}
