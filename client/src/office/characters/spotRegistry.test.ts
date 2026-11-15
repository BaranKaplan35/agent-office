import { describe, expect, it } from 'vitest';
import type { IdleSpot, SpotAction } from '../navigation/office';
import { seeded } from '../random';
import { SpotRegistry } from './spotRegistry';

const spot = (id: string, action: SpotAction, owner?: string): IdleSpot => ({
  id,
  x: 0,
  z: 0,
  heading: 0,
  action,
  duration: 5,
  owner,
});

const spots = [
  spot('coffee-0', 'coffee'),
  spot('coffee-1', 'coffee'),
  spot('window-0', 'window'),
  spot('lounge-0', 'lounge'),
  spot('visit-a', 'visit', 'a'),
];

describe('SpotRegistry', () => {
  it('never hands out the same spot twice', () => {
    const reg = new SpotRegistry(spots);
    const rand = seeded(1);
    const ids = ['a', 'b', 'c', 'd', 'e'].map((o) => reg.claim(o, rand)?.id);
    expect(new Set(ids.filter(Boolean)).size).toBe(ids.filter(Boolean).length);
  });

  it('never sends an agent to look at its own screen', () => {
    const reg = new SpotRegistry(spots);
    const rand = seeded(2);
    for (let i = 0; i < 200; i++) {
      expect(reg.claim('a', rand, undefined, { visit: 100 })?.id).not.toBe('visit-a');
    }
  });

  it('follows the weights: a coffee lover mostly goes for coffee', () => {
    const reg = new SpotRegistry(spots);
    const rand = seeded(3);
    let coffee = 0;
    for (let i = 0; i < 400; i++) {
      if (
        reg.claim('b', rand, undefined, { coffee: 8, window: 1, lounge: 1, visit: 0 })?.action ===
        'coffee'
      )
        coffee++;
    }
    expect(coffee / 400).toBeGreaterThan(0.65);
  });

  it('never picks a weight-0 activity while others are free', () => {
    const reg = new SpotRegistry(spots);
    const rand = seeded(4);
    for (let i = 0; i < 200; i++) {
      expect(reg.claim('b', rand, undefined, { lounge: 0 })?.action).not.toBe('lounge');
    }
  });

  it('reserves a particular spot, unless someone else has it', () => {
    const reg = new SpotRegistry(spots);
    expect(reg.reserve('coffee-0', 'a')).toBe(true);
    expect(reg.reserve('coffee-0', 'b')).toBe(false);
    expect(reg.ownerOf('coffee-0')).toBe('a');
    reg.release('a');
    expect(reg.reserve('coffee-0', 'b')).toBe(true);
  });
});
