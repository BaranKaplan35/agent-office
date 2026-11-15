import { describe, expect, it } from 'vitest';
import { isQualitySetting, profileFor, resolveLevel, useQuality } from './quality';

describe('quality', () => {
  it('Auto follows the auto level, fixed settings ignore it', () => {
    expect(resolveLevel('auto', 'high')).toBe('high');
    expect(resolveLevel('auto', 'low')).toBe('low');
    expect(resolveLevel('high', 'low')).toBe('high');
    expect(resolveLevel('low', 'high')).toBe('low');
  });

  it('Low turns shadows off and uses a pixel ratio of 1', () => {
    const low = profileFor('low');
    expect(low.shadows).toBe(false);
    expect(low.dpr).toEqual([1, 1]);
    const high = profileFor('high');
    expect(high.shadows).toBe(true);
    expect(high.dpr[1]).toBeGreaterThan(1);
    expect(high.shadowMapSize).toBeGreaterThan(low.shadowMapSize);
    expect(high.lampLights).toBeGreaterThan(low.lampLights);
  });

  it('validates stored values', () => {
    expect(isQualitySetting('auto')).toBe(true);
    expect(isQualitySetting('ultra')).toBe(false);
    expect(isQualitySetting(null)).toBe(false);
  });

  it('the store starts on Auto/High and the auto level only ever drops', () => {
    const initial = useQuality.getState();
    expect(initial.setting).toBe('auto');
    expect(initial.autoLevel).toBe('high');
    initial.setSetting('low'); // must not throw without localStorage (node)
    expect(useQuality.getState().setting).toBe('low');
    useQuality.getState().lowerAutoLevel();
    expect(useQuality.getState().autoLevel).toBe('low');
  });
});
