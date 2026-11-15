/**
 * Walking navigation (pure). The floor is a grid of cells; cells inside furniture
 * (plus a body-radius clearance) are blocked; A* finds a route and a line-of-sight
 * pass pulls it straight, so characters walk in smooth segments, not cell by cell.
 */

export interface Vec2 {
  x: number;
  z: number;
}

export type Obstacle =
  | { kind: 'circle'; x: number; z: number; r: number }
  | {
      kind: 'rect';
      x: number;
      z: number;
      halfW: number;
      halfD: number;
      /** Rotation around Y, same convention as the 3D groups. */
      rotationY: number;
    };

export interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

export interface Grid {
  cell: number;
  minX: number;
  minZ: number;
  cols: number;
  rows: number;
  /** 1 = blocked. Cell (c, r) is centred at (minX + c·cell, minZ + r·cell). */
  blocked: Uint8Array;
}

export function insideObstacle(o: Obstacle, p: Vec2, margin = 0): boolean {
  if (o.kind === 'circle') return Math.hypot(p.x - o.x, p.z - o.z) <= o.r + margin;
  const dx = p.x - o.x;
  const dz = p.z - o.z;
  const c = Math.cos(o.rotationY);
  const s = Math.sin(o.rotationY);
  // world → the rectangle's local frame (inverse of the group's Y rotation)
  const lx = dx * c - dz * s;
  const lz = dx * s + dz * c;
  return Math.abs(lx) <= o.halfW + margin && Math.abs(lz) <= o.halfD + margin;
}

export function buildGrid(
  bounds: Bounds,
  cell: number,
  obstacles: ReadonlyArray<Obstacle>,
  clearance: number,
): Grid {
  const cols = Math.floor((bounds.maxX - bounds.minX) / cell) + 1;
  const rows = Math.floor((bounds.maxZ - bounds.minZ) / cell) + 1;
  const blocked = new Uint8Array(cols * rows);
  for (let r = 0; r < rows; r++) {
    for (let c = 0; c < cols; c++) {
      const p = { x: bounds.minX + c * cell, z: bounds.minZ + r * cell };
      if (obstacles.some((o) => insideObstacle(o, p, clearance))) blocked[r * cols + c] = 1;
    }
  }
  return { cell, minX: bounds.minX, minZ: bounds.minZ, cols, rows, blocked };
}

const index = (grid: Grid, c: number, r: number) => r * grid.cols + c;
const inRange = (grid: Grid, c: number, r: number) =>
  c >= 0 && r >= 0 && c < grid.cols && r < grid.rows;

export function cellOf(grid: Grid, p: Vec2): [number, number] {
  return [Math.round((p.x - grid.minX) / grid.cell), Math.round((p.z - grid.minZ) / grid.cell)];
}

export function cellCenter(grid: Grid, c: number, r: number): Vec2 {
  return { x: grid.minX + c * grid.cell, z: grid.minZ + r * grid.cell };
}

export function isWalkable(grid: Grid, p: Vec2): boolean {
  const [c, r] = cellOf(grid, p);
  return inRange(grid, c, r) && grid.blocked[index(grid, c, r)] === 0;
}

/** Can a character walk the straight segment a → b without touching anything? */
export function lineOfSight(grid: Grid, a: Vec2, b: Vec2): boolean {
  const length = Math.hypot(b.x - a.x, b.z - a.z);
  const steps = Math.max(1, Math.ceil(length / (grid.cell * 0.4)));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    if (!isWalkable(grid, { x: a.x + (b.x - a.x) * t, z: a.z + (b.z - a.z) * t })) return false;
  }
  return true;
}

/** The nearest walkable cell to `p` (itself if free), or null when the grid has none nearby. */
function nearestWalkable(grid: Grid, p: Vec2): [number, number] | null {
  const [c0, r0] = cellOf(grid, p);
  const free = (c: number, r: number) =>
    inRange(grid, c, r) && grid.blocked[index(grid, c, r)] === 0;
  if (free(c0, r0)) return [c0, r0];
  let best: [number, number] | null = null;
  let bestDist = Infinity;
  for (let radius = 1; radius <= 10 && best === null; radius++) {
    for (let dr = -radius; dr <= radius; dr++) {
      for (let dc = -radius; dc <= radius; dc++) {
        if (Math.max(Math.abs(dc), Math.abs(dr)) !== radius) continue;
        if (!free(c0 + dc, r0 + dr)) continue;
        const d = dc * dc + dr * dr;
        if (d < bestDist) {
          bestDist = d;
          best = [c0 + dc, r0 + dr];
        }
      }
    }
  }
  return best;
}

const SQRT2 = Math.SQRT2;
const NEIGHBOURS: ReadonlyArray<readonly [number, number, number]> = [
  [1, 0, 1],
  [-1, 0, 1],
  [0, 1, 1],
  [0, -1, 1],
  [1, 1, SQRT2],
  [1, -1, SQRT2],
  [-1, 1, SQRT2],
  [-1, -1, SQRT2],
];

/** A* over the grid; returns the cell indices from start to goal, or null. */
function astar(grid: Grid, start: number, goal: number): number[] | null {
  const n = grid.cols * grid.rows;
  const g = new Float64Array(n).fill(Infinity);
  const parent = new Int32Array(n).fill(-1);
  const closed = new Uint8Array(n);
  const gc = goal % grid.cols;
  const gr = Math.floor(goal / grid.cols);
  const h = (i: number) => {
    const dc = Math.abs((i % grid.cols) - gc);
    const dr = Math.abs(Math.floor(i / grid.cols) - gr);
    return Math.max(dc, dr) + (SQRT2 - 1) * Math.min(dc, dr);
  };

  // a plain binary min-heap of [f, index]
  const heap: Array<[number, number]> = [];
  const push = (f: number, i: number) => {
    heap.push([f, i]);
    let k = heap.length - 1;
    while (k > 0) {
      const up = (k - 1) >> 1;
      if ((heap[up] as [number, number])[0] <= (heap[k] as [number, number])[0]) break;
      [heap[up], heap[k]] = [heap[k] as [number, number], heap[up] as [number, number]];
      k = up;
    }
  };
  const pop = (): number => {
    const top = heap[0] as [number, number];
    const last = heap.pop() as [number, number];
    if (heap.length > 0) {
      heap[0] = last;
      let k = 0;
      for (;;) {
        const l = 2 * k + 1;
        const r = l + 1;
        let m = k;
        if (l < heap.length && (heap[l] as [number, number])[0] < (heap[m] as [number, number])[0])
          m = l;
        if (r < heap.length && (heap[r] as [number, number])[0] < (heap[m] as [number, number])[0])
          m = r;
        if (m === k) break;
        [heap[m], heap[k]] = [heap[k] as [number, number], heap[m] as [number, number]];
        k = m;
      }
    }
    return top[1];
  };

  g[start] = 0;
  push(h(start), start);
  while (heap.length > 0) {
    const current = pop();
    if (closed[current]) continue;
    closed[current] = 1;
    if (current === goal) {
      const path: number[] = [];
      for (let i = goal; i !== -1; i = parent[i] as number) path.push(i);
      return path.reverse();
    }
    const c = current % grid.cols;
    const r = Math.floor(current / grid.cols);
    for (const [dc, dr, cost] of NEIGHBOURS) {
      const nc = c + dc;
      const nr = r + dr;
      if (!inRange(grid, nc, nr) || grid.blocked[index(grid, nc, nr)] === 1) continue;
      // no cutting corners around obstacles
      if (dc !== 0 && dr !== 0) {
        if (
          grid.blocked[index(grid, c + dc, r)] === 1 ||
          grid.blocked[index(grid, c, r + dr)] === 1
        )
          continue;
      }
      const ni = index(grid, nc, nr);
      const tentative = (g[current] as number) + cost;
      if (tentative < (g[ni] as number)) {
        g[ni] = tentative;
        parent[ni] = current;
        push(tentative + h(ni), ni);
      }
    }
  }
  return null;
}

/** Remove waypoints that a straight walk can skip. */
export function simplifyPath(grid: Grid, points: ReadonlyArray<Vec2>): Vec2[] {
  if (points.length <= 2) return points.slice(1);
  const out: Vec2[] = [];
  let i = 0;
  while (i < points.length - 1) {
    let j = points.length - 1;
    while (j > i + 1 && !lineOfSight(grid, points[i] as Vec2, points[j] as Vec2)) j--;
    out.push(points[j] as Vec2);
    i = j;
  }
  return out;
}

/**
 * Waypoints to walk from `from` to `to` (excluding `from`), or null when there is
 * no route. Points inside furniture are moved to the nearest free spot.
 */
export function findPath(grid: Grid, from: Vec2, to: Vec2): Vec2[] | null {
  const start = nearestWalkable(grid, from);
  const goal = nearestWalkable(grid, to);
  if (!start || !goal) return null;
  const cells = astar(grid, index(grid, start[0], start[1]), index(grid, goal[0], goal[1]));
  if (!cells) return null;

  const centers = cells.map((i) => cellCenter(grid, i % grid.cols, Math.floor(i / grid.cols)));
  const end = isWalkable(grid, to) ? to : (centers[centers.length - 1] as Vec2);
  const points: Vec2[] = [from, ...centers.slice(1, -1), end];
  const waypoints = simplifyPath(grid, points);
  return waypoints.length > 0 ? waypoints : [end];
}

export function pathLength(from: Vec2, path: ReadonlyArray<Vec2>): number {
  let total = 0;
  let prev = from;
  for (const p of path) {
    total += Math.hypot(p.x - prev.x, p.z - prev.z);
    prev = p;
  }
  return total;
}
