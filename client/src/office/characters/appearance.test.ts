import { describe, expect, it } from 'vitest';
import { appearanceFor, hashString } from './appearance';

const agent = (id: string, icon: string, type: 'coordinator' | 'worker' = 'worker') => ({
  id,
  icon,
  type,
  deskColor: '#3b82f6',
});

describe('appearanceFor', () => {
  it('is deterministic: the same agent always looks the same', () => {
    expect(appearanceFor(agent('curriculum', 'book-open'), 1)).toEqual(
      appearanceFor(agent('curriculum', 'book-open'), 1),
    );
  });

  it('dresses the agent in their desk colour', () => {
    expect(appearanceFor(agent('a', 'code'), 0).outfit).toBe('#3b82f6');
  });

  it('gives the coordinator a headset and others an accessory that fits their role icon', () => {
    expect(appearanceFor(agent('lead', 'clipboard-list', 'coordinator'), 0).accessory).toBe(
      'headset',
    );
    expect(appearanceFor(agent('lead', 'unknown-icon', 'coordinator'), 0).accessory).toBe(
      'headset',
    );
    expect(appearanceFor(agent('x', 'code'), 0).accessory).toBe('glasses');
    expect(appearanceFor(agent('x', 'megaphone'), 0).accessory).toBe('headband');
    expect(appearanceFor(agent('x', 'bug'), 0).accessory).toBe('goggles');
  });

  it('keeps hats and headbands free of spiky or long hair', () => {
    for (const icon of ['book-open', 'lightbulb', 'megaphone']) {
      for (const id of ['a', 'b', 'c', 'd', 'e', 'f', 'g', 'h']) {
        expect(appearanceFor(agent(id, icon), 0).hairStyle).toBe('short');
      }
    }
  });

  it('falls back to a rotating accessory for unknown icons', () => {
    const seen = new Set(
      [0, 1, 2, 3].map((i) => appearanceFor(agent('x', 'mystery'), i).accessory),
    );
    expect(seen.size).toBe(4);
  });

  it('only returns valid #rrggbb colours', () => {
    const look = appearanceFor(agent('q', 'cpu'), 2);
    for (const c of [look.skin, look.cheek, look.hair, look.outfit, look.pants, look.shoes]) {
      expect(c).toMatch(/^#[0-9a-f]{6}$/);
    }
  });

  it('gives different team members different looks', () => {
    const ids = ['curriculum', 'circuit', 'code', 'test', 'coordinator'];
    const looks = new Set(
      ids.map((id) =>
        JSON.stringify([
          appearanceFor(agent(id, 'x'), 0).skin,
          appearanceFor(agent(id, 'x'), 0).hair,
          appearanceFor(agent(id, 'x'), 0).hairStyle,
        ]),
      ),
    );
    expect(looks.size).toBeGreaterThanOrEqual(4);
  });
});

describe('hashString', () => {
  it('is stable and spreads values', () => {
    expect(hashString('mira')).toBe(hashString('mira'));
    expect(hashString('mira')).not.toBe(hashString('volt'));
  });
});
