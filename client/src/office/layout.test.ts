import { describe, expect, it } from 'vitest';
import {
  buildLayout,
  DESK,
  HUB_POSITION,
  HUB_RADIUS,
  lookDirection,
  monitorSideFor,
  ROOM,
  roomCorners,
  type AgentRef,
} from './layout';

const team = (workers: number): AgentRef[] => [
  { id: 'lead', type: 'coordinator' },
  ...Array.from({ length: workers }, (_, i): AgentRef => ({ id: `w${i + 1}`, type: 'worker' })),
];

const dist = (a: { x: number; z: number }, b: { x: number; z: number }) =>
  Math.hypot(a.x - b.x, a.z - b.z);

describe('buildLayout', () => {
  it.each([2, 3, 4, 5])('places the coordinator and %i workers inside the room', (n) => {
    const layout = buildLayout(team(n));
    expect(layout.desks).toHaveLength(n);
    expect(layout.hub.agentId).toBe('lead');
    expect(layout.desks.map((d) => d.agentId)).toEqual(
      team(n)
        .slice(1)
        .map((a) => a.id),
    );

    const marginX = ROOM.width / 2 - DESK.width / 2 - 0.4;
    const marginZ = ROOM.depth / 2 - DESK.width / 2 - 0.4;
    for (const d of layout.desks) {
      expect(Math.abs(d.x)).toBeLessThanOrEqual(marginX);
      expect(Math.abs(d.z)).toBeLessThanOrEqual(marginZ);
    }
  });

  it.each([2, 3, 4, 5])('keeps desks apart from each other and from the hub (%i workers)', (n) => {
    const { hub, desks } = buildLayout(team(n));
    for (const d of desks) expect(dist(d, hub)).toBeGreaterThan(HUB_RADIUS + DESK.depth + 0.5);
    for (let i = 0; i < desks.length; i++) {
      for (let j = i + 1; j < desks.length; j++) {
        expect(dist(desks[i]!, desks[j]!)).toBeGreaterThanOrEqual(DESK.width + 0.5);
      }
    }
  });

  it('makes every worker look at the hub', () => {
    for (const d of buildLayout(team(5)).desks) {
      const [lx, lz] = lookDirection(d.rotationY);
      const toHubX = HUB_POSITION.x - d.x;
      const toHubZ = HUB_POSITION.z - d.z;
      const len = Math.hypot(toHubX, toHubZ);
      expect(lx * (toHubX / len) + lz * (toHubZ / len)).toBeCloseTo(1, 5);
    }
  });

  it('is mirror-symmetric around the back corner direction', () => {
    const { desks } = buildLayout(team(4));
    const [a, b, c, d] = desks as [
      (typeof desks)[0],
      (typeof desks)[0],
      (typeof desks)[0],
      (typeof desks)[0],
    ];
    // Mirroring across the x = z diagonal through the hub swaps x and z offsets.
    for (const [p, q] of [
      [a, d],
      [b, c],
    ] as const) {
      expect(p.x - HUB_POSITION.x).toBeCloseTo(q.z - HUB_POSITION.z, 5);
      expect(p.z - HUB_POSITION.z).toBeCloseTo(q.x - HUB_POSITION.x, 5);
    }
  });

  it('seats the coordinator facing the camera side', () => {
    const [lx, lz] = lookDirection(buildLayout(team(3)).hub.rotationY);
    expect(lx).toBeGreaterThan(0.5);
    expect(lz).toBeGreaterThan(0.5);
  });

  it('puts the monitor on the side whose screen faces the camera better', () => {
    for (let deg = -180; deg < 180; deg += 15) {
      const rot = (deg * Math.PI) / 180;
      const side = monitorSideFor(rot);
      expect([1, -1]).toContain(side);
      // The other side must not score strictly better.
      const other = (side === 1 ? -1 : 1) as 1 | -1;
      const score = (s: 1 | -1) => {
        const yaw = rot - s * 0.55;
        return (Math.sin(yaw) + Math.cos(yaw)) * Math.SQRT1_2;
      };
      expect(score(side)).toBeGreaterThanOrEqual(score(other) - 1e-9);
    }
  });

  it('rejects teams without exactly one coordinator', () => {
    expect(() => buildLayout([{ id: 'a', type: 'worker' }])).toThrow(RangeError);
    expect(() =>
      buildLayout([
        { id: 'a', type: 'coordinator' },
        { id: 'b', type: 'coordinator' },
      ]),
    ).toThrow(/exactly one coordinator/);
  });

  it('roomCorners returns the 8 corners of the room box', () => {
    const corners = roomCorners();
    expect(corners).toHaveLength(8);
    expect(new Set(corners.map((c) => c.join(','))).size).toBe(8);
  });
});
