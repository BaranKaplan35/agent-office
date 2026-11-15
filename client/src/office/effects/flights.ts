/**
 * Envelope flights (pure; no Three.js). Every `assignment` message the
 * orchestrator routes becomes an envelope that flies from the hub desk to the
 * worker's desk on an arc. The worker only heads for the desk once it lands, so
 * the hub-and-spoke architecture is visible as it happens.
 */
import type { AgentMessage, Task } from '@agent-office/shared';
import type { OfficeLayout } from '../layout';

export type Vec3 = [number, number, number];

/** Seconds in the air. */
export const FLIGHT_SECONDS = 1.45;
/** Seconds of the landing pop after arrival. */
export const LAND_SECONDS = 0.35;
/** Reduced motion: the envelope fades in at the desk and out again. */
export const FADE_SECONDS = 1.3;
const FADE_IN = 0.3;
/** Delay between envelopes sent at the same moment. */
export const STAGGER_SECONDS = 0.28;

/** Where envelopes leave the hub and land on a desk (above the desk top). */
const HUB_Y = 1.5;
const DESK_Y = 1.05;

export interface Flight {
  id: string;
  agentId: string;
  from: Vec3;
  to: Vec3;
  color: string;
  /** Start time in seconds (same clock as `now` everywhere below). */
  start: number;
}

export interface EnvelopeFrame {
  position: Vec3;
  /** Direction of travel (unit length; zero while standing still). */
  tangent: Vec3;
  scale: number;
  opacity: number;
  /** 0…1 for the landing ring, null when there is none. */
  ring: number | null;
  /** The worker may start walking to the desk. */
  landed: boolean;
  /** Nothing left to draw. */
  done: boolean;
}

const clamp01 = (x: number) => Math.min(1, Math.max(0, x));
const easeInOut = (x: number) => {
  const t = clamp01(x);
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
};

/** The arc's control point: above the midpoint, higher for longer throws. */
export function arcControl(from: Vec3, to: Vec3): Vec3 {
  const distance = Math.hypot(to[0] - from[0], to[2] - from[2]);
  const top = Math.max(from[1], to[1]) + 0.9 + distance * 0.32;
  return [(from[0] + to[0]) / 2, top, (from[2] + to[2]) / 2];
}

/** Quadratic Bézier point. */
export function bezier(p0: Vec3, p1: Vec3, p2: Vec3, t: number): Vec3 {
  const a = (1 - t) * (1 - t);
  const b = 2 * (1 - t) * t;
  const c = t * t;
  return [
    a * p0[0] + b * p1[0] + c * p2[0],
    a * p0[1] + b * p1[1] + c * p2[1],
    a * p0[2] + b * p1[2] + c * p2[2],
  ];
}

/** Quadratic Bézier derivative (direction of travel, not normalised). */
export function bezierTangent(p0: Vec3, p1: Vec3, p2: Vec3, t: number): Vec3 {
  const a = 2 * (1 - t);
  const b = 2 * t;
  return [
    a * (p1[0] - p0[0]) + b * (p2[0] - p1[0]),
    a * (p1[1] - p0[1]) + b * (p2[1] - p1[1]),
    a * (p1[2] - p0[2]) + b * (p2[2] - p1[2]),
  ];
}

function normalize(v: Vec3): Vec3 {
  const len = Math.hypot(...v);
  return len < 1e-9 ? [0, 0, 0] : [v[0] / len, v[1] / len, v[2] / len];
}

/** How long a flight occupies the scene. */
export function flightDuration(reduced: boolean): number {
  return reduced ? FADE_SECONDS : FLIGHT_SECONDS + LAND_SECONDS;
}

/** Seconds after the start at which the worker may go to the desk. */
export function landingTime(reduced: boolean): number {
  return reduced ? FADE_IN : FLIGHT_SECONDS;
}

/** Everything the renderer needs for one envelope at `elapsed` seconds after its start. */
export function envelopeFrame(
  from: Vec3,
  to: Vec3,
  elapsed: number,
  reduced: boolean,
): EnvelopeFrame {
  const idle: Vec3 = [0, 0, 0];
  if (elapsed < 0) {
    return {
      position: from,
      tangent: idle,
      scale: 0,
      opacity: 0,
      ring: null,
      landed: false,
      done: false,
    };
  }

  if (reduced) {
    const fadeOut = FADE_SECONDS - 0.4;
    const opacity =
      elapsed < FADE_IN ? elapsed / FADE_IN : elapsed > fadeOut ? 1 - (elapsed - fadeOut) / 0.4 : 1;
    return {
      position: to,
      tangent: idle,
      scale: 1,
      opacity: clamp01(opacity),
      ring: null,
      landed: elapsed >= FADE_IN,
      done: elapsed >= FADE_SECONDS,
    };
  }

  const control = arcControl(from, to);
  if (elapsed < FLIGHT_SECONDS) {
    const k = easeInOut(elapsed / FLIGHT_SECONDS);
    return {
      position: bezier(from, control, to, k),
      tangent: normalize(bezierTangent(from, control, to, k)),
      // grows out of the hub, full size for most of the flight
      scale: 0.35 + 0.65 * easeInOut(elapsed / 0.25),
      opacity: 1,
      ring: null,
      landed: false,
      done: false,
    };
  }

  const land = clamp01((elapsed - FLIGHT_SECONDS) / LAND_SECONDS);
  return {
    position: to,
    tangent: idle,
    scale: 1 - land,
    opacity: 1 - land,
    ring: land,
    landed: true,
    done: elapsed >= FLIGHT_SECONDS + LAND_SECONDS,
  };
}

// ------------------------------------------------------------------ messages

/**
 * Tells which messages are new since the last look. The task present when the
 * office first opens is history (a page reload shouldn't replay old envelopes);
 * every task started after that is new from its very first message.
 */
export class MessageWatcher {
  private first = true;
  private taskId: string | null = null;
  private seen = new Set<string>();

  take(task: Task | null): AgentMessage[] {
    const wasFirst = this.first;
    this.first = false;
    if (!task) return [];
    if (task.id !== this.taskId) {
      this.taskId = task.id;
      this.seen = new Set();
    }
    const fresh = task.messages.filter((m) => !this.seen.has(m.id));
    for (const m of fresh) this.seen.add(m.id);
    return wasFirst ? [] : fresh;
  }
}

/** The flights for a batch of new messages (assignments to known desks only). */
export function flightsFor(
  messages: ReadonlyArray<AgentMessage>,
  layout: OfficeLayout,
  colorOf: (agentId: string) => string,
  now: number,
): Flight[] {
  const from: Vec3 = [layout.hub.x, HUB_Y, layout.hub.z];
  const flights: Flight[] = [];
  for (const message of messages) {
    if (message.type !== 'assignment') continue;
    const desk = layout.desks.find((d) => d.agentId === message.to);
    if (!desk) continue;
    flights.push({
      id: message.id,
      agentId: desk.agentId,
      from,
      to: [desk.x, DESK_Y, desk.z],
      color: colorOf(desk.agentId),
      start: now + flights.length * STAGGER_SECONDS,
    });
  }
  return flights;
}

/** The envelopes currently on their way (shared by the renderer and the cast). */
export class FlightBoard {
  private flights: Flight[] = [];

  add(flights: ReadonlyArray<Flight>): void {
    this.flights.push(...flights);
  }

  /** Flights still worth drawing; finished ones are dropped. */
  active(now: number, reduced: boolean): ReadonlyArray<Flight> {
    const duration = flightDuration(reduced);
    this.flights = this.flights.filter((f) => now - f.start < duration);
    return this.flights;
  }

  /** True while an envelope for this agent hasn't landed yet. */
  holding(agentId: string, now: number, reduced: boolean): boolean {
    const landing = landingTime(reduced);
    return this.flights.some((f) => f.agentId === agentId && now - f.start < landing);
  }

  clear(): void {
    this.flights = [];
  }
}
