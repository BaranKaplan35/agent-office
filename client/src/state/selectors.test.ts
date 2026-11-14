import type { PublicTeam, ReportVersion, Subtask, Task } from '@agent-office/shared';
import { describe, expect, it } from 'vitest';
import {
  activityTone,
  agentActivity,
  exportFilename,
  failedItems,
  isTaskActive,
  progress,
  reviewableFor,
  reviewQueue,
  revisionsLeft,
  sameSelection,
  selectionForAgent,
} from './selectors';

const agent = (id: string, type: 'coordinator' | 'worker' = 'worker') => ({
  id,
  type,
  name: { en: id, tr: id },
  role: { en: id, tr: id },
  icon: 'circle',
  deskColor: '#000000',
});

const team: PublicTeam = {
  id: 't',
  version: 1,
  name: { en: 'T', tr: 'T' },
  description: { en: '', tr: '' },
  taskPlaceholder: { en: '', tr: '' },
  finalTitle: { en: 'Final Pack', tr: 'Final Paket' },
  settings: { maxRevisions: 2, maxOutputTokens: 1000 },
  agents: [agent('lead', 'coordinator'), agent('a'), agent('b'), agent('c')],
};

const version = (n: number, at: string): ReportVersion => ({
  version: n,
  markdown: `v${n}`,
  summary: `summary ${n}`,
  createdAt: at,
});

const sub = (
  id: string,
  assignee: string,
  status: Subtask['status'],
  extra: Partial<Subtask> = {},
): Subtask => ({
  id,
  assignee,
  title: `Title ${assignee}`,
  instructions: 'Do it',
  dependsOn: [],
  status,
  versions: [],
  ...extra,
});

const task = (extra: Partial<Task> = {}): Task => ({
  id: 'task_1',
  teamId: 't',
  prompt: 'p',
  lang: 'en',
  status: 'running',
  subtasks: [],
  messages: [],
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...extra,
});

describe('agentActivity', () => {
  it('maps task and subtask states to what each agent is doing', () => {
    const t = task({
      subtasks: [
        sub('sub_1', 'a', 'awaiting_review', { versions: [version(1, '1')] }),
        sub('sub_2', 'b', 'blocked', { dependsOn: ['sub_1'] }),
      ],
    });
    const [lead, a, b, c] = team.agents as [
      (typeof team.agents)[0],
      (typeof team.agents)[0],
      (typeof team.agents)[0],
      (typeof team.agents)[0],
    ];
    expect(agentActivity(t, lead)).toBe('coordinating');
    expect(agentActivity(t, a)).toBe('review');
    expect(agentActivity(t, b)).toBe('waiting');
    expect(agentActivity(t, c)).toBe('notNeeded');
    expect(agentActivity(null, a)).toBe('idle');
    expect(agentActivity(task({ status: 'planning' }), lead)).toBe('planning');
    expect(agentActivity(task({ status: 'planning' }), a)).toBe('idle');
  });

  it('marks everyone done once the task is completed', () => {
    const t = task({ status: 'completed', subtasks: [sub('sub_1', 'a', 'approved')] });
    expect(agentActivity(t, team.agents[0]!)).toBe('done');
    expect(agentActivity(t, team.agents[1]!)).toBe('done');
  });

  it('groups activities into colour tones', () => {
    expect(activityTone('revising')).toBe('working');
    expect(activityTone('review')).toBe('review');
    expect(activityTone('done')).toBe('ok');
    expect(activityTone('waiting')).toBe('muted');
  });
});

describe('review queue', () => {
  it('lists waiting reports oldest first and puts the final in the queue too', () => {
    const t = task({
      subtasks: [
        sub('sub_1', 'a', 'awaiting_review', {
          versions: [version(1, '2026-01-01T00:00:05Z'), version(2, '2026-01-01T00:00:09Z')],
        }),
        sub('sub_2', 'b', 'awaiting_review', { versions: [version(1, '2026-01-01T00:00:07Z')] }),
        sub('sub_3', 'c', 'working'),
      ],
      final: { status: 'awaiting_review', versions: [version(1, '2026-01-01T00:00:10Z')] },
    });
    const queue = reviewQueue(t, team);
    expect(queue.map((q) => [q.agentId, q.version])).toEqual([
      ['b', 1],
      ['a', 2],
      ['lead', 1],
    ]);
    expect(queue[2]?.title).toBe('Final Pack');
  });

  it('lists failed items separately', () => {
    const t = task({ subtasks: [sub('sub_1', 'a', 'failed', { error: 'quota' })] });
    expect(failedItems(t, team)).toEqual([
      {
        selection: { kind: 'subtask', id: 'sub_1' },
        agentId: 'a',
        title: 'Title a',
        error: 'quota',
      },
    ]);
  });
});

describe('reviewableFor', () => {
  it('explains what a waiting subtask is waiting for', () => {
    const t = task({
      subtasks: [
        sub('sub_1', 'a', 'working'),
        sub('sub_2', 'b', 'blocked', { dependsOn: ['sub_1'] }),
      ],
    });
    const r = reviewableFor(t, team, { kind: 'subtask', id: 'sub_2' });
    expect(r).toMatchObject({ state: 'waiting', waitingFor: ['a'], agentId: 'b' });
  });

  it('describes the final output', () => {
    const t = task({ status: 'merging', final: { status: 'merging', versions: [] } });
    expect(reviewableFor(t, team, { kind: 'final' })).toMatchObject({
      state: 'merging',
      agentId: 'lead',
      title: 'Final Pack',
    });
  });
});

describe('small helpers', () => {
  it('counts revisions left', () => {
    expect(revisionsLeft([version(1, '')], 2)).toBe(2);
    expect(revisionsLeft([version(1, ''), version(2, ''), version(3, '')], 2)).toBe(0);
  });

  it('tracks progress and activity', () => {
    const t = task({ subtasks: [sub('sub_1', 'a', 'approved'), sub('sub_2', 'b', 'working')] });
    expect(progress(t)).toEqual({ approved: 1, total: 2 });
    expect(isTaskActive(t)).toBe(true);
    expect(isTaskActive(task({ status: 'completed' }))).toBe(false);
  });

  it('maps a desk click to the right report', () => {
    const t = task({ subtasks: [sub('sub_1', 'a', 'working')] });
    expect(selectionForAgent(t, team.agents[1]!)).toEqual({ kind: 'subtask', id: 'sub_1' });
    expect(selectionForAgent(t, team.agents[0]!)).toBeNull();
    expect(sameSelection({ kind: 'final' }, { kind: 'final' })).toBe(true);
    expect(sameSelection({ kind: 'subtask', id: 'x' }, { kind: 'subtask', id: 'y' })).toBe(false);
  });

  it('builds safe export filenames, including Turkish text', () => {
    expect(exportFilename('Traffic light with Arduino (ages 10–12)')).toBe(
      'traffic-light-with-arduino-ages-10-12.md',
    );
    expect(exportFilename('Işıklı çalar saat, öğrenciler için')).toBe(
      'isikli-calar-saat-ogrenciler-icin.md',
    );
    expect(exportFilename('???')).toBe('agent-office.md');
  });
});
