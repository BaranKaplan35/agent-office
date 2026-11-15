import { describe, expect, it } from 'vitest';
import { buildLayout, type AgentRef } from '../layout';
import {
  buildOfficeGrid,
  celebrateSpots,
  idleSpots,
  meetPlaces,
  seatFor,
} from '../navigation/office';
import { seeded } from '../random';
import { goalFor } from './activities';
import { CharacterBrain } from './brain';
import {
  ambientBubble,
  CHAT_EMOJI,
  highFiveSlots,
  HIGH_FIVE_EMOJI,
  SocialDirector,
  type SocialMember,
} from './social';
import { SpotRegistry } from './spotRegistry';

const agents: AgentRef[] = [
  { id: 'lead', type: 'coordinator' },
  { id: 'a', type: 'worker' },
  { id: 'b', type: 'worker' },
  { id: 'c', type: 'worker' },
  { id: 'd', type: 'worker' },
];
const layout = buildLayout(agents);
const grid = buildOfficeGrid(layout);
const celebrate = celebrateSpots(layout);
const DT = 1 / 20;

function office(seed = 7, sociability = 1) {
  const rand = seeded(seed);
  const spots = new SpotRegistry(idleSpots(layout));
  const members: SocialMember[] = [layout.hub, ...layout.desks].map((slot) => ({
    id: slot.agentId,
    sociability,
    brain: new CharacterBrain(
      {
        id: slot.agentId,
        seat: seatFor(slot),
        grid,
        spots,
        celebrate: celebrate.get(slot.agentId)!,
        rand,
      },
      goalFor('idle'),
    ),
  }));
  const director = new SocialDirector({ places: meetPlaces(layout, grid), grid, spots, rand });
  /** Run the office; `each` may return true to stop early. */
  const tick = (seconds: number, each?: (time: number) => boolean | void) => {
    for (let t = 0; t < seconds; t += DT) {
      for (const m of members) m.brain.update(DT);
      director.update(DT, members);
      if (each?.(t) === true) return;
    }
  };
  const brain = (id: string) => members.find((m) => m.id === id)!.brain;
  return { members, director, tick, brain, spots };
}

describe('SocialDirector: chats', () => {
  it('gathers idle teammates for a chat; they face each other and take turns', () => {
    const { director, tick, brain } = office();
    let talked = false;
    tick(240, () => {
      for (const g of director.active()) {
        if (!g.talking || g.kind === 'highfive') continue;
        talked = true;
        const snaps = g.members.map((id) => brain(id).snapshot());
        for (const s of snaps) {
          expect(s.action).toBe('chat');
          expect(s.meetId).toBe(g.id);
        }
        // at most one of them talks at a time, and only the talker has a bubble
        const speaking = snaps.filter((s) => s.speaking);
        expect(speaking.length).toBeLessThanOrEqual(1);
        for (const id of g.members) {
          const bubble = director.bubbleFor(id);
          if (bubble) expect(CHAT_EMOJI[g.kind]).toContain(bubble);
          if (bubble) expect(brain(id).snapshot().speaking).toBe(true);
        }
      }
    });
    expect(talked).toBe(true);
  });

  it('sometimes chats in threes', () => {
    let three = false;
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const { director, tick } = office(seed);
      tick(200, () => {
        if (director.active().some((g) => g.members.length === 3)) three = true;
      });
      if (three) break;
    }
    expect(three).toBe(true);
  });

  it('never holds more than two chats at once and never puts someone in two', () => {
    const { director, tick } = office(11);
    tick(200, () => {
      const groups = director.active().filter((g) => g.kind !== 'highfive');
      expect(groups.length).toBeLessThanOrEqual(2);
      const ids = groups.flatMap((g) => g.members);
      expect(new Set(ids).size).toBe(ids.length);
    });
  });

  it('lets work win: a member called to the desk leaves, a pair breaks up', () => {
    const { director, tick, brain } = office(3);
    let group: ReturnType<SocialDirector['active']>[number] | undefined;
    tick(240, () => {
      group = director.active().find((g) => g.talking && g.members.length === 2);
      return group !== undefined;
    });
    expect(group).toBeDefined();
    const [first, second] = group!.members;
    brain(first!).setGoal(goalFor('working'));
    tick(1);
    expect(director.active().some((g) => g.id === group!.id)).toBe(false);
    expect(brain(second!).snapshot().meetId).toBeNull();
  });

  it('stays quiet when nobody is sociable enough to start and under reduced motion', () => {
    const shy = office(5, 0);
    shy.tick(120);
    expect(shy.director.active()).toHaveLength(0);

    const calm = office(5);
    for (const m of calm.members) m.brain.setCalm(true);
    calm.tick(120);
    expect(calm.director.active()).toHaveLength(0);
  });

  it('clear() sends everybody on their way', () => {
    const { director, tick, members } = office(9);
    tick(240, () => undefined);
    let found = director.active().length > 0;
    for (let i = 0; i < 20 && !found; i++) {
      tick(10);
      found = director.active().length > 0;
    }
    director.clear(members);
    expect(director.active()).toHaveLength(0);
    for (const m of members) expect(m.brain.snapshot().meetId).toBeNull();
  });
});

describe('SocialDirector: high-fives', () => {
  it('pairs an approved agent with the nearest free teammate', () => {
    const { director, tick, brain } = office(4, 0); // nobody chats on their own
    tick(3);
    director.requestHighFive('a');
    let fived = false;
    tick(20, () => {
      const g = director.active().find((x) => x.kind === 'highfive');
      if (g?.talking) {
        fived = true;
        expect(g.members).toContain('a');
        for (const id of g.members) {
          expect(brain(id).snapshot().action).toBe('highfive');
          expect(director.bubbleFor(id)).toBe(HIGH_FIVE_EMOJI);
        }
      }
    });
    expect(fived).toBe(true);
    // and it is over soon after
    tick(5);
    expect(director.active().filter((g) => g.kind === 'highfive')).toHaveLength(0);
  });

  it('places the pair face to face on free floor', () => {
    const here = idleSpots().find((s) => s.action === 'stretch')!;
    const slots = highFiveSlots(here, { x: here.x + 3, z: here.z }, grid)!;
    expect(Math.hypot(slots[0].x - slots[1].x, slots[0].z - slots[1].z)).toBeCloseTo(0.7, 5);
    expect(Math.cos(slots[0].heading - slots[1].heading)).toBeCloseTo(-1, 5);
  });
});

describe('ambientBubble', () => {
  it('shows a question mark while asking a neighbour, and nothing while typing', () => {
    expect(ambientBubble({ action: 'ask', actionTime: 1 })).toBe('?');
    expect(ambientBubble({ action: 'typing', actionTime: 1 })).toBeNull();
    expect(ambientBubble({ action: 'phone', actionTime: 2 })).toBe('…');
    expect(ambientBubble({ action: 'phone', actionTime: 0.5 })).toBeNull();
  });
});
