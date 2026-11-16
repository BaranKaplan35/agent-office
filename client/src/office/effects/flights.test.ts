import type { AgentMessage, Task } from '@agent-office/shared';
import { describe, expect, it } from 'vitest';
import { buildLayout } from '../layout';
import {
  arcControl,
  bezier,
  envelopeFrame,
  FADE_SECONDS,
  FLIGHT_SECONDS,
  FlightBoard,
  flightsFor,
  LAND_SECONDS,
  MessageWatcher,
  STAGGER_SECONDS,
  type Vec3,
} from './flights';

const message = (id: string, type: AgentMessage['type'], to: string): AgentMessage =>
  ({
    id,
    taskId: 'task_1',
    type,
    from: 'lead',
    to,
    revision: 0,
    createdAt: '2026-01-01T00:00:00.000Z',
    payload: {},
  }) as AgentMessage;

const task = (id: string, messages: AgentMessage[]): Task => ({
  id,
  teamId: 't',
  prompt: 'p',
  lang: 'en',
  status: 'running',
  clarifications: [],
  planCalls: [],
  subtasks: [],
  messages,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
});

const layout = buildLayout([
  { id: 'lead', type: 'coordinator' },
  { id: 'a', type: 'worker' },
  { id: 'b', type: 'worker' },
]);

const close = (a: Vec3, b: Vec3) => a.forEach((v, i) => expect(v).toBeCloseTo(b[i] as number, 6));

describe('arc maths', () => {
  const from: Vec3 = [0, 1.5, 0];
  const to: Vec3 = [4, 1, 0];

  it('starts at the hub and ends at the desk', () => {
    const c = arcControl(from, to);
    close(bezier(from, c, to, 0), from);
    close(bezier(from, c, to, 1), to);
  });

  it('arcs above both ends, higher for longer throws', () => {
    const c = arcControl(from, to);
    expect(bezier(from, c, to, 0.5)[1]).toBeGreaterThan(1.5);
    expect(arcControl(from, [8, 1, 0])[1]).toBeGreaterThan(c[1]);
  });
});

describe('envelopeFrame', () => {
  const from: Vec3 = [0, 1.5, 0];
  const to: Vec3 = [3, 1, 3];

  it('is invisible before its start', () => {
    const f = envelopeFrame(from, to, -0.2, false);
    expect(f.opacity).toBe(0);
    expect(f.landed).toBe(false);
  });

  it('flies along the arc, then lands with a ring and disappears', () => {
    const mid = envelopeFrame(from, to, FLIGHT_SECONDS / 2, false);
    expect(mid.landed).toBe(false);
    expect(mid.position[1]).toBeGreaterThan(1.5);
    expect(Math.hypot(...mid.tangent)).toBeCloseTo(1, 6);

    const landing = envelopeFrame(from, to, FLIGHT_SECONDS + LAND_SECONDS / 2, false);
    expect(landing.landed).toBe(true);
    close(landing.position, to);
    expect(landing.ring).toBeCloseTo(0.5, 6);

    expect(envelopeFrame(from, to, FLIGHT_SECONDS + LAND_SECONDS, false).done).toBe(true);
  });

  it('fades in place at the desk under reduced motion', () => {
    for (const t of [0.05, 0.5, 1]) {
      const f = envelopeFrame(from, to, t, true);
      close(f.position, to);
      expect(f.ring).toBeNull();
    }
    expect(envelopeFrame(from, to, 0.6, true).opacity).toBe(1);
    expect(envelopeFrame(from, to, 0.6, true).landed).toBe(true);
    expect(envelopeFrame(from, to, FADE_SECONDS, true).done).toBe(true);
  });
});

describe('MessageWatcher', () => {
  it('treats the task present at the start as history', () => {
    const w = new MessageWatcher();
    expect(w.take(task('t1', [message('m1', 'assignment', 'a')]))).toEqual([]);
    const next = w.take(
      task('t1', [message('m1', 'assignment', 'a'), message('m2', 'report', 'user')]),
    );
    expect(next.map((m) => m.id)).toEqual(['m2']);
  });

  it('reports every message of a task started later, once', () => {
    const w = new MessageWatcher();
    expect(w.take(null)).toEqual([]);
    const t = task('t2', [message('m1', 'plan', 'user'), message('m2', 'assignment', 'a')]);
    expect(w.take(t).map((m) => m.id)).toEqual(['m1', 'm2']);
    expect(w.take(t)).toEqual([]);
  });

  it('starts afresh for a new task', () => {
    const w = new MessageWatcher();
    w.take(task('t1', [message('m1', 'assignment', 'a')]));
    expect(w.take(task('t2', [message('x1', 'assignment', 'b')])).map((m) => m.id)).toEqual(['x1']);
  });
});

describe('flightsFor and FlightBoard', () => {
  const messages = [
    message('m1', 'plan', 'user'),
    message('m2', 'assignment', 'a'),
    message('m3', 'assignment', 'b'),
    message('m4', 'assignment', 'ghost'),
  ];

  it('only flies assignments to desks in the office, staggered', () => {
    const flights = flightsFor(messages, layout, () => '#123456', 10);
    expect(flights.map((f) => f.agentId)).toEqual(['a', 'b']);
    expect(flights[1]!.start - flights[0]!.start).toBeCloseTo(STAGGER_SECONDS, 6);
    expect(flights[0]!.from).toEqual([layout.hub.x, expect.any(Number), layout.hub.z]);
    const deskA = layout.desks.find((d) => d.agentId === 'a')!;
    expect(flights[0]!.to[0]).toBe(deskA.x);
    expect(flights[0]!.color).toBe('#123456');
  });

  it('holds the worker until the envelope lands, then forgets it', () => {
    const board = new FlightBoard();
    board.add(flightsFor(messages, layout, () => '#fff', 0));
    expect(board.holding('a', 0.5, false)).toBe(true);
    expect(board.holding('a', FLIGHT_SECONDS + 0.01, false)).toBe(false);
    expect(board.holding('b', FLIGHT_SECONDS + 0.01, false)).toBe(true);
    expect(board.holding('lead', 0.5, false)).toBe(false);
    expect(board.active(1, false)).toHaveLength(2);
    expect(board.active(10, false)).toHaveLength(0);
  });

  it('lands sooner under reduced motion', () => {
    const board = new FlightBoard();
    board.add(flightsFor(messages, layout, () => '#fff', 0));
    expect(board.holding('a', 0.4, true)).toBe(false);
  });
});
