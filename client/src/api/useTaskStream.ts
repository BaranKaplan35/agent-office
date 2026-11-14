import type { TaskEvent } from '@agent-office/shared';
import { useEffect } from 'react';
import { isTaskActive } from '../state/selectors';
import { useApp } from '../state/store';
import { api, ApiRequestError } from './client';

/** The server pings every 15 s; three missed pings mean the stream is dead. */
const HEARTBEAT_TIMEOUT_MS = 45_000;
const WATCHDOG_MS = 10_000;

/**
 * Keep the current task in sync over Server-Sent Events.
 * - The browser reconnects on its own after network errors.
 * - A watchdog reconnects when the stream goes silent (e.g. a proxy kept a dead
 *   connection open) or was closed by an error status.
 * - If the server no longer knows the task (restart), it is dropped with a message.
 */
export function useTaskStream(): void {
  const taskId = useApp((s) => s.taskId);
  const active = useApp((s) => isTaskActive(s.task) || (s.taskId !== null && s.task === null));

  useEffect(() => {
    if (!taskId || !active) return;
    const { applyEvent, setStream, taskLost } = useApp.getState();

    let source: EventSource | null = null;
    let lastSeen = Date.now();

    const verify = () =>
      api.task(taskId).then(
        (task) => applyEvent({ kind: 'snapshot', task }),
        (err: unknown) => {
          if (err instanceof ApiRequestError && err.status === 404) taskLost();
          else setStream('reconnecting');
        },
      );

    const connect = () => {
      setStream(source ? 'reconnecting' : 'connecting');
      source?.close();
      lastSeen = Date.now();

      const current = new EventSource(api.eventsUrl(taskId));
      source = current;
      current.onopen = () => {
        lastSeen = Date.now();
        setStream('open');
      };
      current.onmessage = (e: MessageEvent<string>) => {
        lastSeen = Date.now();
        try {
          applyEvent(JSON.parse(e.data) as TaskEvent);
        } catch (err) {
          console.error('Bad task event', err);
        }
      };
      current.addEventListener('ping', () => {
        lastSeen = Date.now();
      });
      current.onerror = () => {
        if (current.readyState === EventSource.CONNECTING) {
          setStream('reconnecting');
          return;
        }
        // CLOSED: the server answered with an error status, most likely 404 after a restart.
        void verify();
      };
    };

    connect();
    const watchdog = setInterval(() => {
      const closed = source?.readyState === EventSource.CLOSED;
      const silent = Date.now() - lastSeen > HEARTBEAT_TIMEOUT_MS;
      if (closed || silent) {
        void verify();
        connect();
      }
    }, WATCHDOG_MS);

    return () => {
      clearInterval(watchdog);
      source?.close();
      setStream('idle');
    };
  }, [taskId, active]);
}
