import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { parseEnv } from '../env';
import { instantMock, scripted, testTeam, waitFor } from '../test/fixtures';
import { Orchestrator } from './orchestrator';
import {
  createJsonTaskStore,
  INTERRUPTED,
  type PersistedTask,
  type TaskPersistence,
} from './persistence';

const dirs: string[] = [];
const tempFile = () => {
  const dir = mkdtempSync(join(tmpdir(), 'agent-office-tasks-'));
  dirs.push(dir);
  return join(dir, 'nested', 'tasks.json');
};
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

/** Keeps the saved records in memory, like the JSON file would. */
function memoryStore(initial: PersistedTask[] = []) {
  let saved = structuredClone(initial);
  const store: TaskPersistence = {
    load: () => structuredClone(saved),
    save: (records) => {
      saved = structuredClone(records);
    },
  };
  return { store, saved: () => saved };
}

const team = testTeam();
const teams = { get: (id: string) => (id === team.id ? team : undefined) };
const make = (persistence: TaskPersistence, llm = instantMock()) =>
  new Orchestrator({ llm, teams, timeoutMs: 2000, persistence, saveDelayMs: 0 });

describe('JSON task file', () => {
  it('round-trips records and creates the folder', () => {
    const file = tempFile();
    const store = createJsonTaskStore(file);
    expect(store.load()).toEqual([]);
    const record = {
      task: { id: 't1', messages: [] },
      team,
      messageSeq: 3,
      lastNotes: { sub_1: null },
      lastFinalNote: null,
    } as unknown as PersistedTask;
    store.save([record]);
    expect(store.load()).toEqual([record]);
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(1);
  });

  it('moves an unreadable file aside and starts empty', () => {
    const file = tempFile();
    createJsonTaskStore(file).save([]);
    writeFileSync(file, '{ not json');
    const warnings: string[] = [];
    expect(createJsonTaskStore(file, (m) => warnings.push(m)).load()).toEqual([]);
    expect(warnings[0]).toContain('Could not read saved tasks');
    expect(readdirSync(join(file, '..')).some((f) => f.includes('.unreadable-'))).toBe(true);
  });

  it('is on by default and can be switched off', () => {
    expect(parseEnv({}).PERSIST_TASKS).toBe(true);
    expect(parseEnv({ PERSIST_TASKS: 'false' }).PERSIST_TASKS).toBe(false);
  });
});

describe('Orchestrator — saved tasks', () => {
  it('saves every change and a new orchestrator continues the task', async () => {
    const mem = memoryStore();
    const first = make(mem.store);
    const { id } = first.createTask({ teamId: team.id, prompt: 'Build a lamp', lang: 'en' });
    // Wave 1 (a and c) delivered; b waits for a. Nothing is in flight now.
    const ready = await waitFor(
      first,
      id,
      (t) => t.subtasks.filter((s) => s.status === 'awaiting_review').length === 2,
    );
    first.flush();
    expect(mem.saved()[0]?.task.id).toBe(id);

    // "Restart": a new orchestrator reads the same store.
    const second = make(mem.store);
    expect(second.restoredCount).toBe(1);
    const restored = second.getTask(id);
    expect(restored.subtasks.map((s) => s.status)).toEqual(ready.subtasks.map((s) => s.status));

    // The review workflow goes on where it was.
    const sub = restored.subtasks.find((s) => s.status === 'awaiting_review')!;
    expect(second.approve(id, sub.id).subtasks.find((s) => s.id === sub.id)?.status).toBe(
      'approved',
    );
  });

  it('marks work that was cut off as failed, and Retry continues it', async () => {
    const mem = memoryStore();
    // Reports never arrive before the "restart".
    const hanging = scripted(instantMock(), (req) =>
      req.meta.kind === 'work' ? new Promise(() => {}) : undefined,
    );
    const first = make(mem.store, hanging);
    const { id } = first.createTask({ teamId: team.id, prompt: 'Build a lamp', lang: 'en' });
    await waitFor(first, id, (t) => t.subtasks.some((s) => s.status === 'working'));
    first.flush();

    const second = make(mem.store);
    const task = second.getTask(id);
    const failed = task.subtasks.filter((s) => s.status === 'failed');
    expect(failed.length).toBeGreaterThan(0);
    expect(failed[0]!.error).toBe(INTERRUPTED);
    const last = task.messages.at(-1);
    expect(last?.type === 'error' && last.payload.retryable).toBe(true);

    second.retry(id, failed[0]!.id);
    const done = await waitFor(
      second,
      id,
      (t) => t.subtasks.find((s) => s.id === failed[0]!.id)?.status === 'awaiting_review',
    );
    expect(done.subtasks.find((s) => s.id === failed[0]!.id)?.versions).toHaveLength(1);
  });

  it('a task interrupted while planning can be planned again', () => {
    const mem = memoryStore();
    const never = scripted(instantMock(), () => new Promise(() => {}));
    const first = make(mem.store, never);
    const { id } = first.createTask({ teamId: team.id, prompt: 'Build a lamp', lang: 'en' });
    first.flush();

    const second = make(mem.store);
    expect(second.getTask(id)).toMatchObject({ status: 'failed', error: INTERRUPTED });
    expect(second.retryPlanning(id).status).toBe('planning');
  });

  it('keeps the team as it was when the task started', () => {
    const mem = memoryStore();
    const first = make(mem.store);
    const { id } = first.createTask({ teamId: team.id, prompt: 'Build a lamp', lang: 'en' });
    first.flush();
    // The team file is gone after the restart; the saved snapshot still runs the task.
    const second = new Orchestrator({
      llm: instantMock(),
      teams: { get: () => undefined },
      persistence: mem.store,
    });
    expect(second.getTask(id).teamId).toBe(team.id);
  });
});
