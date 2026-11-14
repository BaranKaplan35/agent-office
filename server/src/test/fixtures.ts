import type { Task, TaskEvent, TeamConfig } from '@agent-office/shared';
import type { LLMProvider, LLMRequest, LLMResponse } from '../llm';
import { createMockProvider } from '../llm/mock';
import { Orchestrator, type OrchestratorOptions } from '../orchestrator/orchestrator';

const agent = (
  id: string,
  type: 'coordinator' | 'worker',
  dependsOn: string[] = [],
): TeamConfig['agents'][number] => ({
  id,
  type,
  name: { en: id.toUpperCase(), tr: id.toUpperCase() },
  role: { en: `Role ${id}`, tr: `Rol ${id}` },
  icon: 'circle',
  deskColor: '#123456',
  systemPrompt: `You are ${id}, a teammate in the test team.`,
  dependsOn,
});

/** lead coordinates; b needs a's approved work; c is independent. */
export function testTeam(overrides: Partial<TeamConfig> = {}): TeamConfig {
  return {
    id: 'test-team',
    version: 1,
    name: { en: 'Test Team', tr: 'Test Ekibi' },
    description: { en: 'd', tr: 'd' },
    taskPlaceholder: { en: 'p', tr: 'p' },
    finalTitle: { en: 'Final Pack', tr: 'Final Paket' },
    settings: { maxRevisions: 2, maxOutputTokens: 1024 },
    agents: [
      agent('lead', 'coordinator'),
      agent('a', 'worker'),
      agent('b', 'worker', ['a']),
      agent('c', 'worker'),
    ],
    ...overrides,
  };
}

export const instantMock = () => createMockProvider({ minDelayMs: 0, maxDelayMs: 0 });

/** Wrap a provider; `override` may answer (or throw) instead of the inner provider. */
export function scripted(
  inner: LLMProvider,
  override: (req: LLMRequest, call: number) => Promise<LLMResponse> | undefined,
): LLMProvider {
  let call = 0;
  return {
    name: inner.name,
    generate: (req) => override(req, call++) ?? inner.generate(req),
  };
}

export function setup(options: Partial<OrchestratorOptions> & { team?: TeamConfig } = {}) {
  const team = options.team ?? testTeam();
  const orchestrator = new Orchestrator({
    llm: options.llm ?? instantMock(),
    teams: { get: (id) => (id === team.id ? team : undefined) },
    timeoutMs: options.timeoutMs ?? 2000,
  });
  const create = (prompt = 'Build a tiny traffic light') =>
    orchestrator.createTask({ teamId: team.id, prompt, lang: 'en' });
  return { orchestrator, team, create };
}

export const statuses = (task: Task) =>
  Object.fromEntries(task.subtasks.map((s) => [s.assignee, s.status]));

export const subOf = (task: Task, assignee: string) => {
  const sub = task.subtasks.find((s) => s.assignee === assignee);
  if (!sub) throw new Error(`no subtask for ${assignee}`);
  return sub;
};

/** Resolve with the first task snapshot that satisfies `predicate`. */
export function waitFor(
  orchestrator: Orchestrator,
  taskId: string,
  predicate: (task: Task) => boolean,
  timeoutMs = 2000,
): Promise<Task> {
  return new Promise((resolve, reject) => {
    const current = orchestrator.getTask(taskId);
    if (predicate(current)) return resolve(current);

    const unsubscribe = orchestrator.subscribe(taskId, (event: TaskEvent) => {
      if (!predicate(event.task)) return;
      clearTimeout(timer);
      unsubscribe();
      resolve(event.task);
    });
    const timer = setTimeout(() => {
      unsubscribe();
      const last = orchestrator.getTask(taskId);
      reject(
        new Error(`waitFor timed out; task ${last.status}, ${JSON.stringify(statuses(last))}`),
      );
    }, timeoutMs);
  });
}
