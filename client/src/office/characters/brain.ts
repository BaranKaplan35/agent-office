/**
 * A character's behaviour (pure, no Three.js): a small state machine that turns
 * a goal ("sit and type", "wander", "celebrate") into movement and an action.
 * The renderer calls `update(dt)` every frame and draws the returned snapshot.
 *
 *   seated ──goal changes──▶ rising ──▶ walking ──▶ acting (coffee, window, phone …)
 *      ▲                                   │  ├────▶ sitting ─▶ seated (sofa, armchair)
 *      │                                   │  ├────▶ meeting (chat, high-five)
 *      │                                   │  └────▶ celebrating
 *      └────── sitting ◀──────────────────┘
 *
 * While typing at the desk it takes short breaks now and then (lean back, scratch
 * the head, turn to ask a neighbour). Chats and high-fives are arranged from the
 * outside (`social.ts`) through `joinMeet` / `leaveMeet`.
 *
 * Under reduced motion the renderer calls `setCalm(true)` and `settle()`, which
 * puts the character straight into the end state of its goal (no walking, no breaks).
 */
import { findPath, type Grid, type Vec2 } from '../navigation/grid';
import type { CelebrateSpot, IdleSpot, Seat, SpotAction } from '../navigation/office';
import { sameGoal, type DeskPose, type Goal } from './activities';
import type { SpotRegistry } from './spotRegistry';

/** Short breaks taken while typing at the desk. */
export type MicroBreak = 'leanBack' | 'scratch' | 'ask';
/** What a seated character does: a desk pose, a break, or lounging on the sofa. */
export type SeatPose = DeskPose | MicroBreak | 'lounge';
export type ActionName = SeatPose | 'stand' | SpotAction | 'celebrate' | 'chat' | 'highfive';
export type Phase = 'seated' | 'rising' | 'walking' | 'sitting' | 'acting' | 'celebrating';

/** Where to stand for a chat or a high-five, arranged by the social director. */
export interface Meet {
  id: string;
  x: number;
  z: number;
  heading: number;
  gesture: 'chat' | 'highfive';
}

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
  /** The seated pose (kept while standing up so the blend has a start). */
  seatAction: SeatPose;
  /** Seconds since the current action began. */
  actionTime: number;
  phase: Phase;
  /** The idle spot this character stands at (or walks to), if any. */
  spotId: string | null;
  /** In a chat or high-five (walking there or already there). */
  meetId: string | null;
  /** Talking right now (in a chat). */
  speaking: boolean;
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
  /** Relative chance of each idle activity (see `personality.ts`). */
  idleWeights?: Partial<Record<SpotAction, number>>;
  /** Seconds of typing between short breaks, [min, max]; none without it. */
  breakEvery?: [number, number];
  /** There is a neighbour to turn to and ask something. */
  canAsk?: boolean;
}

type Dest =
  { kind: 'seat' } | { kind: 'spot'; spot: IdleSpot } | { kind: 'meet' } | { kind: 'celebrate' };

const TURN_RATE = 9;
const RISE_TIME = 0.45;
const SIT_TIME = 0.6;
const STRIDE = 7.2; // walk-cycle radians per metre
/** Hurrying back to the desk to work is faster than strolling. */
const HURRY = 1.55;
/** Length of each short break at the desk, in seconds. */
export const BREAK_SECONDS: Record<MicroBreak, number> = { leanBack: 2.6, scratch: 1.8, ask: 3 };

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
  private seatAction: SeatPose = 'typing';
  private actionTime = 0;

  /** The chair the character sits on or last got up from (desk, or a lounge seat). */
  private chair: Seat;
  private onLoungeSeat = false;

  /** The pose the desk goal asks for; `seatAction` may show a short break instead. */
  private deskPose: DeskPose = 'typing';
  private micro: MicroBreak | null = null;
  private microLeft = 0;
  private workTime = 0;
  private nextBreak = Infinity;
  private calm = false;

  private meet: Meet | null = null;
  private meetArrived = false;
  private speaking = false;

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
    this.chair = cfg.seat;
    this.goal = initialGoal;
    this.place(initialGoal);
  }

  /** Set what the character should be doing. Calling it again with the same goal does nothing. */
  setGoal(goal: Goal): void {
    if (sameGoal(goal, this.goal)) return;
    this.goal = goal;
    this.goalAge = 0;
  }

  /** Reduced motion: no breaks at the desk and no chats. */
  setCalm(calm: boolean): void {
    if (calm === this.calm) return;
    this.calm = calm;
    if (calm) {
      this.endBreak();
      this.leaveMeet();
    }
  }

  /** True when the character has reached the end state of its goal (nothing left to walk). */
  isSettled(): boolean {
    const want = this.effectiveGoal();
    if (want.kind === 'desk') return this.phase === 'seated' && !this.onLoungeSeat;
    if (want.kind === 'celebrate') return this.phase === 'celebrating';
    return this.phase === 'acting' || (this.phase === 'seated' && this.onLoungeSeat);
  }

  /** Jump straight to the end state of the current goal (reduced motion). */
  settle(): void {
    if (this.isSettled()) return;
    this.meet = null;
    this.speaking = false;
    this.leaveSpot();
    this.place(this.effectiveGoal());
  }

  // ------------------------------------------------------------- meetings

  /** Free to be pulled into a chat: idle, standing (not lounging), not in a meeting. */
  canMeet(): boolean {
    if (this.calm || this.meet || this.effectiveGoal().kind !== 'free') return false;
    return this.phase === 'acting' || this.phase === 'walking';
  }

  /** Walk to a chat or high-five. Returns false when not free for it. */
  joinMeet(meet: Meet): boolean {
    if (!this.canMeet()) return false;
    this.leaveSpot();
    this.meet = meet;
    this.meetArrived = false;
    this.walkTo({ kind: 'meet' }, false);
    return true;
  }

  /** End the chat and wander on. */
  leaveMeet(): void {
    if (!this.meet) return;
    this.meet = null;
    this.meetArrived = false;
    this.speaking = false;
    const want = this.effectiveGoal();
    if (this.phase === 'acting' || this.phase === 'walking') this.startWalk(want, false);
  }

  /** At the meeting place (the others may still be on their way). */
  atMeet(): boolean {
    return this.meet !== null && this.meetArrived;
  }

  setSpeaking(speaking: boolean): void {
    this.speaking = speaking && this.meet !== null;
  }

  /** Restart the current gesture, so a pair high-fives in sync. */
  cue(): void {
    this.actionTime = 0;
  }

  // ---------------------------------------------------------------- update

  update(rawDt: number): CharacterSnapshot {
    const dt = Math.min(Math.max(rawDt, 0), 0.1);
    this.goalAge += dt;
    this.phaseTime += dt;
    this.actionTime += dt;
    const want = this.effectiveGoal();

    switch (this.phase) {
      case 'seated':
        this.updateSeated(want, dt);
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

    // keep the angle in (-π, π] so it never drifts off over a long session
    const turned = turnToward(this.heading, this.targetHeading, TURN_RATE * dt);
    this.heading = Math.atan2(Math.sin(turned), Math.cos(turned));
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
      meetId: this.meet?.id ?? null,
      speaking: this.speaking,
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
    this.chair = seat;
    this.onLoungeSeat = false;
    this.endBreak();

    if (goal.kind === 'desk') {
      this.sitAtDesk(goal.pose);
      this.x = seat.x;
      this.z = seat.z;
      this.heading = this.targetHeading = seat.heading;
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

    const spot = this.claimSpot();
    this.sitBlend = 0;
    if (spot?.sit) {
      this.spot = spot;
      this.takeLoungeSeat(spot);
      this.phase = 'seated';
      this.sitBlend = 1;
      this.x = spot.sit.x;
      this.z = spot.sit.z;
      this.heading = this.targetHeading = spot.heading;
      this.remaining = spot.duration * (0.3 + 0.7 * cfg.rand());
    } else if (spot) {
      this.phase = 'acting';
      this.spot = spot;
      this.x = spot.x;
      this.z = spot.z;
      this.heading = this.targetHeading = spot.heading;
      this.action = spot.action;
      this.remaining = spot.duration * (0.3 + 0.7 * cfg.rand());
    } else {
      this.phase = 'acting';
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

  private sitAtDesk(pose: DeskPose): void {
    this.phase = 'seated';
    this.sitBlend = 1;
    this.deskPose = pose;
    this.seatAction = pose;
    this.action = pose;
    this.actionTime = 0;
    this.workTime = 0;
    this.nextBreak = this.rollBreak(0);
  }

  private takeLoungeSeat(spot: IdleSpot): void {
    const sit = spot.sit as Vec2;
    this.chair = { x: sit.x, z: sit.z, heading: spot.heading, approach: { x: spot.x, z: spot.z } };
    this.onLoungeSeat = true;
    this.seatAction = 'lounge';
    this.action = 'lounge';
  }

  private rise(): void {
    this.endBreak();
    this.phase = 'rising';
    this.phaseTime = 0;
    this.action = 'stand';
  }

  private updateSeated(want: Goal, dt: number): void {
    if (this.onLoungeSeat) {
      this.remaining -= dt;
      if (want.kind !== 'free' || this.remaining <= 0) this.rise();
      return;
    }
    if (want.kind !== 'desk') {
      this.rise();
      return;
    }
    if (want.pose !== this.deskPose) this.sitAtDesk(want.pose);
    this.updateBreaks(dt);
    this.action = this.seatAction;
  }

  // ------------------------------------------------------------ desk breaks

  private rollBreak(after: number): number {
    const range = this.cfg.breakEvery;
    if (!range) return Infinity;
    return after + range[0] + this.cfg.rand() * (range[1] - range[0]);
  }

  private updateBreaks(dt: number): void {
    if (this.deskPose !== 'typing' || this.calm) {
      this.endBreak();
      return;
    }
    this.workTime += dt;
    if (this.micro) {
      this.microLeft -= dt;
      if (this.microLeft <= 0) this.endBreak();
      return;
    }
    if (this.workTime < this.nextBreak) return;

    const options: MicroBreak[] = this.cfg.canAsk
      ? ['leanBack', 'scratch', 'ask']
      : ['leanBack', 'scratch'];
    const pick = options[
      Math.min(options.length - 1, Math.floor(this.cfg.rand() * options.length))
    ] as MicroBreak;
    this.micro = pick;
    this.microLeft = BREAK_SECONDS[pick];
    this.seatAction = pick;
    this.actionTime = 0;
    this.nextBreak = this.rollBreak(this.workTime + this.microLeft);
  }

  private endBreak(): void {
    if (!this.micro) return;
    this.micro = null;
    this.microLeft = 0;
    this.seatAction = this.deskPose;
    this.actionTime = 0;
  }

  // ----------------------------------------------------------------- moving

  private updateSitting(want: Goal): void {
    const p = this.phaseTime / SIT_TIME;
    const k = ease(p);
    const chair = this.chair;
    this.x = this.sitFrom.x + (chair.x - this.sitFrom.x) * k;
    this.z = this.sitFrom.z + (chair.z - this.sitFrom.z) * k;
    this.sitBlend = k;
    this.targetHeading = chair.heading;
    if (p < 1) return;

    this.x = chair.x;
    this.z = chair.z;
    this.sitBlend = 1;
    if (this.onLoungeSeat) {
      this.phase = 'seated';
      this.action = 'lounge';
      this.actionTime = 0;
      return;
    }
    this.sitAtDesk(want.kind === 'desk' ? want.pose : 'reading');
  }

  private updateActing(want: Goal, dt: number): void {
    if (this.meet) {
      // the director ends a meeting; work always wins
      if (want.kind !== 'free') {
        this.meet = null;
        this.meetArrived = false;
        this.speaking = false;
        this.startWalk(want, false);
      }
      return;
    }
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
        (want.kind === 'free' && (dest.kind === 'spot' || dest.kind === 'meet')) ||
        (want.kind === 'celebrate' && dest.kind === 'celebrate'));
    if (!matches) {
      this.meet = null;
      this.meetArrived = false;
      this.speaking = false;
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

  private claimSpot(): IdleSpot | null {
    const spot = this.cfg.spots.claim(
      this.cfg.id,
      this.cfg.rand,
      this.lastSpotId,
      this.cfg.idleWeights,
    );
    if (spot) this.lastSpotId = spot.id;
    return spot;
  }

  private destFor(want: Goal, origin: Vec2): Dest {
    if (want.kind === 'desk') return { kind: 'seat' };
    if (want.kind === 'celebrate') return { kind: 'celebrate' };
    // No free spot (a very small office): just stand still for a moment.
    const spot = this.claimSpot() ?? {
      id: `here-${this.cfg.id}`,
      x: origin.x,
      z: origin.z,
      heading: this.heading,
      action: 'stand' as const,
      duration: 3,
    };
    return { kind: 'spot', spot };
  }

  private startWalk(want: Goal, fromSeat: boolean): void {
    const origin: Vec2 = fromSeat ? this.chair.approach : { x: this.x, z: this.z };
    this.walkTo(this.destFor(want, origin), fromSeat);
  }

  private walkTo(dest: Dest, fromSeat: boolean): void {
    const { grid, seat } = this.cfg;
    const origin: Vec2 = fromSeat ? this.chair.approach : { x: this.x, z: this.z };
    // Getting up from a lounge seat: from now on the desk chair is "the chair" again.
    this.onLoungeSeat = false;
    this.chair = seat;

    let target: Vec2;
    if (dest.kind === 'seat') target = seat.approach;
    else if (dest.kind === 'celebrate') target = this.cfg.celebrate;
    else if (dest.kind === 'meet') target = this.meet as Meet;
    else target = dest.spot;

    const route = findPath(grid, origin, target) ?? [target];
    this.path = fromSeat ? [origin, ...route] : route;
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
      this.chair = this.cfg.seat;
      this.sitFrom = { x: this.x, z: this.z };
    } else if (dest.kind === 'spot' && dest.spot.sit) {
      this.spot = dest.spot;
      this.takeLoungeSeat(dest.spot);
      this.action = 'stand';
      this.phase = 'sitting';
      this.sitFrom = { x: this.x, z: this.z };
      this.remaining = dest.spot.duration * (0.8 + 0.4 * this.cfg.rand());
    } else if (dest.kind === 'spot') {
      this.phase = 'acting';
      this.action = dest.spot.action;
      this.targetHeading = dest.spot.heading;
      this.remaining = dest.spot.duration * (0.8 + 0.4 * this.cfg.rand());
      this.spot = dest.spot;
    } else if (dest.kind === 'meet') {
      const meet = this.meet as Meet;
      this.phase = 'acting';
      this.action = meet.gesture;
      this.targetHeading = meet.heading;
      this.meetArrived = true;
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
