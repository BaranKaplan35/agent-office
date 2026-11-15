import { PERSONALITIES } from '@agent-office/shared';
import { describe, expect, it } from 'vitest';
import { personalityFor, TEMPERAMENTS, temperamentFor } from './personality';

const agent = (id: string, name: string, personality?: (typeof PERSONALITIES)[number]) => ({
  id,
  name: { en: name, tr: name },
  personality,
});

describe('personalityFor', () => {
  it('uses the personality from the team file', () => {
    expect(personalityFor(agent('a', 'Mira', 'coffee'))).toBe('coffee');
  });

  it('derives a stable personality from the name when there is none', () => {
    const first = personalityFor(agent('a', 'Mira'));
    expect(PERSONALITIES).toContain(first);
    expect(personalityFor(agent('a', 'Mira'))).toBe(first);
  });

  it('spreads derived personalities over the whole set', () => {
    const names = [
      'Ada',
      'Mira',
      'Volt',
      'Byte',
      'Quinn',
      'Sol',
      'Rex',
      'Iris',
      'Nova',
      'Kai',
      'Lux',
      'Pip',
    ];
    const seen = new Set(names.map((n) => personalityFor(agent(n.toLowerCase(), n))));
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });
});

describe('temperaments', () => {
  it('exist for every personality, with sane numbers', () => {
    for (const p of PERSONALITIES) {
      const t = TEMPERAMENTS[p];
      expect(t.breakEvery[0]).toBeGreaterThan(5);
      expect(t.breakEvery[1]).toBeGreaterThanOrEqual(t.breakEvery[0]);
      expect(t.sociability).toBeGreaterThan(0);
      expect(t.sociability).toBeLessThanOrEqual(1);
    }
  });

  it('give each personality its favourite pastime', () => {
    const fav = (
      p: (typeof PERSONALITIES)[number],
      action: 'coffee' | 'lounge' | 'visit' | 'whiteboard',
    ) => temperamentFor(agent('x', 'X', p)).idleWeights[action] ?? 1;
    expect(fav('coffee', 'coffee')).toBeGreaterThan(fav('calm', 'coffee'));
    expect(fav('calm', 'lounge')).toBeGreaterThan(fav('diligent', 'lounge'));
    expect(fav('social', 'visit')).toBeGreaterThan(fav('calm', 'visit'));
    expect(fav('diligent', 'whiteboard')).toBeGreaterThan(fav('coffee', 'whiteboard'));
    expect(TEMPERAMENTS.social.sociability).toBeGreaterThan(TEMPERAMENTS.diligent.sociability);
    expect(TEMPERAMENTS.diligent.breakEvery[0]).toBeGreaterThan(TEMPERAMENTS.social.breakEvery[0]);
  });
});
