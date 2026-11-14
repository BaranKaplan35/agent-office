import { describe, expect, it } from 'vitest';
import { instantMock, scripted, setup, statuses, subOf, testTeam, waitFor } from '../test/fixtures';
import { OrchestratorError } from './orchestrator';

const firstWaveReady = (t: { subtasks: { assignee: string; status: string }[] }) =>
  t.subtasks.length > 0 &&
  t.subtasks.find((s) => s.assignee === 'a')?.status === 'awaiting_review' &&
  t.subtasks.find((s) => s.assignee === 'c')?.status === 'awaiting_review';

function expectError(fn: () => unknown, code: string) {
  try {
    fn();
  } catch (err) {
    expect(err).toBeInstanceOf(OrchestratorError);
    expect((err as OrchestratorError).code).toBe(code);
    return;
  }
  throw new Error(`expected OrchestratorError ${code}`);
}

describe('Orchestrator — happy path', () => {
  it('plans, runs along dependencies, merges and completes', async () => {
    const { orchestrator, create } = setup();
    const { id } = create();

    // Wave 1: a and c have no dependencies, b waits for a.
    let task = await waitFor(orchestrator, id, firstWaveReady);
    expect(task.status).toBe('running');
    expect(statuses(task)).toEqual({ a: 'awaiting_review', b: 'blocked', c: 'awaiting_review' });
    expect(task.planSummary).toBeTruthy();
    expect(subOf(task, 'b').dependsOn).toEqual([subOf(task, 'a').id]);

    const assignments = task.messages.filter((m) => m.type === 'assignment').map((m) => m.to);
    expect(assignments.sort()).toEqual(['a', 'c']);
    expect(task.messages[0]?.type).toBe('plan');

    // Approving a unlocks b, which receives a's approved version as context.
    orchestrator.approve(id, subOf(task, 'a').id);
    task = await waitFor(orchestrator, id, (t) => subOf(t, 'b').status === 'awaiting_review');
    const bAssignment = task.messages.find((m) => m.type === 'assignment' && m.to === 'b');
    expect(bAssignment?.type === 'assignment' && bAssignment.payload.context).toEqual([
      { subtaskId: subOf(task, 'a').id, agentId: 'a', version: 1 },
    ]);

    // Approving the rest triggers the merge.
    orchestrator.approve(id, subOf(task, 'b').id);
    orchestrator.approve(id, subOf(task, 'c').id);
    task = await waitFor(orchestrator, id, (t) => t.status === 'awaiting_final_review');
    expect(task.final?.status).toBe('awaiting_review');
    expect(task.final?.versions[0]?.markdown).toContain('# Final Pack');
    const finalMsg = task.messages.find((m) => m.type === 'final');
    expect(finalMsg?.type === 'final' && finalMsg.payload.sources).toHaveLength(3);

    task = orchestrator.approveFinal(id);
    expect(task.status).toBe('completed');
    expect(task.final?.approvedVersion).toBe(1);
    expect(task.messages.at(-1)).toMatchObject({ type: 'approval', from: 'user', to: 'lead' });
  });

  it('gives every message a unique, ordered id and the task id', async () => {
    const { orchestrator, create } = setup();
    const { id } = create();
    const task = await waitFor(orchestrator, id, firstWaveReady);
    const ids = task.messages.map((m) => m.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect([...ids].sort()).toEqual(ids);
    expect(task.messages.every((m) => m.taskId === id)).toBe(true);
  });
});

describe('Orchestrator — review decisions', () => {
  it('a revision creates a new version that answers the note', async () => {
    const { orchestrator, create } = setup();
    const { id } = create();
    let task = await waitFor(orchestrator, id, firstWaveReady);
    const subId = subOf(task, 'a').id;

    task = orchestrator.revise(id, subId, '  Make it shorter  ');
    expect(subOf(task, 'a').status).toBe('revising');
    expect(task.messages.at(-1)).toMatchObject({
      type: 'revision_request',
      to: 'a',
      payload: { version: 1, note: 'Make it shorter' },
    });

    task = await waitFor(orchestrator, id, (t) => subOf(t, 'a').versions.length === 2);
    const sub = subOf(task, 'a');
    expect(sub.status).toBe('awaiting_review');
    expect(sub.versions[1]).toMatchObject({ version: 2, revisionNote: 'Make it shorter' });
    expect(sub.versions[1]?.markdown).toContain('Make it shorter');
    expect(sub.versions[0]?.version).toBe(1); // old versions are kept
  });

  it('enforces the revision limit from the team settings', async () => {
    const { orchestrator, create } = setup({
      team: testTeam({ settings: { maxRevisions: 1, maxOutputTokens: 512 } }),
    });
    const { id } = create();
    const task = await waitFor(orchestrator, id, firstWaveReady);
    const subId = subOf(task, 'a').id;

    orchestrator.revise(id, subId, 'once');
    await waitFor(orchestrator, id, (t) => subOf(t, 'a').status === 'awaiting_review');
    expectError(() => orchestrator.revise(id, subId, 'twice'), 'revision_limit');
    expect(
      orchestrator.approve(id, subId).subtasks.find((s) => s.id === subId)?.approvedVersion,
    ).toBe(2);
  });

  it('rejects invalid commands with clear error codes', async () => {
    const { orchestrator, create } = setup();
    expectError(() => orchestrator.getTask('task_nope'), 'not_found');
    expectError(
      () => orchestrator.createTask({ teamId: 'ghost', prompt: 'x', lang: 'en' }),
      'not_found',
    );

    const { id } = create();
    const task = await waitFor(orchestrator, id, firstWaveReady);
    const blocked = subOf(task, 'b').id;
    expectError(() => orchestrator.approve(id, blocked), 'invalid_state');
    expectError(() => orchestrator.revise(id, subOf(task, 'a').id, '   '), 'validation');
    expectError(() => orchestrator.approve(id, 'sub_99'), 'not_found');
    expectError(() => orchestrator.approveFinal(id), 'invalid_state');
  });

  it('the final output can be revised before approval', async () => {
    const { orchestrator, create } = setup();
    const { id } = create();
    let task = await waitFor(orchestrator, id, firstWaveReady);
    orchestrator.approve(id, subOf(task, 'a').id);
    orchestrator.approve(id, subOf(task, 'c').id);
    task = await waitFor(orchestrator, id, (t) => subOf(t, 'b').status === 'awaiting_review');
    orchestrator.approve(id, subOf(task, 'b').id);
    await waitFor(orchestrator, id, (t) => t.status === 'awaiting_final_review');

    task = orchestrator.reviseFinal(id, 'Add a short intro');
    expect(['merging', 'awaiting_final_review']).toContain(task.status);
    task = await waitFor(orchestrator, id, (t) => t.final?.versions.length === 2);
    expect(task.final?.versions[1]?.revisionNote).toBe('Add a short intro');
    expect(orchestrator.approveFinal(id).status).toBe('completed');
  });
});

describe('Orchestrator — failures', () => {
  it('a failed agent call can be retried', async () => {
    let failed = false;
    const llm = scripted(instantMock(), (req) => {
      if (req.meta.kind === 'work' && req.meta.agent.id === 'a' && !failed) {
        failed = true;
        return Promise.reject(new Error('quota exceeded'));
      }
      return undefined;
    });
    const { orchestrator, create } = setup({ llm });
    const { id } = create();

    let task = await waitFor(
      orchestrator,
      id,
      (t) => t.subtasks.length > 0 && subOf(t, 'a').status === 'failed',
    );
    expect(subOf(task, 'a').error).toBe('quota exceeded');
    expect(task.messages).toContainEqual(
      expect.objectContaining({
        type: 'error',
        payload: expect.objectContaining({ retryable: true }),
      }),
    );

    orchestrator.retry(id, subOf(task, 'a').id);
    task = await waitFor(orchestrator, id, (t) => subOf(t, 'a').status === 'awaiting_review');
    expect(subOf(task, 'a').error).toBeUndefined();
  });

  it('falls back to the default plan when the coordinator answers garbage', async () => {
    const llm = scripted(instantMock(), (req) =>
      req.meta.kind === 'plan' ? Promise.resolve({ text: 'Sure! Here is my plan: …' }) : undefined,
    );
    const { orchestrator, create } = setup({ llm });
    const { id } = create();
    const task = await waitFor(orchestrator, id, (t) => t.status === 'running');
    expect(task.subtasks.map((s) => s.assignee)).toEqual(['a', 'b', 'c']);
  });

  it('fails the task when the model is unreachable while planning', async () => {
    const llm = scripted(instantMock(), () => Promise.reject(new Error('network down')));
    const { orchestrator, create } = setup({ llm });
    const { id } = create();
    const task = await waitFor(orchestrator, id, (t) => t.status === 'failed');
    expect(task.error).toBe('network down');
    expect(task.messages.at(-1)).toMatchObject({
      type: 'error',
      payload: { code: 'planning_failed' },
    });
  });

  it('turns a hanging model call into a timeout error', async () => {
    const hang = scripted(instantMock(), (req) =>
      req.meta.kind === 'work'
        ? new Promise((_resolve, reject) =>
            req.signal?.addEventListener('abort', () => reject(req.signal?.reason)),
          )
        : undefined,
    );
    const { orchestrator, create } = setup({ llm: hang, timeoutMs: 50 });
    const { id } = create();
    const task = await waitFor(
      orchestrator,
      id,
      (t) => t.subtasks.length > 0 && subOf(t, 'a').status === 'failed',
    );
    expect(subOf(task, 'a').error).toMatch(/did not answer within/);
  });

  it('cancel stops the task and ignores late answers', async () => {
    const slow = scripted(instantMock(), (req) =>
      req.meta.kind === 'work'
        ? new Promise((resolve) => setTimeout(() => resolve({ text: 'late report' }), 30))
        : undefined,
    );
    const { orchestrator, create } = setup({ llm: slow });
    const { id } = create();
    await waitFor(orchestrator, id, (t) => t.status === 'running');

    expect(orchestrator.cancel(id).status).toBe('cancelled');
    await new Promise((r) => setTimeout(r, 60));
    const task = orchestrator.getTask(id);
    expect(task.subtasks.every((s) => s.versions.length === 0)).toBe(true);
    expectError(() => orchestrator.approve(id, task.subtasks[0]!.id), 'invalid_state');
  });
});
