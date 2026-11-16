import { describe, expect, it } from 'vitest';
import { isCaptureMode, stepCssAnimations } from './capture';

describe('isCaptureMode', () => {
  it('turns on with ?capture or ?capture=1, not with ?capture=0', () => {
    expect(isCaptureMode('?capture=1')).toBe(true);
    expect(isCaptureMode('?hour=11&capture')).toBe(true);
    expect(isCaptureMode('?capture=0')).toBe(false);
    expect(isCaptureMode('?hour=11')).toBe(false);
  });
});

describe('stepCssAnimations', () => {
  const fake = (playState: string, currentTime: number | null) => {
    const anim = {
      playState,
      currentTime,
      pause() {
        anim.playState = 'paused';
      },
    };
    return anim;
  };

  it('pauses new animations at 0 and moves paused ones by exactly one frame', () => {
    const fresh = fake('running', null);
    const older = fake('paused', 100);
    const doc = { getAnimations: () => [fresh, older] } as unknown as Document;

    stepCssAnimations(doc, 1000 / 15);
    expect(fresh.playState).toBe('paused');
    expect(fresh.currentTime).toBe(0);
    expect(older.currentTime).toBeCloseTo(166.67, 1);

    stepCssAnimations(doc, 1000 / 15);
    expect(fresh.currentTime).toBeCloseTo(66.67, 1);
  });
});
