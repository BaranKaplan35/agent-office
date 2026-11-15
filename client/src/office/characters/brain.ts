/**
 * A character's behaviour (pure, no Three.js): a small state machine that turns
 * a goal ("sit and type", "wander", "celebrate") into movement and an action.
 * The renderer calls `update(dt)` every frame and draws the returned snapshot.
 *
 *   seated ──goal changes──▶ rising ──▶ walking ──▶ acting (coffee, window …)
 *      ▲                                   │  └────▶ celebrating
 *      └────── sitting ◀──────────────────┘
 *
 * Under reduced motion the renderer calls `settle()` instead, which puts the
 * character straight into the end state of its goal (no walking).
 */
import { findPath, type Grid, type Vec2 } from '../navigation/grid';
import type { CelebrateSpot, IdleSpot, Seat, SpotAction } from '../navigation/office';
import { sameGoal, type DeskPose, type Goal } from './activities';
import type { SpotRegistry } from './spotRegistry';

export type ActionName = DeskPose | 'stand' | SpotAction | 'celebrate';
export type Phase = 'seated' | 'rising' | 'walking' | 'sitting' | 'acting' | 'celebrating';

export interface CharacterSnapshot {
  x: number;
  z: number;
  /** Rotation around Y (the character faces local +Z). */
  heading: number;
  /** 0 standing … 1 seated (blends the poses while sitting down or getting up). */
  sitBlend: number;
  walking: boolean;
  /** Advances with distance walked; drives the leg and arm swing. */
  walkPhase: number;
  action: ActionName;
  /** The pose held at the desk (kept while standing up so the blend has a start). */
  seatAction: DeskPose;
  /** Seconds since the current action began. */
  actionTime: number;
  phase: Phase;
  /** The idle spot this character stands at (or walks to), if any. */
  spotId: string | null;
}

export interface BrainConfig {
  id: string;
  seat: Seat;
  grid: Grid;
  spots: SpotRegistry;
  celebrate: CelebrateSpot;
  rand: () => number;
  /** Walking speed in metres per second. */
  speed?: number;
}

type Dest = { kind: 'seat' } | { kind: 'spot'; spot: IdleSpot } | { kind: 'celebrate' };

const TURN_RATE = 9;
const RISE_TIME = 0.45;
const SIT_TIME = 0.6;
const STRIDE = 7.2; // walk-cycle radians per metre
/** Hurrying back to the desk to work is faster than strolling. */
const HURRY = 1.55;

const ease = (t: number) => {
  const x = Math.min(1, Math.max(0, t));
  return x * x * (3 - 2 * x);
};

/** Turn `from` towards `to` by at most `maxStep` radians, the short way round. */
export function turnToward(from: number, to: number, maxStep: number): number {
  let diff = ((to - from + Math.PI) % (2 * Math.PI)) - Math.PI;
  if (diff < -Math.PI) diff += 2 * Math.PI;
  return from + Math.max(-maxStep, Math.min(maxStep, diff));
}

export class CharacterBrain {
  private phase!: Phase;
  private phaseTime = 0;
  private goal: Goal;
  private goalAge = 0;

  private x!: number;
  private z!: number;
  private heading!: number;
  private targetHeading!: number;
  private sitBlend!: number;
  private walkPhase = 0;

  private action!: ActionName;
  private seatAction: DeskPose = 'typing';
  private actionTime = 0;

  private path: Vec2[] = [];
  private dest: Dest | null = null;
  private spot: IdleSpot | null = null;
  private lastSpotId: string | undefined;
  private remaining = 0;
  private sitFrom: Vec2 = { x: 0, z: 0 };
  private readonly speed: number;

  constructor(
    private readonly cfg: BrainConfig,
    initialGoal: Goal,
  ) {
    this.speed = cfg.speed ?? 1.5;
    this.goal = initialGoal;
    this.place(initialGoal);
  }

  /** Set what the character should be doing. Calling it again with the same goal does nothing. */
  setGoal(goal: Goal): void {
    if (sameGoal(goal, this.goal)) return;
    this.goal = goal;
    this.goalAge = 0;
  }

  /** True when the character has reached the end state of its goal (nothing left to walk). */
  isSettled(): boolean {
    const want = this.effectiveGoal();
    if (want.kind === 'desk') return this.phase === 'seated';
    if (want.kind === 'celebrate') return this.phase === 'celebrating';
    return this.phase === 'acting';
  }

  /** Jump straight to the end state of the current goal (reduced motion). */
  settle(): void {
    if (this.isSettled()) return;
    this.leaveSpot();
    this.place(this.effectiveGoal());
  }

  update(rawDt: number): CharacterSnapshot {
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    this.goalAge += dt;
    this.phaseTime += dt;
    this.actionTime += dt;
    const want = this.effectiveGoal();

    switch (this.phase) {
      case 'seated':
        this.updateSeated(want);
        break;
      case 'rising':
        this.sitBlend = 1 - ease(this.phaseTime / RISE_TIME);
        if (this.phaseTime >= RISE_TIME) {
          this.sitBlend = 0;
          this.startWalk(want, true);
        }
        break;
      case 'walking':
        this.updateWalking(want, dt);
        break;
      case 'sitting':
        this.updateSitting(want);
        break;
      case 'acting':
        this.updateActing(want, dt);
        break;
      case 'celebrating':
        if (want.kind !== 'celebrate') this.startWalk(want, false);
        break;
    }

    this.heading = turnToward(this.heading, this.targetHeading, TURN_RATE * dt);
    return this.snapshot();
  }

  snapshot(): CharacterSnapshot {
    return {
      x: this.x,
      z: this.z,
      heading: this.heading,
      sitBlend: this.sitBlend,
      walking: this.phase === 'walking',
      walkPhase: this.walkPhase,
      action: this.action,
      seatAction: this.seatAction,
      actionTime: this.actionTime,
      phase: this.phase,
      spotId: this.spot?.id ?? null,
    };
  }

  // ----------------------------------------------------------------- phases

  /** Put the character directly into the resting state for a goal. */
  private place(goal: Goal): void {
    const { cfg } = this;
    const { seat } = cfg;
    this.path = [];
    this.dest = null;
    this.phaseTime = 0;
    this.actionTime = 0;

    if (goal.kind === 'desk') {
      this.phase = 'seated';
      this.x = seat.x;
      this.z = seat.z;
      this.heading = this.targetHeading = seat.heading;
      this.sitBlend = 1;
      this.seatAction = goal.pose;
      this.action = goal.pose;
      return;
    }
    if (goal.kind === 'celebrate') {
      this.phase = 'celebrating';
      this.x = cfg.celebrate.x;
      this.z = cfg.celebrate.z;
      this.heading = this.targetHeading = cfg.celebrate.heading;
      this.sitBlend = 0;
      this.action = 'celebrate';
      return;
    }

    const spot = cfg.spots.claim(cfg.id, cfg.rand, this.lastSpotId);
    this.phase = 'acting';
    this.sitBlend = 0;
    if (spot) {
      this.spot = spot;
      this.lastSpotId = spot.id;
      this.x = spot.x;
      this.z = spot.z;
      this.heading = this.targetHeading = spot.heading;
      this.action = spot.action;
      this.remaining = spot.duration * (0.3 + 0.7 * cfg.rand());
    } else {
      this.spot = null;
      this.x = seat.approach.x;
      this.z = seat.approach.z;
      this.heading = this.targetHeading = seat.heading;
      this.action = 'stand';
      this.remaining = 3;
    }
  }

  /** A "desk then free" goal turns into plain "free" once its time is up. */
  private effectiveGoal(): Goal {
    if (
      this.goal.kind === 'desk' &&
      this.goal.thenFree !== undefined &&
      this.goalAge >= this.goal.thenFree
    ) {
      return { kind: 'free' };
    }
    return this.goal;
  }

  private updateSeated(want: Goal): void {
    if (want.kind === 'desk') {
      if (want.pose !== this.seatAction) {
        this.seatAction = want.pose;
        this.actionTime = 0;
      }
      this.action = this.seatAction;
      return;
    }
    this.phase = 'rising';
    this.phaseTime = 0;
    this.action = 'stand';
  }

  private updateSitting(want: Goal): void {
    const p = this.phaseTime / SIT_TIME;
    const k = ease(p);
    this.x = this.sitFrom.x + (this.cfg.seat.x - this.sitFrom.x) * k;
    this.z = this.sitFrom.z + (this.cfg.seat.z - this.sitFrom.z) * k;
    this.sitBlend = k;
    this.targetHeading = this.cfg.seat.heading;
    if (p < 1) return;

    this.x = this.cfg.seat.x;
    this.z = this.cfg.seat.z;
    this.sitBlend = 1;
    this.phase = 'seated';
    this.seatAction = want.kind === 'desk' ? want.pose : 'reading';
    this.action = this.seatAction;
    this.actionTime = 0;
  }

  private updateActing(want: Goal, dt: number): void {
    if (want.kind !== 'free') {
      this.leaveSpot();
      this.startWalk(want, false);
      return;
    }
    this.remaining -= dt;
    if (this.remaining <= 0) {
      this.leaveSpot();
      this.startWalk(want, false);
    }
  }

  private updateWalking(want: Goal, dt: number): void {
    const dest = this.dest;
    const matches =
      dest !== null &&
      ((want.kind === 'desk' && dest.kind === 'seat') ||
        (want.kind === 'free' && dest.kind === 'spot') ||
        (want.kind === 'celebrate' && dest.kind === 'celebrate'));
    if (!matches) {
      this.leaveSpot();
      this.startWalk(want, false);
      return;
    }

    const pace = dest.kind === 'seat' ? this.speed * HURRY : this.speed;
    let step = pace * dt;
    let moved = 0;
    while (step > 1e-6 && this.path.length > 0) {
      const next = this.path[0] as Vec2;
      const dx = next.x - this.x;
      const dz = next.z - this.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 1e-6) this.targetHeading = Math.atan2(dx, dz);
      if (distance <= step) {
        this.x = next.x;
        this.z = next.z;
        this.path.shift();
        step -= distance;
        moved += distance;
      } else {
        this.x += (dx / distance) * step;
        this.z += (dz / distance) * step;
        moved += step;
        step = 0;
      }
    }
    this.walkPhase += moved * STRIDE;
    if (this.path.length === 0) this.arrive();
  }

  // ---------------------------------------------------------------- routing

  private startWalk(want: Goal, fromSeat: boolean): void {
    const { grid, seat } = this.cfg;
    const origin: Vec2 = fromSeat ? seat.approach : { x: this.x, z: this.z };

    let dest: Dest;
    let target: Vec2;
    if (want.kind === 'desk') {
      dest = { kind: 'seat' };
      target = seat.approach;
    } else if (want.kind === 'celebrate') {
      dest = { kind: 'celebrate' };
      target = this.cfg.celebrate;
    } else {
      const spot = this.cfg.spots.claim(this.cfg.id, this.cfg.rand, this.lastSpotId);
      // No free spot (a very small office): just stand still for a moment.
      const chosen: IdleSpot = spot ?? {
        id: `here-${this.cfg.id}`,
        x: origin.x,
        z: origin.z,
        heading: this.heading,
        action: 'stand',
        duration: 3,
      };
      if (spot) this.lastSpotId = spot.id;
      dest = { kind: 'spot', spot: chosen };
      target = chosen;
    }

    const route = findPath(grid, origin, target) ?? [target];
    this.path = fromSeat ? [seat.approach, ...route] : route;
    this.dest = dest;
    this.phase = 'walking';
    this.phaseTime = 0;
    this.action = 'stand';
    this.spot = dest.kind === 'spot' ? dest.spot : null;
    if (this.path.length === 0) this.arrive();
  }

  private arrive(): void {
    const dest = this.dest;
    this.phaseTime = 0;
    this.actionTime = 0;
    this.path = [];
    if (!dest || dest.kind === 'seat') {
      this.phase = 'sitting';
      this.sitFrom = { x: this.x, z: this.z };
    } else if (dest.kind === 'spot') {
      this.phase = 'acting';
      this.action = dest.spot.action;
      this.targetHeading = dest.spot.heading;
      this.remaining = dest.spot.duration * (0.8 + 0.4 * this.cfg.rand());
      this.spot = dest.spot;
    } else {
      this.phase = 'celebrating';
      this.action = 'celebrate';
      this.targetHeading = this.cfg.celebrate.heading;
    }
  }

  private leaveSpot(): void {
    this.cfg.spots.release(this.cfg.id);
    this.spot = null;
  }
}
