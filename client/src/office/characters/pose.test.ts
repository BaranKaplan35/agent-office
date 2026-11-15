import { describe, expect, it } from 'vitest';
import type { ActionName } from './brain';
import { SIT_BODY_Y } from './dimensions';
import {
  computePose,
  lerpPose,
  NEUTRAL_POSE,
  POSE_KEYS,
  smoothPose,
  type PoseContext,
  type PoseInput,
} from './pose';

const ctx: PoseContext = { lookYaw: -0.45, seed: 1.3, hub: false };

const input = (changes: Partial<PoseInput> = {}): PoseInput => ({
  sitBlend: 0,
  walking: false,
  walkPhase: 0,
  action: 'stand',
  seatAction: 'typing',
  actionTime: 0,
  ...changes,
});

const ACTIONS: ActionName[] = [
  'typing',
  'reading',
  'handRaised',
  'slumped',
  'nod',
  'stand',
  'coffee',
  'window',
  'stretch',
  'browse',
  'celebrate',
];

describe('computePose', () => {
  it('returns finite numbers for every action, standing or seated, over time', () => {
    for (const action of ACTIONS) {
      for (const sitBlend of [0, 0.5, 1]) {
        for (let t = 0; t < 30; t += 0.37) {
          const pose = computePose(
            input({ action, seatAction: action as never, sitBlend, actionTime: t % 11 }),
            t,
            ctx,
          );
          for (const key of POSE_KEYS) {
            expect(Number.isFinite(pose[key]), `${action} ${key} at ${t}`).toBe(true);
          }
          expect(pose.eyeOpen).toBeGreaterThanOrEqual(0);
          expect(pose.eyeOpen).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  it('sits with bent hips and knees, lowered onto the chair', () => {
    const pose = computePose(input({ sitBlend: 1, seatAction: 'typing' }), 1, ctx);
    expect(pose.bodyY).toBeCloseTo(SIT_BODY_Y, 5);
    expect(pose.hipL).toBeGreaterThan(1.3);
    expect(pose.kneeL).toBeGreaterThan(1.3);
    const standing = computePose(input({ sitBlend: 0 }), 1, ctx);
    expect(standing.hipL).toBeLessThan(0.2);
  });

  it('blends between standing and seated', () => {
    const half = computePose(input({ sitBlend: 0.5, seatAction: 'reading' }), 1, ctx);
    expect(half.bodyY).toBeGreaterThan(0.01);
    expect(half.bodyY).toBeLessThan(SIT_BODY_Y);
  });

  it('swings opposite legs and arms while walking', () => {
    const pose = computePose(input({ walking: true, walkPhase: Math.PI / 2 }), 0, ctx);
    expect(pose.hipL).toBeGreaterThan(0.5);
    expect(pose.hipR).toBeLessThan(-0.5);
    expect(pose.armLX).toBeLessThan(-0.4); // left arm back while the left leg is forward
    expect(pose.armRX).toBeGreaterThan(0.4);
    // the body bobs
    expect(pose.bodyY).toBeGreaterThan(0.02);
  });

  it('types: the hands move', () => {
    const values = Array.from(
      { length: 40 },
      (_, i) => computePose(input({ sitBlend: 1, seatAction: 'typing' }), i * 0.03, ctx).foreL,
    );
    expect(Math.max(...values) - Math.min(...values)).toBeGreaterThan(0.1);
    // and the head looks towards the monitor
    expect(computePose(input({ sitBlend: 1, seatAction: 'typing' }), 0, ctx).headYaw).toBeCloseTo(
      ctx.lookYaw,
      10,
    );
  });

  it('raises the right hand while waiting for review, then lowers it', () => {
    const at = (actionTime: number) =>
      computePose(input({ sitBlend: 1, seatAction: 'handRaised', actionTime }), 1, ctx).armRX;
    expect(at(2.5)).toBeGreaterThan(2.7); // hand up
    expect(at(7)).toBeLessThan(1.2); // resting again
    expect(at(0)).toBeLessThan(1.2); // starts down, then rises
  });

  it('slumps when something failed', () => {
    const pose = computePose(input({ sitBlend: 1, seatAction: 'slumped' }), 1, ctx);
    expect(pose.headPitch).toBeGreaterThan(0.5);
    expect(pose.smile).toBeLessThan(0);
  });

  it('jumps and throws its arms up when celebrating', () => {
    const heights = Array.from(
      { length: 60 },
      (_, i) => computePose(input({ action: 'celebrate' }), i * 0.05, ctx).bodyY,
    );
    expect(Math.max(...heights)).toBeGreaterThan(0.2);
    expect(Math.min(...heights)).toBeGreaterThanOrEqual(0);
    const pose = computePose(input({ action: 'celebrate' }), 0.3, ctx);
    expect(pose.armLX).toBeGreaterThan(2.3);
    expect(pose.armRX).toBeGreaterThan(2.3);
    expect(pose.mouth).toBeGreaterThan(0.5);
  });

  it('holds a mug while drinking coffee, and lifts it to the mouth now and then', () => {
    const pose = (actionTime: number) =>
      computePose(input({ action: 'coffee', actionTime }), 1, ctx);
    expect(pose(1).mug).toBe(true);
    expect(pose(3.6).armRX).toBeGreaterThan(pose(0.5).armRX + 0.5);
  });

  it('stretches with raised arms, then relaxes', () => {
    const arms = (actionTime: number) =>
      computePose(input({ action: 'stretch', actionTime }), 1, ctx).armRX;
    expect(arms(1.5)).toBeGreaterThan(2.5);
    expect(arms(4.8)).toBeLessThan(0.5);
  });

  it('blinks now and then, but is mostly open-eyed', () => {
    const samples = Array.from(
      { length: 400 },
      (_, i) => computePose(input({ action: 'stand' }), i * 0.05, ctx).eyeOpen,
    );
    expect(samples.some((v) => v < 0.2)).toBe(true);
    expect(samples.filter((v) => v > 0.9).length).toBeGreaterThan(350);
  });
});

describe('pose blending', () => {
  it('lerpPose hits both ends', () => {
    const a = { ...NEUTRAL_POSE, bodyY: 0 };
    const b = { ...NEUTRAL_POSE, bodyY: 1, mug: true };
    expect(lerpPose(a, b, 0).bodyY).toBe(0);
    expect(lerpPose(a, b, 1).bodyY).toBe(1);
    expect(lerpPose(a, b, 0.25).bodyY).toBeCloseTo(0.25, 10);
  });

  it('smoothPose eases towards the target without overshooting, at any frame rate', () => {
    const target = { ...NEUTRAL_POSE, bodyY: 1 };
    for (const dt of [1 / 144, 1 / 60, 1 / 30]) {
      let current = { ...NEUTRAL_POSE };
      for (let i = 0; i < Math.round(1 / dt); i++) {
        const next = smoothPose(current, target, dt);
        expect(next.bodyY).toBeGreaterThanOrEqual(current.bodyY);
        expect(next.bodyY).toBeLessThanOrEqual(1);
        current = next;
      }
      expect(current.bodyY).toBeGreaterThan(0.99); // about the same after one second
    }
  });
});

describe('still poses (reduced motion)', () => {
  const still = { ...ctx, still: true };

  it('hold the same frame whatever the time', () => {
    for (const action of ACTIONS) {
      const seated = ['typing', 'reading', 'handRaised', 'slumped', 'nod'].includes(action);
      const snap = (at: number) =>
        input(
          seated
            ? { sitBlend: 1, seatAction: action as never, action, actionTime: at }
            : { action, actionTime: at },
        );
      expect(computePose(snap(0.3), 1.7, still)).toEqual(computePose(snap(6.1), 42.5, still));
    }
  });

  it('keep the hand up and the eyes open', () => {
    const p = computePose(
      input({ sitBlend: 1, seatAction: 'handRaised', action: 'handRaised' }),
      0,
      still,
    );
    expect(p.armRX).toBeGreaterThan(2.5);
    expect(p.eyeOpen).toBe(1);
  });
});
