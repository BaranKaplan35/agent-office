import { describe, expect, it } from 'vitest';
import { isMotionSetting, motionOverride, resolveReduced } from './motion';

describe('motion', () => {
  it('follows the system unless the viewer picked Full or Reduced', () => {
    expect(resolveReduced('system', true)).toBe(true);
    expect(resolveReduced('system', false)).toBe(false);
    expect(resolveReduced('full', true)).toBe(false);
    expect(resolveReduced('reduced', false)).toBe(true);
  });

  it('lets the URL override everything', () => {
    expect(resolveReduced('reduced', true, 'full')).toBe(false);
    expect(resolveReduced('full', false, 'reduce')).toBe(true);
    expect(motionOverride('?motion=full&hour=9')).toBe('full');
    expect(motionOverride('?motion=fast')).toBeNull();
  });

  it('recognises stored settings', () => {
    expect(isMotionSetting('system')).toBe(true);
    expect(isMotionSetting('slow')).toBe(false);
  });
});
