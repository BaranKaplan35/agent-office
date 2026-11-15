import { describe, expect, it } from 'vitest';
import { buildLayout, HUB_POSITION, type AgentRef } from '../layout';
import { findPath, isWalkable, lineOfSight, type Vec2 } from './grid';
import {
  buildOfficeGrid,
  celebrateSpots,
  idleSpots,
  KEEP_CLEAR,
  meetPlaces,
  seatFor,
} from './office';

const team = (workers: number): AgentRef[] => [
  { id: 'lead', type: 'coordinator' },
  ...Array.from({ length: workers }, (_, i): AgentRef => ({ id: `w${i + 1}`, type: 'worker' })),
];

describe.each([2, 3, 4, 5])('office navigation with %i workers', (n) => {
  const layout = buildLayout(team(n));
  const grid = buildOfficeGrid(layout);
  const slots = [layout.hub, ...layout.desks];

  it('every seat has a free spot behind its chair to stand on', () => {
    for (const slot of slots) {
      const seat = seatFor(slot);
      expect(isWalkable(grid, seat.approach), `approach of ${slot.agentId}`).toBe(true);
    }
  });

  it('every idle spot is free floor, and no two crowd each other', () => {
    const spots = idleSpots(layout);
    for (const spot of spots) {
      expect(isWalkable(grid, spot), spot.id).toBe(true);
    }
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        const a = spots[i]!;
        const b = spots[j]!;
        expect(Math.hypot(a.x - b.x, a.z - b.z), `${a.id} ↔ ${b.id}`).toBeGreaterThan(0.6);
      }
    }
  });

  it('idle spots stay clear of every seat and its approach', () => {
    for (const spot of idleSpots(layout)) {
      for (const slot of slots) {
        const seat = seatFor(slot);
        for (const p of [seat, seat.approach]) {
          expect(
            Math.hypot(p.x - spot.x, p.z - spot.z),
            `${spot.id} vs ${slot.agentId}`,
          ).toBeGreaterThan(0.6);
        }
      }
    }
  });

  it('has places to chat: coffee corner, a window, the lounge and most desks', () => {
    const places = meetPlaces(layout, grid);
    const kinds = new Set(places.map((p) => p.kind));
    for (const k of ['coffee', 'window', 'lounge', 'floor', 'cooler'] as const) {
      expect(kinds.has(k), k).toBe(true);
    }
    expect(places.filter((p) => p.kind === 'desk').length).toBeGreaterThanOrEqual(Math.min(2, n));
    for (const place of places) {
      expect(place.slots.length).toBeGreaterThanOrEqual(2);
      for (const slot of place.slots) {
        expect(isWalkable(grid, slot), place.id).toBe(true);
        // facing the middle of the group
        const look = { x: Math.sin(slot.heading), z: Math.cos(slot.heading) };
        const to = { x: place.center.x - slot.x, z: place.center.z - slot.z };
        expect(look.x * to.x + look.z * to.z).toBeGreaterThan(0);
        for (const spot of idleSpots(layout)) {
          if (spot.id === slot.spotId) continue; // a reserved idle spot (coffee counter)
          expect(Math.hypot(spot.x - slot.x, spot.z - slot.z)).toBeGreaterThanOrEqual(KEEP_CLEAR);
        }
      }
    }
  });

  it('every celebration spot is free floor, and they do not crowd each other', () => {
    const spots = [...celebrateSpots(layout).values()];
    expect(spots).toHaveLength(n + 1);
    for (const s of spots) expect(isWalkable(grid, s)).toBe(true);
    for (let i = 0; i < spots.length; i++) {
      for (let j = i + 1; j < spots.length; j++) {
        expect(Math.hypot(spots[i]!.x - spots[j]!.x, spots[i]!.z - spots[j]!.z)).toBeGreaterThan(
          1.2,
        );
      }
    }
  });

  it('every seat, spot and chat place is reachable (no closed-off areas)', () => {
    const stops: Array<[string, Vec2]> = [
      ...slots.map((s): [string, Vec2] => [`seat ${s.agentId}`, seatFor(s).approach]),
      ...idleSpots(layout).map((s): [string, Vec2] => [s.id, s]),
      ...[...celebrateSpots(layout).entries()].map(([id, s]): [string, Vec2] => [
        `celebrate ${id}`,
        s,
      ]),
      ...meetPlaces(layout, grid).flatMap((p) =>
        p.slots.map((s, i): [string, Vec2] => [`${p.id}#${i}`, s]),
      ),
    ];
    // the grid is undirected: reaching everything from one stop (and back) proves it
    const [homeName, home] = stops[0]!;
    for (const [name, stop] of stops.slice(1)) {
      for (const [from, to, label] of [
        [home, stop, `${homeName} → ${name}`],
        [stop, home, `${name} → ${homeName}`],
      ] as const) {
        const path = findPath(grid, from, to);
        expect(path, label).not.toBeNull();
        let prev = from;
        for (const p of path!) {
          expect(lineOfSight(grid, prev, p), `${label} segment`).toBe(true);
          prev = p;
        }
      }
    }
  });
});

describe('seatFor', () => {
  it('sits the character at the chair, facing the desk, with room to approach', () => {
    const layout = buildLayout(team(3));
    for (const slot of layout.desks) {
      const seat = seatFor(slot);
      // the character looks along (sin heading, cos heading): towards the desk centre
      const look: Vec2 = { x: Math.sin(seat.heading), z: Math.cos(seat.heading) };
      const toDesk: Vec2 = { x: slot.x - seat.x, z: slot.z - seat.z };
      const len = Math.hypot(toDesk.x, toDesk.z);
      expect(look.x * (toDesk.x / len) + look.z * (toDesk.z / len)).toBeCloseTo(1, 5);
      // the approach point is farther from the desk than the seat
      expect(Math.hypot(seat.approach.x - slot.x, seat.approach.z - slot.z)).toBeGreaterThan(
        Math.hypot(seat.x - slot.x, seat.z - slot.z) + 0.5,
      );
    }
  });
});

describe('celebrateSpots', () => {
  it('gathers everyone around the hub, facing the camera', () => {
    const layout = buildLayout(team(4));
    for (const spot of celebrateSpots(layout).values()) {
      expect(Math.hypot(spot.x - HUB_POSITION.x, spot.z - HUB_POSITION.z)).toBeCloseTo(2.5, 5);
      expect(Math.sin(spot.heading)).toBeGreaterThan(0.5);
      expect(Math.cos(spot.heading)).toBeGreaterThan(0.5);
    }
  });
});
