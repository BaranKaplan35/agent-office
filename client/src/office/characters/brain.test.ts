import { describe, expect, it } from 'vitest';
import { seeded } from '../random';
import { buildLayout, type AgentRef } from '../layout';
import { isWalkable } from '../navigation/grid';
import { buildOfficeGrid, celebrateSpots, idleSpots, seatFor } from '../navigation/office';
import { goalFor, type Goal } from './activities';
import { CharacterBrain, turnToward, type CharacterSnapshot } from './brain';
import { SpotRegistry } from './spotRegistry';

const agents: AgentRef[] = [
  { id: 'lead', type: 'coordinator' },
  { id: 'a', type: 'worker' },
  { id: 'b', type: 'worker' },
  { id: 'c', type: 'worker' },
];
const layout = buildLayout(agents);
const grid = buildOfficeGrid(layout);
const celebrate = celebrateSpots(layout);
const DT = 1 / 30;

function world() {
  return { spots: new SpotRegistry(idleSpots()), rand: seeded(11) };
}

function brainFor(agentId: string, initial: Goal, shared = world(), speed?: number) {
  const slot = [layout.hub, ...layout.desks].find((s) => s.agentId === agentId)!;
  const cfg = {
    id: agentId,
    seat: seatFor(slot),
    grid,
    spots: shared.spots,
    celebrate: celebrate.get(agentId)!,
    rand: shared.rand,
    speed,
  };
  return { brain: new CharacterBrain(cfg, initial), seat: cfg.seat, shared };
}

/** Run until `done` or the time limit; returns the last snapshot and every frame. */
function run(
  brain: CharacterBrain,
  seconds: number,
  done?: (s: CharacterSnapshot) => boolean,
): { last: CharacterSnapshot; frames: CharacterSnapshot[]; time: number } {
  const frames: CharacterSnapshot[] = [];
  let last = brain.snapshot();
  let time = 0;
  while (time < seconds) {
    last = brain.update(DT);
    frames.push(last);
    time += DT;
    if (done?.(last)) break;
  }
  return { last, frames, time };
}

const desk = goalFor('working');
const free = goalFor('idle');
const cheer = goalFor('done');

describe('CharacterBrain: at the desk', () => {
  it('starts seated at the chair, facing the desk, in the requested pose', () => {
    const { brain, seat } = brainFor('a', desk);
    const s = brain.snapshot();
    expect(s.phase).toBe('seated');
    expect([s.x, s.z]).toEqual([seat.x, seat.z]);
    expect(s.heading).toBeCloseTo(seat.heading, 10);
    expect(s.sitBlend).toBe(1);
    expect(s.action).toBe('typing');
  });

  it('changes pose in place and restarts the action clock', () => {
    const { brain } = brainFor('a', desk);
    run(brain, 2);
    brain.setGoal(goalFor('review'));
    const s = brain.update(DT);
    expect(s.phase).toBe('seated');
    expect(s.action).toBe('handRaised');
    expect(s.actionTime).toBeLessThan(0.1);
  });

  it('stays put while the goal is unchanged', () => {
    const { brain, seat } = brainFor('a', desk);
    const { last } = run(brain, 30);
    expect([last.x, last.z]).toEqual([seat.x, seat.z]);
  });
});

describe('CharacterBrain: wandering', () => {
  it('gets up, walks to a spot and does its action', () => {
    const { brain } = brainFor('a', desk);
    brain.setGoal(free);
    const { last } = run(
      brain,
      30,
      (s) => s.phase === 'acting' || (s.phase === 'seated' && s.action === 'lounge'),
    );
    expect(last.spotId).not.toBeNull();
    const spot = idleSpots().find((s) => s.id === last.spotId)!;
    if (spot.sit) {
      // a sofa or the armchair: sitting on it
      expect(last.sitBlend).toBe(1);
      expect(Math.hypot(last.x - spot.sit.x, last.z - spot.sit.z)).toBeLessThan(0.05);
    } else {
      expect(last.sitBlend).toBe(0);
      expect(last.action).toBe(spot.action);
      expect(Math.hypot(last.x - spot.x, last.z - spot.z)).toBeLessThan(0.05);
    }
  });

  it('never walks faster than its speed, and stays on free floor', () => {
    const { brain, seat } = brainFor('a', desk, world(), 1.5);
    brain.setGoal(free);
    let prev = brain.snapshot();
    const frames = run(brain, 25).frames;
    for (const f of frames) {
      const step = Math.hypot(f.x - prev.x, f.z - prev.z);
      if (f.phase === 'walking') {
        expect(step).toBeLessThanOrEqual(1.5 * DT + 1e-9);
        // leaving the chair is the only stretch allowed to touch furniture
        if (Math.hypot(f.x - seat.x, f.z - seat.z) > 1.2) {
          expect(isWalkable(grid, f), `walking at (${f.x.toFixed(2)}, ${f.z.toFixed(2)})`).toBe(
            true,
          );
        }
      }
      expect(Number.isFinite(f.x) && Number.isFinite(f.z) && Number.isFinite(f.heading)).toBe(true);
      prev = f;
    }
  });

  it('visits several different places over time', () => {
    const { brain } = brainFor('a', free);
    const seen = new Set<string>();
    for (const f of run(brain, 240).frames)
      if (f.spotId && f.phase === 'acting') seen.add(f.spotId);
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it('two characters never use the same spot at the same time', () => {
    const shared = world();
    const one = brainFor('a', free, shared).brain;
    const two = brainFor('b', free, shared).brain;
    const three = brainFor('c', free, shared).brain;
    for (let t = 0; t < 180; t += DT) {
      const spots = [one, two, three]
        .map((b) => b.update(DT).spotId)
        .filter((s): s is string => s !== null);
      expect(new Set(spots).size).toBe(spots.length);
    }
  });

  it('walks in the direction it is heading', () => {
    const { brain } = brainFor('a', desk);
    brain.setGoal(free);
    const frames = run(brain, 8).frames.filter((f) => f.phase === 'walking');
    expect(frames.length).toBeGreaterThan(10);
    // walkPhase only ever grows while walking
    for (let i = 1; i < frames.length; i++) {
      expect(frames[i]!.walkPhase).toBeGreaterThanOrEqual(frames[i - 1]!.walkPhase);
    }
  });
});

describe('CharacterBrain: back to the desk', () => {
  it('walks back, sits down at the chair and takes the new pose', () => {
    const { brain, seat } = brainFor('a', free);
    run(brain, 5);
    brain.setGoal(goalFor('working'));
    const { last } = run(brain, 40, (s) => s.phase === 'seated');
    expect(last.phase).toBe('seated');
    expect([last.x, last.z]).toEqual([seat.x, seat.z]);
    expect(last.sitBlend).toBe(1);
    expect(Math.cos(last.heading - seat.heading)).toBeCloseTo(1, 3);
    expect(last.action).toBe('typing');
  });

  it('changes its mind mid-walk', () => {
    const { brain } = brainFor('a', desk);
    brain.setGoal(free);
    run(brain, 2.5); // on its way somewhere
    expect(brain.snapshot().phase).toBe('walking');
    brain.setGoal(desk);
    const { last } = run(brain, 40, (s) => s.phase === 'seated');
    expect(last.phase).toBe('seated');
  });

  it('releases its spot when it leaves, so others can use it', () => {
    const shared = world();
    const { brain } = brainFor('a', free, shared);
    const spotId = brain.snapshot().spotId!;
    expect(shared.spots.ownerOf(spotId)).toBe('a');
    brain.setGoal(desk);
    run(brain, 40, (s) => s.phase === 'seated');
    expect(shared.spots.ownerOf(spotId)).toBeUndefined();
  });
});

describe('CharacterBrain: hurrying to work', () => {
  it('walks back to the desk faster than it strolls', () => {
    const stroll = brainFor('a', desk);
    stroll.brain.setGoal(free);
    let strolled = 0;
    let prev = stroll.brain.snapshot();
    for (const f of run(stroll.brain, 25).frames) {
      if (f.phase === 'walking')
        strolled = Math.max(strolled, Math.hypot(f.x - prev.x, f.z - prev.z) / DT);
      prev = f;
    }

    const back = brainFor('a', free);
    run(back.brain, 3);
    back.brain.setGoal(desk);
    let hurried = 0;
    prev = back.brain.snapshot();
    for (const f of run(back.brain, 30).frames) {
      if (f.phase === 'walking')
        hurried = Math.max(hurried, Math.hypot(f.x - prev.x, f.z - prev.z) / DT);
      prev = f;
    }
    expect(hurried).toBeGreaterThan(strolled * 1.3);
  });
});

describe('CharacterBrain: approved nod', () => {
  it('nods at the desk, then gets up and wanders off', () => {
    const { brain } = brainFor('a', goalFor('review'));
    brain.setGoal(goalFor('approved'));
    const early = run(brain, 1);
    expect(early.last.action).toBe('nod');
    expect(early.last.phase).toBe('seated');
    const later = run(brain, 6);
    expect(later.frames.some((f) => f.phase === 'walking')).toBe(true);
  });
});

describe('CharacterBrain: celebration', () => {
  it('gathers at its spot on the rug and cheers', () => {
    const { brain } = brainFor('b', desk);
    brain.setGoal(cheer);
    const { last } = run(brain, 40, (s) => s.phase === 'celebrating');
    expect(last.phase).toBe('celebrating');
    expect(last.action).toBe('celebrate');
    const spot = celebrate.get('b')!;
    expect(Math.hypot(last.x - spot.x, last.z - spot.z)).toBeLessThan(0.05);
    // and keeps cheering
    expect(run(brain, 5).last.action).toBe('celebrate');
  });

  it('goes back to the desk when new work arrives', () => {
    const { brain } = brainFor('b', cheer);
    run(brain, 1);
    brain.setGoal(desk);
    expect(run(brain, 40, (s) => s.phase === 'seated').last.phase).toBe('seated');
  });
});

describe('CharacterBrain: robustness', () => {
  it('a huge frame time cannot teleport the character', () => {
    const { brain } = brainFor('a', desk);
    brain.setGoal(free);
    run(brain, 1);
    const before = brain.snapshot();
    const after = brain.update(5);
    expect(Math.hypot(after.x - before.x, after.z - before.z)).toBeLessThanOrEqual(
      1.5 * 0.1 + 1e-9,
    );
  });

  it('setGoal with the same goal is a no-op', () => {
    const { brain } = brainFor('a', goalFor('approved'));
    run(brain, 1.5);
    brain.setGoal(goalFor('approved')); // would reset the nod timer if it counted as a change
    run(brain, 1);
    expect(run(brain, 2).frames.some((f) => f.phase !== 'seated')).toBe(true);
  });
});

describe('turnToward', () => {
  it('turns the short way round and never overshoots', () => {
    expect(turnToward(0, 1, 0.3)).toBeCloseTo(0.3, 10);
    expect(turnToward(0, 0.2, 0.3)).toBeCloseTo(0.2, 10);
    // from just below π to just above -π is a tiny turn, not a full circle
    expect(turnToward(3.0, -3.0, 0.5)).toBeCloseTo(3.0 + 0.283, 2);
    expect(turnToward(0, -2, 0.5)).toBeCloseTo(-0.5, 10);
  });
});

describe('CharacterBrain: settle (reduced motion)', () => {
  it('jumps from wandering straight into the chair', () => {
    const { brain, seat } = brainFor('a', free);
    brain.setGoal(goalFor('working'));
    expect(brain.isSettled()).toBe(false);
    brain.settle();
    const s = brain.snapshot();
    expect(s.phase).toBe('seated');
    expect([s.x, s.z]).toEqual([seat.x, seat.z]);
    expect(s.action).toBe('typing');
    expect(brain.isSettled()).toBe(true);
  });

  it('jumps from mid-walk to the celebration spot and releases its idle spot', () => {
    const shared = world();
    const { brain } = brainFor('a', desk, shared);
    brain.setGoal(free);
    run(brain, 1.2, (s) => s.walking);
    const spotId = brain.snapshot().spotId;
    expect(spotId).not.toBeNull();
    brain.setGoal(cheer);
    brain.settle();
    const s = brain.snapshot();
    expect(s.phase).toBe('celebrating');
    expect([s.x, s.z]).toEqual([celebrate.get('a')!.x, celebrate.get('a')!.z]);
    expect(shared.spots.ownerOf(spotId as string)).toBeUndefined();
  });

  it('does nothing when already settled', () => {
    const { brain } = brainFor('a', desk);
    const before = brain.snapshot();
    brain.settle();
    expect(brain.snapshot()).toEqual(before);
  });
});

describe('CharacterBrain: lounge seats', () => {
  it('sits down on the sofa, stays a while, then gets up and wanders on', () => {
    const shared = world();
    const { brain } = brainFor('a', desk, shared);
    // only lounge seats are attractive
    (brain as unknown as { cfg: { idleWeights: object } }).cfg.idleWeights = {
      coffee: 0,
      window: 0,
      browse: 0,
      stretch: 0,
      phone: 0,
      water: 0,
      printer: 0,
      whiteboard: 0,
      visit: 0,
    };
    brain.setGoal(free);
    const sat = run(brain, 30, (s) => s.phase === 'seated' && s.action === 'lounge').last;
    expect(sat.action).toBe('lounge');
    expect(sat.sitBlend).toBe(1);
    const seat = idleSpots().find((s) => s.id === sat.spotId)!;
    expect(Math.hypot(sat.x - seat.sit!.x, sat.z - seat.sit!.z)).toBeLessThan(0.05);
    expect(brain.canMeet()).toBe(false); // lounging: not pulled into chats
    const up = run(brain, 30, (s) => s.phase === 'walking').last;
    expect(up.phase).toBe('walking');
  });

  it('leaves the sofa at once when work arrives', () => {
    const { brain, seat } = brainFor('a', desk);
    (brain as unknown as { cfg: { idleWeights: object } }).cfg.idleWeights = {
      coffee: 0,
      window: 0,
      browse: 0,
      stretch: 0,
      phone: 0,
      water: 0,
      printer: 0,
      whiteboard: 0,
      visit: 0,
    };
    brain.setGoal(free);
    run(brain, 30, (s) => s.phase === 'seated' && s.action === 'lounge');
    brain.setGoal(desk);
    const { last } = run(brain, 40, (s) => s.phase === 'seated' && s.action === 'typing');
    expect([last.x, last.z]).toEqual([seat.x, seat.z]);
  });
});

describe('CharacterBrain: short breaks while typing', () => {
  function worker(breakEvery: [number, number] = [2, 2], canAsk = true) {
    const shared = world();
    const slot = layout.desks[0]!;
    return new CharacterBrain(
      {
        id: slot.agentId,
        seat: seatFor(slot),
        grid,
        spots: shared.spots,
        celebrate: celebrate.get(slot.agentId)!,
        rand: shared.rand,
        breakEvery,
        canAsk,
      },
      desk,
    );
  }

  it('takes a short break now and then and goes back to typing', () => {
    const brain = worker();
    const { frames } = run(brain, 12);
    const actions = new Set(frames.map((f) => f.action));
    expect([...actions].some((a) => a === 'leanBack' || a === 'scratch' || a === 'ask')).toBe(true);
    expect(frames.at(-1)!.phase).toBe('seated');
    // never leaves the chair for it
    for (const f of frames) expect(f.sitBlend).toBe(1);
    // and keeps typing most of the time
    expect(frames.filter((f) => f.action === 'typing').length).toBeGreaterThan(frames.length / 2);
  });

  it('only asks a neighbour when there is one', () => {
    const brain = worker([1, 1], false);
    expect(run(brain, 30).frames.some((f) => f.action === 'ask')).toBe(false);
  });

  it('takes no breaks under reduced motion', () => {
    const brain = worker();
    brain.setCalm(true);
    expect(run(brain, 12).frames.every((f) => f.action === 'typing')).toBe(true);
  });
});

describe('CharacterBrain: meetings', () => {
  function idle() {
    const { brain } = brainFor('a', free);
    run(brain, 0.2);
    return brain;
  }
  const meetAt = (x: number, z: number, gesture: 'chat' | 'highfive' = 'chat') => ({
    id: 'm1',
    x,
    z,
    heading: 1,
    gesture,
  });
  const spot = idleSpots().find((s) => s.action === 'stretch')!;

  it('walks to the meeting place, turns to the group and chats', () => {
    const brain = idle();
    expect(brain.canMeet()).toBe(true);
    expect(brain.joinMeet(meetAt(spot.x, spot.z))).toBe(true);
    expect(brain.canMeet()).toBe(false);
    const { last } = run(brain, 30, () => brain.atMeet());
    expect(brain.atMeet()).toBe(true);
    expect(last.action).toBe('chat');
    expect(last.meetId).toBe('m1');
    const later = run(brain, 2).last;
    expect(Math.cos(later.heading - 1)).toBeCloseTo(1, 3);
    // stays until the chat ends
    expect(run(brain, 20).last.action).toBe('chat');
  });

  it('speaks only while in a meeting, and wanders on after it', () => {
    const brain = idle();
    brain.setSpeaking(true);
    expect(brain.snapshot().speaking).toBe(false);
    brain.joinMeet(meetAt(spot.x, spot.z));
    run(brain, 30, () => brain.atMeet());
    brain.setSpeaking(true);
    expect(brain.snapshot().speaking).toBe(true);
    brain.leaveMeet();
    const s = brain.update(DT);
    expect(s.meetId).toBeNull();
    expect(s.speaking).toBe(false);
    expect(s.phase).toBe('walking');
  });

  it('drops the chat when work arrives', () => {
    const brain = idle();
    brain.joinMeet(meetAt(spot.x, spot.z));
    run(brain, 30, () => brain.atMeet());
    brain.setGoal(desk);
    const { last } = run(brain, 40, (s) => s.phase === 'seated');
    expect(last.meetId).toBeNull();
    expect(last.action).toBe('typing');
  });

  it('is never pulled into a chat while working or under reduced motion', () => {
    expect(brainFor('a', desk).brain.canMeet()).toBe(false);
    const brain = idle();
    brain.setCalm(true);
    expect(brain.canMeet()).toBe(false);
    expect(brain.joinMeet(meetAt(spot.x, spot.z))).toBe(false);
  });
});
