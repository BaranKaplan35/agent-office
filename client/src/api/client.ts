import type {
  ApiError,
  CreateTaskRequest,
  CreateTaskResponse,
  HealthResponse,
  PublicTeam,
  Task,
} from '@agent-office/shared';

export class ApiRequestError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
  } catch (err) {
    throw new ApiRequestError(0, 'network', (err as Error).message);
  }
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as ApiError | null;
    throw new ApiRequestError(
      res.status,
      body?.error.code ?? 'http_error',
      body?.error.message ?? res.statusText,
    );
  }
  return (await res.json()) as T;
}

const post = <T>(path: string, body?: unknown) =>
  request<T>(path, { method: 'POST', body: body === undefined ? undefined : JSON.stringify(body) });

const enc = encodeURIComponent;

export const api = {
  health: () => request<HealthResponse>('/health'),
  teams: () => request<PublicTeam[]>('/teams'),
  task: (taskId: string) => request<Task>(`/tasks/${enc(taskId)}`),
  createTask: (body: CreateTaskRequest) => post<CreateTaskResponse>('/tasks', body),
  cancel: (taskId: string) => post<Task>(`/tasks/${enc(taskId)}/cancel`),
  retryPlanning: (taskId: string) => post<Task>(`/tasks/${enc(taskId)}/plan/retry`),
  clarify: (taskId: string, answer: string) =>
    post<Task>(`/tasks/${enc(taskId)}/clarify`, { answer }),

  approve: (taskId: string, subId: string) =>
    post<Task>(`/tasks/${enc(taskId)}/subtasks/${enc(subId)}/approve`),
  revise: (taskId: string, subId: string, note: string) =>
    post<Task>(`/tasks/${enc(taskId)}/subtasks/${enc(subId)}/revise`, { note }),
  retry: (taskId: string, subId: string) =>
    post<Task>(`/tasks/${enc(taskId)}/subtasks/${enc(subId)}/retry`),

  approveFinal: (taskId: string) => post<Task>(`/tasks/${enc(taskId)}/final/approve`),
  reviseFinal: (taskId: string, note: string) =>
    post<Task>(`/tasks/${enc(taskId)}/final/revise`, { note }),
  retryFinal: (taskId: string) => post<Task>(`/tasks/${enc(taskId)}/final/retry`),

  eventsUrl: (taskId: string) => `/api/tasks/${enc(taskId)}/events`,
};
