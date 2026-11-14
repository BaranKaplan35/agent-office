import type { TaskEvent } from '@agent-office/shared';
import type { Request, Response } from 'express';
import type { Orchestrator } from '../orchestrator/orchestrator';

/** Keep in sync with HEARTBEAT_TIMEOUT_MS in client/src/api/useTaskStream.ts (≈3×). */
const HEARTBEAT_MS = 15_000;

/**
 * Stream a task's events as Server-Sent Events. The first event is always a full
 * snapshot, so a reconnecting client is immediately up to date.
 */
export function streamTask(
  req: Request,
  res: Response,
  orchestrator: Orchestrator,
  taskId: string,
) {
  const initial = orchestrator.getTask(taskId); // throws 404 before any header is sent

  res.writeHead(200, {
    'Content-Type': 'text/event-stream; charset=utf-8',
    'Cache-Control': 'no-cache, no-transform',
    Connection: 'keep-alive',
    'X-Accel-Buffering': 'no',
  });

  const send = (event: TaskEvent) => res.write(`data: ${JSON.stringify(event)}\n\n`);
  send({ kind: 'snapshot', task: initial });

  const unsubscribe = orchestrator.subscribe(taskId, send);
  // A real (named) event, not a comment, so the browser can tell a quiet stream from a dead one.
  const heartbeat = setInterval(() => res.write('event: ping\ndata: {}\n\n'), HEARTBEAT_MS);

  req.on('close', () => {
    clearInterval(heartbeat);
    unsubscribe();
  });
}
