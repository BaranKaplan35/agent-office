import type { HealthResponse } from '@agent-office/shared';
import { useEffect, useState } from 'react';
import { api } from './client';

export type ServerStatus =
  { state: 'connecting' } | { state: 'online'; health: HealthResponse } | { state: 'offline' };

const POLL_MS = 10_000;

/** Polls /api/health so the header can show whether the backend is reachable. */
export function useServerStatus(): ServerStatus {
  const [status, setStatus] = useState<ServerStatus>({ state: 'connecting' });

  useEffect(() => {
    let alive = true;
    const check = () =>
      api
        .health()
        .then((health) => alive && setStatus({ state: 'online', health }))
        .catch(() => alive && setStatus({ state: 'offline' }));

    void check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  return status;
}
