import { describe, expect, it } from 'vitest';
import { buildLayout, HUB_POSITION, type AgentRef } from '../layout';
import { findPath, isWalkable, lineOfSight, type Vec2 } from './grid';
import { buildOfficeGrid, celebrateSpots, idleSpots, seatFor } from './office';

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

  it('every idle spot is free floor', () => {
    for (const spot of idleSpots()) {
      expect(isWalkable(grid, spot), spot.id).toBe(true);
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

  it('any seat can reach any spot and any spot any seat (no closed-off areas)', () => {
    const stops: Array<[string, Vec2]> = [
      ...slots.map((s): [string, Vec2] => [`seat ${s.agentId}`, seatFor(s).approach]),
      ...idleSpots().map((s): [string, Vec2] => [s.id, s]),
      ...[...celebrateSpots(layout).entries()].map(([id, s]): [string, Vec2] => [
        `celebrate ${id}`,
        s,
      ]),
    ];
    for (const [fromName, from] of stops) {
      for (const [toName, to] of stops) {
        if (fromName === toName) continue;
        const path = findPath(grid, from, to);
        expect(path, `${fromName} → ${toName}`).not.toBeNull();
        let prev = from;
        for (const p of path!) {
          expect(lineOfSight(grid, prev, p), `${fromName} → ${toName} segment`).toBe(true);
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
