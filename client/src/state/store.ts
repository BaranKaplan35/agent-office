import type { Lang, PublicTeam, Task, TaskEvent } from '@agent-office/shared';
import { create } from 'zustand';
import { api, ApiRequestError } from '../api/client';
import { isTaskActive, reviewQueue, sameSelection, type Selection } from './selectors';

export type PanelTab = 'queue' | 'report' | 'log';
export type StreamState = 'idle' | 'connecting' | 'open' | 'reconnecting';

export interface AppError {
  code: string;
  message: string;
}

export interface AppState {
  teams: PublicTeam[];
  teamsState: 'loading' | 'ready' | 'error';
  teamId: string | null;

  taskId: string | null;
  task: Task | null;
  stream: StreamState;

  selection: Selection | null;
  /** null = always show the latest version. */
  viewedVersion: number | null;
  tab: PanelTab;

  /** Key of the request in flight, e.g. "approve:sub_1". */
  pending: string | null;
  error: AppError | null;

  loadTeams: () => Promise<void>;
  /** Fetch the teams again (e.g. after Ollama was started); keeps the current selection. */
  refreshTeams: () => Promise<void>;
  selectTeam: (teamId: string) => void;
  startTask: (prompt: string, lang: Lang) => Promise<boolean>;
  newTask: () => void;
  applyEvent: (event: TaskEvent) => void;
  setStream: (state: StreamState) => void;
  taskLost: () => void;

  select: (selection: Selection | null) => void;
  viewVersion: (version: number | null) => void;
  setTab: (tab: PanelTab) => void;
  dismissError: () => void;

  /** Plan again after planning failed (same prompt and answers). */
  retryPlanning: () => Promise<boolean>;
  /** Answer the coordinator's questions; planning continues. */
  answer: (text: string) => Promise<boolean>;
  approve: () => Promise<boolean>;
  revise: (note: string) => Promise<boolean>;
  retry: (selection: Selection) => Promise<boolean>;
  cancel: () => Promise<boolean>;
}

// ---- per-viewer convenience: remember team and running task across reloads
const SESSION_KEY = 'agent-office.session';

function readSession(): { teamId?: string; taskId?: string } {
  try {
    return JSON.parse(localStorage.getItem(SESSION_KEY) ?? '{}') as {
      teamId?: string;
      taskId?: string;
    };
  } catch {
    return {};
  }
}

function writeSession(value: { teamId: string | null; taskId: string | null }) {
  try {
    localStorage.setItem(SESSION_KEY, JSON.stringify(value));
  } catch {
    // Storage may be blocked; nothing else depends on it.
  }
}

export function toAppError(err: unknown): AppError {
  if (err instanceof ApiRequestError) return { code: err.code, message: err.message };
  return { code: 'unknown', message: err instanceof Error ? err.message : String(err) };
}

/** Never let an older snapshot (e.g. a slow POST response) overwrite a newer one. */
function newer(current: Task | null, incoming: Task): boolean {
  return !current || current.id !== incoming.id || incoming.updatedAt >= current.updatedAt;
}

export const useApp = create<AppState>()((set, get) => {
  /** Run a task command: track it as pending, keep the newest snapshot, surface errors. */
  async function command(
    key: string,
    run: (taskId: string) => Promise<Task>,
  ): Promise<Task | null> {
    const { taskId } = get();
    if (!taskId) return null;
    set({ pending: key, error: null });
    try {
      const task = await run(taskId);
      if (newer(get().task, task)) set({ task });
      return task;
    } catch (err) {
      set({ error: toAppError(err) });
      return null;
    } finally {
      set({ pending: null });
    }
  }

  /** After a decision, jump to the next report that is waiting, if any. */
  function advanceQueue(task: Task, from: Selection) {
    const team = get().teams.find((t) => t.id === task.teamId) ?? null;
    const next = reviewQueue(task, team).find((item) => !sameSelection(item.selection, from));
    if (next) set({ selection: next.selection, viewedVersion: null, tab: 'report' });
  }

  return {
    teams: [],
    teamsState: 'loading',
    teamId: null,
    taskId: null,
    task: null,
    stream: 'idle',
    selection: null,
    viewedVersion: null,
    tab: 'queue',
    pending: null,
    error: null,

    loadTeams: async () => {
      set({ teamsState: 'loading' });
      try {
        const teams = await api.teams();
        const saved = readSession();
        const teamId = teams.some((t) => t.id === saved.teamId)
          ? (saved.teamId as string)
          : (teams[0]?.id ?? null);
        set({ teams, teamsState: 'ready', teamId });

        if (saved.taskId) {
          try {
            const task = await api.task(saved.taskId);
            set({ taskId: task.id, task, teamId: task.teamId });
          } catch {
            // The server forgot it (restart); start fresh.
          }
        }
      } catch (err) {
        set({ teamsState: 'error', error: toAppError(err) });
      }
    },

    refreshTeams: async () => {
      set({ pending: 'teams' });
      try {
        set({ teams: await api.teams() });
      } catch (err) {
        set({ error: toAppError(err) });
      } finally {
        set({ pending: null });
      }
    },

    selectTeam: (teamId) => {
      if (isTaskActive(get().task)) return;
      set({ teamId, taskId: null, task: null, selection: null, viewedVersion: null, tab: 'queue' });
    },

    startTask: async (prompt, lang) => {
      const { teamId } = get();
      if (!teamId) return false;
      set({ pending: 'create', error: null });
      try {
        const { taskId } = await api.createTask({ teamId, prompt, lang });
        const task = await api.task(taskId);
        set({ taskId, task, selection: null, viewedVersion: null, tab: 'queue' });
        return true;
      } catch (err) {
        set({ error: toAppError(err) });
        return false;
      } finally {
        set({ pending: null });
      }
    },

    newTask: () => {
      if (isTaskActive(get().task)) return;
      set({ taskId: null, task: null, selection: null, viewedVersion: null, tab: 'queue' });
    },

    applyEvent: (event) => {
      const { taskId, task } = get();
      if (event.task.id !== taskId || !newer(task, event.task)) return;
      set({ task: event.task });
    },

    setStream: (stream) => set({ stream }),

    taskLost: () =>
      set({
        taskId: null,
        task: null,
        selection: null,
        stream: 'idle',
        error: { code: 'task_lost', message: 'Task not found on the server' },
      }),

    select: (selection) =>
      set({ selection, viewedVersion: null, tab: selection ? 'report' : get().tab }),

    viewVersion: (viewedVersion) => set({ viewedVersion }),

    setTab: (tab) => set({ tab }),

    dismissError: () => set({ error: null }),

    retryPlanning: async () =>
      !!(await command('retry:plan', (taskId) => api.retryPlanning(taskId))),

    answer: async (text) => !!(await command('answer', (taskId) => api.clarify(taskId, text))),

    approve: async () => {
      const { selection } = get();
      if (!selection) return false;
      const key = selection.kind === 'final' ? 'approve:final' : `approve:${selection.id}`;
      const task = await command(key, (taskId) =>
        selection.kind === 'final' ? api.approveFinal(taskId) : api.approve(taskId, selection.id),
      );
      if (task) advanceQueue(task, selection);
      return !!task;
    },

    revise: async (note) => {
      const { selection } = get();
      if (!selection) return false;
      const key = selection.kind === 'final' ? 'revise:final' : `revise:${selection.id}`;
      const task = await command(key, (taskId) =>
        selection.kind === 'final'
          ? api.reviseFinal(taskId, note)
          : api.revise(taskId, selection.id, note),
      );
      if (task) advanceQueue(task, selection);
      return !!task;
    },

    retry: async (selection) => {
      const key = selection.kind === 'final' ? 'retry:final' : `retry:${selection.id}`;
      const task = await command(key, (taskId) =>
        selection.kind === 'final' ? api.retryFinal(taskId) : api.retry(taskId, selection.id),
      );
      return !!task;
    },

    cancel: async () => !!(await command('cancel', (taskId) => api.cancel(taskId))),
  };
});

useApp.subscribe((state, prev) => {
  if (state.teamId !== prev.teamId || state.taskId !== prev.taskId) {
    writeSession({ teamId: state.teamId, taskId: state.taskId });
  }
});

/** The team of the current selection/task. */
export function useCurrentTeam(): PublicTeam | null {
  return useApp((s) => s.teams.find((t) => t.id === (s.task?.teamId ?? s.teamId)) ?? null);
}
