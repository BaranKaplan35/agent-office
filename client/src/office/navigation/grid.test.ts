import { describe, expect, it } from 'vitest';
import {
  buildGrid,
  findPath,
  insideObstacle,
  isWalkable,
  lineOfSight,
  pathLength,
  type Obstacle,
  type Vec2,
} from './grid';

const bounds = { minX: -5, maxX: 5, minZ: -5, maxZ: 5 };
const build = (obstacles: Obstacle[], clearance = 0.2) =>
  buildGrid(bounds, 0.25, obstacles, clearance);

/** A long wall across the middle with a gap at the right end. */
const wall: Obstacle = { kind: 'rect', x: -1.5, z: 0, halfW: 3.4, halfD: 0.2, rotationY: 0 };

/** Every point along the route must be walkable. */
function walkable(grid: ReturnType<typeof build>, from: Vec2, path: Vec2[]): boolean {
  let prev = from;
  for (const p of path) {
    if (!lineOfSight(grid, prev, p)) return false;
    prev = p;
  }
  return true;
}

describe('insideObstacle', () => {
  it('tests circles', () => {
    const o: Obstacle = { kind: 'circle', x: 1, z: 1, r: 0.5 };
    expect(insideObstacle(o, { x: 1.3, z: 1 })).toBe(true);
    expect(insideObstacle(o, { x: 1.6, z: 1 })).toBe(false);
    expect(insideObstacle(o, { x: 1.6, z: 1 }, 0.2)).toBe(true);
  });

  it('tests rotated rectangles in their local frame', () => {
    const o: Obstacle = { kind: 'rect', x: 0, z: 0, halfW: 1, halfD: 0.5, rotationY: Math.PI / 2 };
    // turned a quarter: the long side now runs along world Z
    expect(insideObstacle(o, { x: 0, z: 0.9 })).toBe(true);
    expect(insideObstacle(o, { x: 0.9, z: 0 })).toBe(false);
    expect(insideObstacle(o, { x: 0.4, z: 0.9 })).toBe(true);
  });
});

describe('findPath', () => {
  it('walks straight when nothing is in the way', () => {
    const grid = build([]);
    expect(findPath(grid, { x: -3, z: -3 }, { x: 3, z: 3 })).toEqual([{ x: 3, z: 3 }]);
  });

  it('walks around an obstacle without touching it', () => {
    const grid = build([wall]);
    const from = { x: -3, z: -3 };
    const to = { x: -3, z: 3 };
    const path = findPath(grid, from, to);
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(1);
    expect(walkable(grid, from, path!)).toBe(true);
    // detour is longer than the blocked straight line but not absurdly so
    const straight = Math.hypot(to.x - from.x, to.z - from.z);
    expect(pathLength(from, path!)).toBeGreaterThan(straight);
    expect(pathLength(from, path!)).toBeLessThan(straight * 3);
  });

  it('returns null when the goal is walled off', () => {
    // four walls around a pocket in the middle
    const pocket = buildGrid(
      bounds,
      0.25,
      [
        { kind: 'rect', x: 0, z: -2, halfW: 2.5, halfD: 0.3, rotationY: 0 },
        { kind: 'rect', x: 0, z: 2, halfW: 2.5, halfD: 0.3, rotationY: 0 },
        { kind: 'rect', x: -2, z: 0, halfW: 0.3, halfD: 2.5, rotationY: 0 },
        { kind: 'rect', x: 2, z: 0, halfW: 0.3, halfD: 2.5, rotationY: 0 },
      ],
      0,
    );
    expect(findPath(pocket, { x: 0, z: 0 }, { x: 4, z: 4 })).toBeNull();
  });

  it('moves a goal inside furniture to the nearest free spot', () => {
    const grid = build([wall]);
    const path = findPath(grid, { x: 0, z: -3 }, { x: -1.5, z: 0 });
    expect(path).not.toBeNull();
    const end = path![path!.length - 1]!;
    expect(isWalkable(grid, end)).toBe(true);
    expect(Math.hypot(end.x + 1.5, end.z)).toBeLessThan(1);
  });

  it('can start from inside furniture (it steps out first)', () => {
    const grid = build([wall]);
    const path = findPath(grid, { x: -1.5, z: 0 }, { x: 3, z: 3 });
    expect(path).not.toBeNull();
    expect(isWalkable(grid, path![path!.length - 1]!)).toBe(true);
  });

  it('never cuts across blocked corners', () => {
    const pillar: Obstacle = { kind: 'circle', x: 0, z: 0, r: 0.6 };
    const grid = build([pillar], 0.1);
    const from = { x: -2, z: -2 };
    const path = findPath(grid, from, { x: 2, z: 2 })!;
    expect(walkable(grid, from, path)).toBe(true);
    expect(path.length).toBeGreaterThan(1);
  });
});

describe('buildGrid', () => {
  it('blocks cells outside the bounds and inside obstacles', () => {
    const grid = build([{ kind: 'circle', x: 0, z: 0, r: 1 }]);
    expect(isWalkable(grid, { x: 0, z: 0 })).toBe(false);
    expect(isWalkable(grid, { x: 3, z: 3 })).toBe(true);
    expect(isWalkable(grid, { x: 9, z: 0 })).toBe(false);
  });

  it('clearance keeps a body-width gap from furniture', () => {
    const close = build([{ kind: 'circle', x: 0, z: 0, r: 1 }], 0.5);
    expect(isWalkable(close, { x: 1.3, z: 0 })).toBe(false);
    expect(isWalkable(close, { x: 1.75, z: 0 })).toBe(true);
  });
});
