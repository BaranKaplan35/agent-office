import type { ApiError, HealthResponse } from '@agent-office/shared';

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
  const res = await fetch(`/api${path}`, {
    ...init,
    headers: { 'Content-Type': 'application/json', ...init?.headers },
  });
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

export const api = {
  health: () => request<HealthResponse>('/health'),
};
