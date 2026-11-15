/**
 * Procedural poses (pure): a character's joint angles for every action, computed
 * from time with sines — no animation clips. The renderer just applies the numbers.
 *
 * Sign conventions (so every pose reads naturally):
 *   bodyPitch / headPitch  + = leaning / looking down      headYaw + = turning to the character's left
 *   armX / hip             + = swinging forward            armZ + = away from the body
 *   fore / knee            + = bending (elbow forward, knee backward)
 */
import { SIT_BODY_Y } from './dimensions';
import type { ActionName, CharacterSnapshot, SeatPose } from './brain';

export const POSE_KEYS = [
  'bodyY',
  'bodyPitch',
  'bodyYaw',
  'bodyRoll',
  'headPitch',
  'headYaw',
  'headRoll',
  'armLX',
  'armLZ',
  'foreL',
  'armRX',
  'armRZ',
  'foreR',
  'hipL',
  'kneeL',
  'hipR',
  'kneeR',
  'eyeOpen',
  'mouth',
  'smile',
] as const;
export type PoseKey = (typeof POSE_KEYS)[number];
/** Something in the right hand. */
export type Held = 'none' | 'mug' | 'cup' | 'phone' | 'paper' | 'marker';
export type Pose = Record<PoseKey, number> & { held: Held };

export const NEUTRAL_POSE: Pose = {
  bodyY: 0,
  bodyPitch: 0,
  bodyYaw: 0,
  bodyRoll: 0,
  headPitch: 0,
  headYaw: 0,
  headRoll: 0,
  armLX: 0.04,
  armLZ: 0.1,
  foreL: 0.15,
  armRX: 0.04,
  armRZ: 0.1,
  foreR: 0.15,
  hipL: 0,
  kneeL: 0.03,
  hipR: 0,
  kneeR: 0.03,
  eyeOpen: 1,
  mouth: 0,
  smile: 0.45,
  held: 'none',
};

export interface PoseContext {
  /** Head turn towards the monitor when typing (+ = character's left). */
  lookYaw: number;
  /** Desynchronises characters so they don't move in lockstep. */
  seed: number;
  /** The coordinator at the round hub desk looks between two monitors. */
  hub: boolean;
  /** Reduced motion: hold one representative frame of each pose (no loops, no blinking). */
  still?: boolean;
  /** Turn towards the nearest neighbour when asking something (+ = character's left). */
  askYaw?: number;
}

/** The moment of each action shown under reduced motion (seconds into the action). */
const STILL_ACTION_TIME: Partial<Record<ActionName, number>> = { handRaised: 2 };

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;
const smoothstep = (a: number, b: number, x: number) => {
  const t = clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
};

const pose = (changes: Partial<Pose>): Pose => ({ ...NEUTRAL_POSE, ...changes });

export function lerpPose(a: Pose, b: Pose, t: number): Pose {
  const out = { ...b } as Pose;
  for (const key of POSE_KEYS) out[key] = lerp(a[key], b[key], t);
  out.held = t < 0.5 ? a.held : b.held;
  return out;
}

/** Ease the displayed pose towards the target (frame-rate independent). */
export function smoothPose(current: Pose, target: Pose, dt: number, rate = 26): Pose {
  const k = 1 - Math.exp(-rate * dt);
  const out = lerpPose(current, target, k);
  out.held = target.held;
  return out;
}

// ---------------------------------------------------------------- standing

function walkPose(phase: number): Pose {
  const s = Math.sin(phase);
  const c = Math.cos(phase);
  return pose({
    bodyY: Math.abs(s) * 0.035,
    bodyRoll: s * 0.05,
    bodyPitch: 0.04,
    headRoll: -s * 0.04,
    hipL: s * 0.7,
    hipR: -s * 0.7,
    kneeL: 0.1 + 0.75 * Math.max(0, c),
    kneeR: 0.1 + 0.75 * Math.max(0, -c),
    armLX: -s * 0.6,
    armRX: s * 0.6,
    foreL: 0.35,
    foreR: 0.35,
    smile: 0.6,
  });
}

function standingPose(
  action: ActionName,
  at: number,
  t: number,
  ctx: PoseContext,
  speaking = false,
): Pose {
  const sway = Math.sin(t * 1.6 + ctx.seed);
  switch (action) {
    case 'coffee': {
      const cycle = (at % 6) / 6;
      const sip = smoothstep(0.5, 0.62, cycle) * (1 - smoothstep(0.78, 0.9, cycle));
      return pose({
        bodyY: sway * 0.005,
        armRX: lerp(0.85, 1.65, sip),
        foreR: lerp(1.3, 2.15, sip),
        armLZ: 0.12,
        headPitch: 0.05 - 0.14 * sip,
        headYaw: 0.1 * Math.sin(t * 0.4 + ctx.seed),
        smile: 0.8,
        held: 'mug',
      });
    }
    case 'window':
      return pose({
        bodyY: sway * 0.005,
        armLX: -0.35,
        armRX: -0.35,
        foreL: 0.45,
        foreR: 0.45,
        headPitch: -0.12 + 0.04 * Math.sin(t * 0.4),
        headYaw: 0.5 * Math.sin(t * 0.33 + ctx.seed),
        smile: 0.6,
      });
    case 'stretch': {
      const u = clamp(at / 5, 0, 1);
      const raise = smoothstep(0, 0.18, u) * (1 - smoothstep(0.55, 0.72, u));
      return pose({
        bodyPitch: -0.1 * raise,
        headPitch: -0.25 * raise,
        armLX: lerp(0.04, 3.0, raise),
        armRX: lerp(0.04, 3.0, raise),
        armLZ: lerp(0.1, 0.45, raise),
        armRZ: lerp(0.1, 0.45, raise),
        foreL: lerp(0.15, 0.2, raise),
        foreR: lerp(0.15, 0.2, raise),
        mouth: 0.8 * raise,
        eyeOpen: 1 - 0.85 * raise,
        smile: 0,
      });
    }
    case 'browse':
      return pose({
        armRX: 2.1,
        foreR: 0.5,
        armLZ: 0.6,
        foreL: 1.7,
        headPitch: -0.15 + 0.05 * Math.sin(t * 0.9),
        headYaw: 0.3 * Math.sin(t * 0.4 + ctx.seed),
        smile: 0.5,
      });
    case 'celebrate': {
      const phase = t * 5.5 + ctx.seed;
      const hop = Math.abs(Math.sin(phase));
      return pose({
        bodyY: hop * 0.26,
        hipL: 0.25 * (1 - hop),
        hipR: 0.25 * (1 - hop),
        kneeL: 0.5 * (1 - hop),
        kneeR: 0.5 * (1 - hop),
        armLX: 2.8 + 0.3 * Math.sin(phase * 2),
        armRX: 2.8 + 0.3 * Math.sin(phase * 2 + 1),
        armLZ: 0.45 + 0.25 * Math.sin(phase * 2 + 1),
        armRZ: 0.45 + 0.25 * Math.sin(phase * 2),
        foreL: 0.25,
        foreR: 0.25,
        headPitch: -0.25,
        headRoll: 0.1 * Math.sin(phase * 0.5),
        mouth: 0.85,
        smile: 1,
      });
    }
    case 'water': {
      const cycle = (at % 5) / 5;
      const sip = smoothstep(0.35, 0.5, cycle) * (1 - smoothstep(0.7, 0.85, cycle));
      return pose({
        bodyY: sway * 0.005,
        armRX: lerp(0.8, 1.6, sip),
        foreR: lerp(1.25, 2.1, sip),
        armLZ: 0.12,
        headPitch: 0.05 - 0.2 * sip,
        smile: 0.6,
        held: 'cup',
      });
    }
    case 'phone': {
      const talking = at % 4 > 1 && at % 4 < 3;
      return pose({
        bodyY: sway * 0.006,
        armRX: 0.75,
        armRZ: 0.55,
        foreR: 2.45,
        armLZ: 0.55,
        foreL: 1.6,
        headRoll: -0.14,
        headYaw: 0.35 * Math.sin(t * 0.35 + ctx.seed),
        headPitch: 0.05,
        mouth: talking ? 0.3 * Math.abs(Math.sin(t * 9)) : 0,
        smile: 0.6,
        held: 'phone',
      });
    }
    case 'printer': {
      const c = at % 5;
      const reach = smoothstep(1.4, 2.0, c) * (1 - smoothstep(2.9, 3.4, c));
      const read = smoothstep(3.0, 3.5, c);
      return pose({
        bodyPitch: 0.38 * reach + 0.05,
        headPitch: 0.3 + 0.1 * reach,
        armLX: lerp(0.04, 0.95, reach) + 0.75 * read,
        armRX: lerp(0.04, 0.95, reach) + 0.75 * read,
        foreL: lerp(0.15, 0.3, reach) + 1.0 * read,
        foreR: lerp(0.15, 0.3, reach) + 1.0 * read,
        smile: 0.4,
        held: c > 2.6 ? 'paper' : 'none',
      });
    }
    case 'whiteboard':
      return pose({
        bodyY: sway * 0.004,
        armRX: 1.95 + 0.22 * Math.sin(t * 3.1),
        armRZ: 0.3 + 0.22 * Math.sin(t * 2.3 + 1),
        foreR: 0.45 + 0.15 * Math.sin(t * 4.2),
        armLZ: 0.15,
        foreL: 0.4,
        headPitch: -0.12 + 0.05 * Math.sin(t * 1.1),
        headYaw: 0.15 * Math.sin(t * 0.8),
        smile: 0.5,
        held: 'marker',
      });
    case 'visit':
      return pose({
        bodyPitch: 0.22,
        headPitch: 0.25 + 0.12 * Math.max(0, Math.sin(t * 2.1 + ctx.seed)),
        armLX: -0.45,
        armRX: -0.45,
        armLZ: 0.18,
        armRZ: 0.18,
        foreL: 0.7,
        foreR: 0.7,
        smile: 0.7,
      });
    case 'chat':
      return speaking
        ? pose({
            bodyY: Math.abs(Math.sin(t * 2.2)) * 0.012,
            armRX: 0.75 + 0.3 * Math.sin(t * 4 + ctx.seed),
            foreR: 1.2 + 0.35 * Math.sin(t * 5.1),
            armRZ: 0.2 + 0.1 * Math.sin(t * 3),
            armLX: 0.5 + 0.25 * Math.sin(t * 3.3 + 1),
            foreL: 1.0 + 0.2 * Math.sin(t * 4.4),
            headYaw: 0.12 * Math.sin(t * 1.3),
            headPitch: -0.04,
            mouth: 0.38 * Math.abs(Math.sin(t * 10)),
            smile: 0.85,
          })
        : pose({
            bodyY: sway * 0.004,
            armLX: 0.75,
            armRX: 0.75,
            armLZ: -0.05,
            armRZ: -0.05,
            foreL: 1.95,
            foreR: 1.95,
            headPitch: 0.06 + 0.12 * Math.max(0, Math.sin(t * 2.2 + ctx.seed)),
            headRoll: 0.06 * Math.sin(t * 0.7),
            smile: 0.65,
          });
    case 'highfive': {
      // both hands up, a quick clap in the middle, then a happy grin
      const up = smoothstep(0, 0.45, at) * (1 - smoothstep(1.4, 1.9, at));
      const clap = Math.max(0, 1 - Math.abs(at - 0.7) / 0.18);
      return pose({
        bodyPitch: 0.12 * clap,
        bodyY: 0.05 * up,
        armLX: lerp(0.04, 2.55, up) - 0.25 * clap,
        armRX: lerp(0.04, 2.55, up) - 0.25 * clap,
        armLZ: lerp(0.1, 0.25, up),
        armRZ: lerp(0.1, 0.25, up),
        foreL: lerp(0.15, 0.25, up),
        foreR: lerp(0.15, 0.25, up),
        headPitch: -0.15 * up,
        mouth: at > 0.6 && at < 1.6 ? 0.7 : 0.1,
        smile: 1,
      });
    }
    default:
      // 'stand' and any desk pose seen while on one's feet
      return pose({
        bodyY: sway * 0.006,
        headYaw: 0.25 * Math.sin(t * 0.55 + ctx.seed),
        headPitch: 0.04 * Math.sin(t * 0.8),
        armLX: 0.04 * Math.sin(t * 1.5),
        armRX: -0.04 * Math.sin(t * 1.5),
      });
  }
}

// ----------------------------------------------------------------- seated

const SEATED = {
  bodyY: SIT_BODY_Y,
  hipL: 1.5,
  hipR: 1.5,
  kneeL: 1.5,
  kneeR: 1.5,
} as const;

function seatedPose(action: SeatPose, at: number, t: number, ctx: PoseContext): Pose {
  switch (action) {
    case 'typing':
      return pose({
        ...SEATED,
        bodyPitch: 0.08,
        headPitch: 0.15 + 0.04 * Math.sin(t * 2.3 + ctx.seed),
        headYaw: ctx.hub ? 0.4 * Math.sin(t * 0.7 + ctx.seed) : ctx.lookYaw,
        armLX: 1.05,
        armRX: 1.05,
        foreL: 0.65 + 0.12 * Math.sin(t * 11 + ctx.seed),
        foreR: 0.65 + 0.12 * Math.sin(t * 11 + ctx.seed + 2.1),
        smile: 0.3,
      });
    case 'handRaised': {
      const c = at % 9;
      const up = smoothstep(0, 0.4, c) * (1 - smoothstep(4.6, 5, c));
      return pose({
        ...SEATED,
        bodyRoll: 0.06 * up,
        headYaw: lerp(ctx.hub ? 0 : ctx.lookYaw * 0.5, 0, up),
        armLX: 0.95,
        foreL: 0.75,
        armRX: lerp(0.95, 2.95, up),
        armRZ: lerp(0.1, 0.6 + 0.25 * Math.sin(t * 8), up),
        foreR: lerp(0.75, 0.35, up),
        mouth: 0.3 * up,
        smile: 1,
      });
    }
    case 'leanBack': {
      const back = smoothstep(0, 0.5, at) * (1 - smoothstep(2.1, 2.6, at));
      return pose({
        ...SEATED,
        bodyPitch: lerp(0.08, -0.3, back),
        headPitch: lerp(0.15, -0.25, back),
        armLX: lerp(1.05, 2.75, back),
        armRX: lerp(1.05, 2.75, back),
        armLZ: lerp(0.1, 0.55, back),
        armRZ: lerp(0.1, 0.55, back),
        foreL: lerp(0.65, 2.3, back),
        foreR: lerp(0.65, 2.3, back),
        eyeOpen: 1 - 0.5 * back,
        mouth: 0.5 * back * Math.max(0, Math.sin(at * 2)),
        smile: 0.5,
      });
    }
    case 'scratch': {
      const up = smoothstep(0, 0.35, at) * (1 - smoothstep(1.4, 1.8, at));
      return pose({
        ...SEATED,
        bodyPitch: 0.06,
        headPitch: 0.1,
        headRoll: 0.12 * up,
        headYaw: ctx.hub ? 0 : ctx.lookYaw * 0.6,
        armLX: 1.05,
        foreL: 0.65,
        armRX: lerp(1.05, 2.25, up),
        armRZ: lerp(0.1, 0.45, up),
        foreR: lerp(0.65, 1.9 + 0.18 * Math.sin(t * 16), up),
        smile: 0.1,
      });
    }
    case 'ask': {
      const turn = smoothstep(0, 0.45, at) * (1 - smoothstep(2.5, 3, at));
      const yaw = clamp(ctx.askYaw ?? 0.9, -1.3, 1.3);
      return pose({
        ...SEATED,
        bodyYaw: yaw * 0.3 * turn,
        headYaw: yaw * 0.7 * turn,
        headPitch: 0.02,
        armRX: 1.05,
        foreR: 0.65,
        armLX: lerp(1.05, 0.85, turn),
        armLZ: lerp(0.1, 0.35, turn),
        foreL: lerp(0.65, 1.5 + 0.2 * Math.sin(t * 5), turn),
        mouth: turn * 0.3 * Math.abs(Math.sin(t * 8)),
        smile: 0.6,
      });
    }
    case 'lounge':
      return pose({
        ...SEATED,
        bodyPitch: -0.24,
        hipL: 1.25,
        hipR: 1.25,
        kneeL: 1.15,
        kneeR: 1.15,
        headPitch: -0.04 + 0.05 * Math.sin(t * 0.6 + ctx.seed),
        headYaw: 0.3 * Math.sin(t * 0.25 + ctx.seed),
        armLX: 0.35,
        armRX: 0.35,
        armLZ: 0.42,
        armRZ: 0.42,
        foreL: 0.55,
        foreR: 0.55,
        eyeOpen: 0.85,
        smile: 0.75,
      });
    case 'slumped':
      return pose({
        ...SEATED,
        bodyPitch: 0.32,
        headPitch: 0.62,
        armLX: 0.35,
        armRX: 0.35,
        foreL: 0.4,
        foreR: 0.4,
        eyeOpen: 0.35,
        smile: -0.8,
      });
    case 'nod':
      return pose({
        ...SEATED,
        bodyPitch: 0.05,
        headPitch: 0.1 + 0.35 * Math.max(0, Math.sin(at * 3.6)),
        armLX: 0.95,
        armRX: 0.95,
        foreL: 0.75,
        foreR: 0.75,
        smile: 1,
      });
    default:
      // 'reading' and anything else: watching the screens
      return pose({
        ...SEATED,
        bodyPitch: 0.03,
        headPitch: 0.08 + 0.08 * Math.sin(t * 1.3 + ctx.seed),
        headYaw: ctx.hub
          ? 0.45 * Math.sin(t * 0.5 + ctx.seed)
          : ctx.lookYaw * 0.9 + 0.15 * Math.sin(t * 0.4),
        armLX: 0.95,
        armRX: 0.95,
        foreL: 0.75,
        foreR: 0.75,
        smile: 0.45,
      });
  }
}

/** Blink every few seconds, briefly. */
function blink(t: number, seed: number): number {
  const phase = (t + seed * 1.7) % 3.7;
  return phase < 0.13 ? 0.08 : 1;
}

export type PoseInput = Pick<
  CharacterSnapshot,
  'sitBlend' | 'walking' | 'walkPhase' | 'action' | 'seatAction' | 'actionTime'
> & { speaking?: boolean };

function targetPose(snap: PoseInput, t: number, ctx: PoseContext): Pose {
  const standing = snap.walking
    ? walkPose(snap.walkPhase)
    : standingPose(snap.action, snap.actionTime, t, ctx, snap.speaking);
  return snap.sitBlend > 0
    ? lerpPose(standing, seatedPose(snap.seatAction, snap.actionTime, t, ctx), snap.sitBlend)
    : standing;
}

/** The target pose for a character right now. */
export function computePose(snap: PoseInput, t: number, ctx: PoseContext): Pose {
  if (ctx.still) {
    const held = STILL_ACTION_TIME[snap.sitBlend > 0 ? snap.seatAction : snap.action] ?? 0;
    return targetPose({ ...snap, actionTime: held, walking: false }, 0, { ...ctx, seed: 0 });
  }
  const result = targetPose(snap, t, ctx);
  result.eyeOpen *= blink(t, ctx.seed);
  return result;
}
