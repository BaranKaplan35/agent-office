import { MAX_CLARIFICATIONS } from '@agent-office/shared';
import { describe, expect, it } from 'vitest';
import type { LLMRequest } from '../llm';
import { needsDetails } from '../llm/mock';
import { instantMock, scripted, setup, testTeam, waitFor } from '../test/fixtures';
import { parseCoordinatorAnswer, PlanParseError } from './planParser';
import {
  buildMergeRequest,
  buildPlanRequest,
  buildWorkRequest,
  ensureTitle,
  requestLine,
  wordBudget,
} from './prompts';

const team = testTeam();
const clarify = (reply: string, questions: string[]) =>
  JSON.stringify({ action: 'clarify', reply, questions, summary: '', subtasks: [] });

describe('parseCoordinatorAnswer', () => {
  const planJson = JSON.stringify({
    action: 'plan',
    reply: '',
    questions: [],
    summary: 'Plan',
    subtasks: [{ id: 'sub_1', assignee: 'a', title: 'T', instructions: 'I', dependsOn: [] }],
  });

  it('reads a plan, with or without the action field', () => {
    expect(parseCoordinatorAnswer(planJson, team, { canAsk: true }).kind).toBe('plan');
    const old = JSON.stringify({
      summary: 'Plan',
      subtasks: [{ assignee: 'a', title: 'T', instructions: 'I', dependsOn: [] }],
    });
    expect(parseCoordinatorAnswer(old, team, { canAsk: true }).kind).toBe('plan');
  });

  it('reads a clarification and keeps at most three short questions', () => {
    const long = 'x'.repeat(500);
    const answer = parseCoordinatorAnswer(
      clarify('  Hi!  What shall we build? ', ['One?', '', 'Two?', long, 'Four?']),
      team,
      { canAsk: true },
    );
    expect(answer).toMatchObject({ kind: 'clarify', reply: 'Hi! What shall we build?' });
    if (answer.kind !== 'clarify') throw new Error('expected a clarification');
    expect(answer.questions).toHaveLength(3);
    expect(answer.questions[2]!.length).toBeLessThanOrEqual(300);
  });

  it('treats questions without subtasks as a clarification even without "action"', () => {
    const text = JSON.stringify({ questions: ['What for?'], subtasks: [] });
    expect(parseCoordinatorAnswer(text, team, { canAsk: true }).kind).toBe('clarify');
  });

  it('refuses an empty clarification and asking past the limit', () => {
    expect(() => parseCoordinatorAnswer(clarify('', []), team, { canAsk: true })).toThrow(
      PlanParseError,
    );
    expect(() => parseCoordinatorAnswer(clarify('Hi', ['What?']), team, { canAsk: false })).toThrow(
      PlanParseError,
    );
  });
});

describe('needsDetails (the mock coordinator)', () => {
  it.each(['selam', 'Selam!', 'hi there', 'Merhaba, nasılsın?', 'test', '👋', '', 'logo'])(
    'asks for "%s"',
    (text) => expect(needsDetails(text)).toBe(true),
  );
  it.each(['Habit app', 'Build a tiny traffic light', 'Arduino ile trafik ışığı dersi'])(
    'plans "%s"',
    (text) => expect(needsDetails(text)).toBe(false),
  );
});

describe('prompts with clarifications', () => {
  const clarifications = [
    { reply: 'Hi!', questions: ['What should we make?'], answer: 'A traffic light lesson' },
  ];

  it('replays earlier rounds as a conversation and says when asking is over', () => {
    const req = buildPlanRequest(team, 'selam', 'en', { clarifications, canAsk: false });
    expect(req.messages.map((m) => m.role)).toEqual(['user', 'assistant', 'user']);
    expect(req.messages[2]!.content).toBe('A traffic light lesson');
    expect(req.system).toContain('Plan now');
    expect(buildPlanRequest(team, 'selam', 'en').system).toContain('"action": "clarify"');
  });

  it('hands the answers to workers', () => {
    const req = buildWorkRequest({
      team,
      agent: team.agents[1]!,
      task: 'selam',
      lang: 'en',
      title: 'T',
      instructions: 'I',
      sources: [],
      clarifications,
    });
    expect(req.messages[0]!.content).toContain('What should we make?');
    expect(req.messages[0]!.content).toContain('The user answered: A traffic light lesson');
    expect(req.meta.kind === 'work' && req.meta.task).toBe('selam — A traffic light lesson');
    expect(requestLine('x')).toBe('x');
  });
});

describe('Orchestrator — clarification', () => {
  it('asks first, then plans with the answer and hands it to the workers', async () => {
    const seen: LLMRequest[] = [];
    const llm = scripted(instantMock(), (req) => {
      seen.push(req);
      return undefined;
    });
    const { orchestrator, create } = setup({ llm });
    const { id } = create('selam');

    const asking = await waitFor(orchestrator, id, (t) => t.status === 'awaiting_clarification');
    expect(asking.subtasks).toEqual([]);
    expect(asking.clarifications).toHaveLength(1);
    expect(asking.clarifications[0]!.reply).toContain('LEAD');
    expect(asking.messages.map((m) => m.type)).toEqual(['clarification']);
    expect(asking.planCalls).toHaveLength(1);

    orchestrator.answerClarification(id, 'A tiny traffic light for a class');
    const running = await waitFor(orchestrator, id, (t) => t.status === 'running');
    expect(running.messages.map((m) => m.type).slice(0, 3)).toEqual([
      'clarification',
      'clarification_answer',
      'plan',
    ]);
    expect(running.clarifications[0]!.answer).toBe('A tiny traffic light for a class');
    expect(running.planCalls).toHaveLength(2);

    await waitFor(orchestrator, id, (t) => t.subtasks.some((s) => s.versions.length > 0));
    const work = seen.find((r) => r.meta.kind === 'work');
    expect(work?.messages[0]!.content).toContain('A tiny traffic light for a class');
  });

  it(`stops asking after ${MAX_CLARIFICATIONS} rounds and plans with assumptions`, async () => {
    const { orchestrator, create } = setup();
    const { id } = create('hi');
    for (let round = 1; round <= MAX_CLARIFICATIONS; round++) {
      await waitFor(
        orchestrator,
        id,
        (t) => t.status === 'awaiting_clarification' && t.clarifications.length === round,
      );
      orchestrator.answerClarification(id, 'hello');
    }
    const running = await waitFor(orchestrator, id, (t) => t.status === 'running');
    expect(running.clarifications).toHaveLength(MAX_CLARIFICATIONS);
    expect(running.subtasks.length).toBeGreaterThan(0);
  });

  it('a model that keeps asking past the limit falls back to the default plan', async () => {
    const llm = scripted(instantMock(), (req) =>
      req.meta.kind === 'plan' ? Promise.resolve({ text: clarify('Hm?', ['What?']) }) : undefined,
    );
    const { orchestrator, create } = setup({ llm });
    const { id } = create('Make something');
    for (let round = 1; round <= MAX_CLARIFICATIONS; round++) {
      await waitFor(
        orchestrator,
        id,
        (t) => t.status === 'awaiting_clarification' && t.clarifications.length === round,
      );
      orchestrator.answerClarification(id, 'Just do it');
    }
    const running = await waitFor(orchestrator, id, (t) => t.status === 'running');
    expect(running.subtasks).toHaveLength(3); // one per worker
  });

  it('rejects answers when nobody asked, and empty answers', async () => {
    const { orchestrator, create } = setup();
    const { id } = create('selam');
    expect(() => orchestrator.answerClarification(id, 'too early')).toThrow(/not waiting/);
    await waitFor(orchestrator, id, (t) => t.status === 'awaiting_clarification');
    expect(() => orchestrator.answerClarification(id, '   ')).toThrow(/answer is required/);
  });

  it('can be cancelled while waiting for the answer', async () => {
    const { orchestrator, create } = setup();
    const { id } = create('selam');
    await waitFor(orchestrator, id, (t) => t.status === 'awaiting_clarification');
    expect(orchestrator.cancel(id).status).toBe('cancelled');
    expect(() => orchestrator.answerClarification(id, 'late')).toThrow(/cancelled/);
  });
});

describe('Orchestrator — metrics', () => {
  it('records model, duration and tokens on every report and planning call', async () => {
    const { orchestrator, create } = setup();
    const { id } = create();
    const task = await waitFor(orchestrator, id, (t) => t.subtasks.some((s) => s.versions.length));
    const version = task.subtasks.flatMap((s) => s.versions)[0]!;
    expect(version.metrics).toMatchObject({ provider: 'mock', model: 'mock' });
    expect(version.metrics!.durationMs).toBeGreaterThanOrEqual(0);
    expect(version.metrics!.usage?.outputTokens).toBeGreaterThan(0);
    expect(task.planCalls).toHaveLength(1);
    const report = task.messages.find((m) => m.type === 'report');
    expect(report?.type === 'report' && report.payload.metrics).toEqual(version.metrics);
  });

  it('prefers what the router reports', async () => {
    const llm = scripted(instantMock(), async (req) => ({
      text:
        req.meta.kind === 'plan'
          ? JSON.stringify({
              summary: 's',
              subtasks: [{ assignee: 'a', title: 'T', instructions: 'I', dependsOn: [] }],
            })
          : '# Report',
      provider: 'ollama',
      model: 'qwen3.5:9b',
      durationMs: 4321,
    }));
    const { orchestrator, create } = setup({ llm });
    const { id } = create();
    const task = await waitFor(orchestrator, id, (t) => t.subtasks[0]?.versions.length === 1);
    expect(task.subtasks[0]!.versions[0]!.metrics).toEqual({
      provider: 'ollama',
      model: 'qwen3.5:9b',
      durationMs: 4321,
    });
  });
});

describe('Orchestrator — retry planning', () => {
  it('plans again after a failed planning call, keeping the answered questions', async () => {
    let down = true;
    const llm = scripted(instantMock(), (req) =>
      down && req.meta.kind === 'plan' && req.meta.clarifications.length > 0
        ? Promise.reject(
            new Error('gemini · gemini-3.6-flash: the daily free-tier limit is used up'),
          )
        : undefined,
    );
    const { orchestrator, create } = setup({ llm });
    const { id } = create('selam');
    await waitFor(orchestrator, id, (t) => t.status === 'awaiting_clarification');
    orchestrator.answerClarification(id, 'A tiny traffic light lesson');

    const failed = await waitFor(orchestrator, id, (t) => t.status === 'failed');
    expect(failed.error).toContain('daily free-tier limit');
    const error = failed.messages.at(-1);
    expect(error?.type === 'error' && error.payload.retryable).toBe(true);

    down = false;
    expect(orchestrator.retryPlanning(id).status).toBe('planning');
    const running = await waitFor(orchestrator, id, (t) => t.status === 'running');
    expect(running.error).toBeUndefined();
    expect(running.clarifications[0]!.answer).toBe('A tiny traffic light lesson');
    expect(running.subtasks.length).toBeGreaterThan(0);
  });

  it('only retries a task whose planning failed', async () => {
    const { orchestrator, create } = setup();
    const { id } = create();
    expect(() => orchestrator.retryPlanning(id)).toThrow(/Planning has not failed/);
    await waitFor(orchestrator, id, (t) => t.status === 'running');
    expect(() => orchestrator.retryPlanning(id)).toThrow(/Planning has not failed/);
  });
});

describe('report length', () => {
  it('gives every report a word budget below its token limit', () => {
    expect(wordBudget(2048)).toBe(650);
    expect(wordBudget(100)).toBe(150);
    const req = buildWorkRequest({
      team,
      agent: team.agents[1]!,
      task: 't',
      lang: 'tr',
      title: 'T',
      instructions: 'I',
      sources: [],
    });
    expect(req.system).toContain('under about 300 words');
  });
});

describe('final document title', () => {
  it('keeps a title that is already first', () => {
    expect(ensureTitle('# Lesson Pack\n\nText', 'Lesson Pack')).toBe('# Lesson Pack\n\nText');
  });

  it('moves a title that came after the summary to the top', () => {
    expect(ensureTitle('Summary first.\n\n# Lesson Pack\n\n## Part', 'Lesson Pack')).toBe(
      '# Lesson Pack\n\nSummary first.\n\n## Part',
    );
  });

  it('adds a missing title', () => {
    expect(ensureTitle('Summary.\n\n## Part', 'Girişim Planı')).toBe(
      '# Girişim Planı\n\nSummary.\n\n## Part',
    );
  });

  it('asks the merge for the title first and every report for no lead-ins', () => {
    const merge = buildMergeRequest({ team, task: 't', lang: 'en', sources: [] });
    expect(merge.system).toContain('Start with the heading "# Final Pack"');
    expect(merge.system).not.toContain('no heading before them');
    const work = buildWorkRequest({
      team,
      agent: team.agents[1]!,
      task: 't',
      lang: 'en',
      title: 'T',
      instructions: 'I',
      sources: [],
    });
    expect(work.system).toContain('no lead-ins');
    expect(work.system).toContain('no heading before them');
  });

  it('the merged final always opens with the team title', async () => {
    const llm = scripted(instantMock(), (req) =>
      req.meta.kind === 'merge' ? Promise.resolve({ text: 'Summary.\n\n## Section' }) : undefined,
    );
    const { orchestrator, create } = setup({ llm });
    const { id } = create();
    for (let i = 0; i < 6; i++) {
      const t = await waitFor(
        orchestrator,
        id,
        (x) => x.subtasks.some((s) => s.status === 'awaiting_review') || !!x.final,
      );
      if (t.final) break;
      for (const s of t.subtasks.filter((s) => s.status === 'awaiting_review')) {
        orchestrator.approve(id, s.id);
      }
    }
    const done = await waitFor(orchestrator, id, (t) => t.status === 'awaiting_final_review');
    expect(done.final!.versions[0]!.markdown.startsWith('# Final Pack\n\nSummary.')).toBe(true);
  });
});

describe('cut-off reports', () => {
  it('marks a report version that stopped at the output limit', async () => {
    const llm = scripted(instantMock(), (req) =>
      req.meta.kind === 'work' && req.meta.agent.id === 'a'
        ? Promise.resolve({ text: '# Half a rep', truncated: true })
        : undefined,
    );
    const { orchestrator, create } = setup({ llm });
    const { id } = create();
    const task = await waitFor(
      orchestrator,
      id,
      (t) =>
        t.subtasks.length > 0 &&
        t.subtasks.every((s) => s.assignee === 'b' || s.versions.length > 0),
    );
    const byAgent = Object.fromEntries(task.subtasks.map((s) => [s.assignee, s.versions[0]]));
    expect(byAgent.a?.truncated).toBe(true);
    expect(byAgent.c?.truncated).toBeUndefined();
  });
});
