import type { Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import type { PublicTeam, Task, TaskEvent } from '@agent-office/shared';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createApp } from './app';
import { parseEnv } from './env';
import { Orchestrator } from './orchestrator/orchestrator';
import { TEAMS_DIR } from './paths';
import { TeamRegistry } from './teams/loader';
import { instantMock } from './test/fixtures';

let server: Server;
let base: string;

beforeAll(async () => {
  const env = parseEnv({ NODE_ENV: 'test' });
  const teams = new TeamRegistry(TEAMS_DIR);
  expect(await teams.load()).toEqual([]);
  const orchestrator = new Orchestrator({ llm: instantMock(), teams, timeoutMs: 2000 });
  const app = createApp({ env, teams, orchestrator });
  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}/api`;
});

afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

const post = (path: string, body?: unknown) =>
  fetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

async function getTask(id: string): Promise<Task> {
  return (await (await fetch(`${base}/tasks/${id}`)).json()) as Task;
}

async function until(id: string, predicate: (t: Task) => boolean): Promise<Task> {
  for (let i = 0; i < 100; i++) {
    const task = await getTask(id);
    if (predicate(task)) return task;
    await new Promise((r) => setTimeout(r, 10));
  }
  throw new Error('condition not reached');
}

describe('API basics', () => {
  it('GET /health reports the active provider', async () => {
    const res = await fetch(`${base}/health`);
    expect(await res.json()).toMatchObject({ ok: true, provider: 'mock' });
  });

  it('unknown routes and invalid JSON return JSON errors', async () => {
    const notFound = await fetch(`${base}/nope`);
    expect(notFound.status).toBe(404);
    expect(await notFound.json()).toMatchObject({ error: { code: 'not_found' } });

    const badJson = await fetch(`${base}/tasks`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: '{oops',
    });
    expect(badJson.status).toBe(400);
    expect(await badJson.json()).toMatchObject({ error: { code: 'invalid_json' } });
  });
});

describe('teams API', () => {
  it('lists public teams without prompts', async () => {
    const teams = (await (await fetch(`${base}/teams`)).json()) as PublicTeam[];
    // Every YAML in teams/ is served; adding a team needs no code or test change.
    expect(teams.map((t) => t.id)).toEqual(
      expect.arrayContaining(['maker-lesson-studio', 'software-startup', 'youtube-video-studio']),
    );
    expect(JSON.stringify(teams)).not.toContain('systemPrompt');
    expect((await fetch(`${base}/teams/ghost`)).status).toBe(404);
  });
});

describe('tasks API', () => {
  it('validates new tasks', async () => {
    const short = await post('/tasks', { teamId: 'software-startup', prompt: '   ' });
    expect(short.status).toBe(400);
    expect(await short.json()).toMatchObject({ error: { code: 'validation' } });

    const ghost = await post('/tasks', { teamId: 'ghost', prompt: 'A real task' });
    expect(ghost.status).toBe(404);
  });

  it('streams a snapshot first over SSE', async () => {
    const created = await post('/tasks', {
      teamId: 'software-startup',
      prompt: 'Habit app',
      lang: 'tr',
    });
    expect(created.status).toBe(201);
    const { taskId } = (await created.json()) as { taskId: string };

    const controller = new AbortController();
    const res = await fetch(`${base}/tasks/${taskId}/events`, { signal: controller.signal });
    expect(res.headers.get('content-type')).toContain('text/event-stream');
    const reader = res.body!.getReader();
    const { value } = await reader.read();
    controller.abort();

    const line = new TextDecoder()
      .decode(value)
      .split('\n')
      .find((l) => l.startsWith('data: '));
    const event = JSON.parse(line!.slice(6)) as TaskEvent;
    expect(event.kind).toBe('snapshot');
    expect(event.task).toMatchObject({ id: taskId, lang: 'tr' });
  });

  it('runs a whole task through the HTTP endpoints', async () => {
    const created = await post('/tasks', {
      teamId: 'maker-lesson-studio',
      prompt: 'Traffic light with Arduino for ages 10-12',
    });
    const { taskId } = (await created.json()) as { taskId: string };

    // Maker Lesson Studio is a chain: curriculum → circuit → code → test.
    for (let step = 0; step < 4; step++) {
      const task = await until(taskId, (t) =>
        t.subtasks.some((s) => s.status === 'awaiting_review'),
      );
      const sub = task.subtasks.find((s) => s.status === 'awaiting_review')!;

      if (step === 0) {
        const empty = await post(`/tasks/${taskId}/subtasks/${sub.id}/revise`, { note: '  ' });
        expect(empty.status).toBe(400);
        const revised = await post(`/tasks/${taskId}/subtasks/${sub.id}/revise`, {
          note: 'Shorter please',
        });
        expect(revised.status).toBe(200);
        await until(taskId, (t) => t.subtasks.find((s) => s.id === sub.id)!.versions.length === 2);
      }

      const approved = await post(`/tasks/${taskId}/subtasks/${sub.id}/approve`);
      expect(approved.status).toBe(200);
      const again = await post(`/tasks/${taskId}/subtasks/${sub.id}/approve`);
      expect(again.status).toBe(409);
    }

    const ready = await until(taskId, (t) => t.status === 'awaiting_final_review');
    expect(ready.final?.versions[0]?.markdown).toContain('# Lesson Pack');
    const code = ready.subtasks.find((s) => s.assignee === 'code')!;
    expect(code.versions[0]?.markdown).toContain('digitalWrite'); // mockResponse from the YAML

    const done = (await (await post(`/tasks/${taskId}/final/approve`)).json()) as Task;
    expect(done.status).toBe('completed');
    expect((await post(`/tasks/${taskId}/cancel`)).status).toBe(409);
  });
});

describe('clarification API', () => {
  it('asks before planning a greeting, then plans with the answer', async () => {
    const created = await post('/tasks', {
      teamId: 'software-startup',
      prompt: 'selam',
      lang: 'tr',
    });
    expect(created.status).toBe(201);
    const { taskId } = (await created.json()) as { taskId: string };

    const asking = await until(taskId, (t) => t.status === 'awaiting_clarification');
    expect(asking.subtasks).toEqual([]);
    expect(asking.clarifications[0]?.questions.length).toBeGreaterThan(0);
    expect(asking.messages.at(-1)?.type).toBe('clarification');

    expect((await post(`/tasks/${taskId}/clarify`, { answer: ' ' })).status).toBe(400);
    const answered = await post(`/tasks/${taskId}/clarify`, {
      answer: 'Alışkanlık takibi için basit bir mobil uygulama',
    });
    expect(answered.status).toBe(200);
    const running = await until(taskId, (t) => t.status === 'running');
    expect(running.subtasks.length).toBeGreaterThan(0);
    expect(running.planCalls).toHaveLength(2);

    // Not waiting for an answer any more.
    expect((await post(`/tasks/${taskId}/clarify`, { answer: 'again' })).status).toBe(409);
  });
});

describe('model labels', () => {
  it('in mock mode every agent is mock, even those with their own llm in the YAML', async () => {
    const teams = (await (await fetch(`${base}/teams`)).json()) as PublicTeam[];
    const agents = teams.flatMap((t) => t.agents);
    expect(agents.length).toBeGreaterThan(0);
    expect(agents.every((a) => a.llm.provider === 'mock' && a.llm.model === 'mock')).toBe(true);
    expect(agents.every((a) => !a.unavailable)).toBe(true);
  });
});
