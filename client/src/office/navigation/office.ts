/**
 * The office's walking map (pure): which furniture blocks the floor, where each
 * agent's seat is, where idle characters like to stand, and where the team gathers
 * to celebrate. Everything derives from `layout.ts` and `props.ts`.
 */
import {
  CHAIR_Z,
  DESK,
  HUB_CHAIR_Z,
  HUB_POSITION,
  HUB_RADIUS,
  ROOM,
  type DeskSlot,
  type OfficeLayout,
} from '../layout';
import { BOOKSHELF, COFFEE_CORNER, coffeeToWorld, COFFEE_STOOLS, PLANTS } from '../props';
import { buildGrid, type Bounds, type Grid, type Obstacle, type Vec2 } from './grid';

/** Radius of a character's body; furniture is inflated by this much for walking. */
export const BODY_CLEARANCE = 0.28;
export const GRID_CELL = 0.3;
/** Keep this far from a wall; the open sides (front, right) only need to stay on the floor. */
const WALL_MARGIN = 0.5;
const EDGE_MARGIN = 0.3;

const sin = Math.sin;
const cos = Math.cos;

/** A point `lz` along a desk's local +Z, `lx` along its local +X, in world space. */
function deskToWorld(slot: DeskSlot, lx: number, lz: number): Vec2 {
  return {
    x: slot.x + lx * cos(slot.rotationY) + lz * sin(slot.rotationY),
    z: slot.z - lx * sin(slot.rotationY) + lz * cos(slot.rotationY),
  };
}

export interface Seat {
  x: number;
  z: number;
  /** Rotation around Y that makes the character face the desk. */
  heading: number;
  /** Where the character stands right behind the chair, before sitting down. */
  approach: Vec2;
}

/** Seat of a desk slot. The character sits a little behind the chair's centre. */
export function seatFor(slot: DeskSlot): Seat {
  const hub = slot.type === 'coordinator';
  const chairZ = hub ? HUB_CHAIR_Z : CHAIR_Z;
  const seat = deskToWorld(slot, 0, chairZ + 0.05);
  const approach = deskToWorld(slot, 0, chairZ + 0.85);
  return { x: seat.x, z: seat.z, heading: slot.rotationY + Math.PI, approach };
}

export function buildObstacles(layout: OfficeLayout): Obstacle[] {
  const out: Obstacle[] = [];

  for (const slot of layout.desks) {
    out.push({
      kind: 'rect',
      x: slot.x,
      z: slot.z,
      halfW: DESK.width / 2 + 0.05,
      halfD: DESK.depth / 2 + 0.05,
      rotationY: slot.rotationY,
    });
    const chair = deskToWorld(slot, 0, CHAIR_Z);
    out.push({ kind: 'circle', x: chair.x, z: chair.z, r: 0.36 });
  }

  const hub = layout.hub;
  out.push({ kind: 'circle', x: hub.x, z: hub.z, r: HUB_RADIUS + 0.05 });
  const hubChair = deskToWorld(hub, 0, HUB_CHAIR_Z);
  out.push({ kind: 'circle', x: hubChair.x, z: hubChair.z, r: 0.36 });

  out.push({
    kind: 'rect',
    x: BOOKSHELF.x,
    z: BOOKSHELF.z,
    halfW: BOOKSHELF.depth / 2 + 0.03,
    halfD: BOOKSHELF.length / 2,
    rotationY: 0,
  });
  out.push({
    kind: 'rect',
    x: COFFEE_CORNER.x,
    z: COFFEE_CORNER.z,
    halfW: COFFEE_CORNER.depth / 2 + 0.05,
    halfD: COFFEE_CORNER.length / 2 + 0.03,
    rotationY: 0,
  });
  for (const stool of COFFEE_STOOLS) {
    const p = coffeeToWorld(stool.lx, stool.lz);
    out.push({ kind: 'circle', x: p.x, z: p.z, r: 0.24 });
  }
  for (const plant of PLANTS) out.push({ kind: 'circle', x: plant.x, z: plant.z, r: plant.radius });

  return out;
}

export function floorBounds(): Bounds {
  return {
    minX: -ROOM.width / 2 + WALL_MARGIN,
    maxX: ROOM.width / 2 - EDGE_MARGIN,
    minZ: -ROOM.depth / 2 + WALL_MARGIN,
    maxZ: ROOM.depth / 2 - EDGE_MARGIN,
  };
}

export function buildOfficeGrid(layout: OfficeLayout): Grid {
  return buildGrid(floorBounds(), GRID_CELL, buildObstacles(layout), BODY_CLEARANCE);
}

// ------------------------------------------------------------------ idle spots

export type SpotAction = 'coffee' | 'window' | 'browse' | 'stretch' | 'stand';

export interface IdleSpot {
  id: string;
  x: number;
  z: number;
  /** Rotation around Y the character ends up facing. */
  heading: number;
  action: SpotAction;
  /** How long a character stays, in seconds. */
  duration: number;
}

const headingToward = (dx: number, dz: number) => Math.atan2(dx, dz);

// The middle window is left out: a desk's chair can stand right in front of it.
const WINDOW_CENTERS = [-3.8, 4.2];

/**
 * Places a free-roaming character can stop, all in areas that stay free for any
 * team size: the coffee counter, the windows, the bookshelf and open floor at the
 * front of the room (the desk arc never reaches it).
 */
export function idleSpots(): IdleSpot[] {
  const spots: IdleSpot[] = [];

  for (const [i, lx] of [-0.62, 0.15].entries()) {
    const p = coffeeToWorld(lx, 1.0);
    spots.push({
      id: `coffee-${i}`,
      ...p,
      heading: headingToward(-1, 0),
      action: 'coffee',
      duration: 8,
    });
  }
  for (const [i, cx] of WINDOW_CENTERS.entries()) {
    spots.push({
      id: `window-${i}`,
      x: cx,
      z: -ROOM.depth / 2 + 0.8,
      heading: headingToward(0, -1),
      action: 'window',
      duration: 9,
    });
  }
  for (const [i, z] of [-3.95, -2.85].entries()) {
    spots.push({
      id: `browse-${i}`,
      x: BOOKSHELF.x + 0.95,
      z,
      heading: headingToward(-1, 0),
      action: 'browse',
      duration: 7,
    });
  }
  // open floor on the camera side of the hub, where no desk ever stands
  for (const [i, deg] of [10, 45, 80].entries()) {
    const a = (deg * Math.PI) / 180;
    spots.push({
      id: `stretch-${i}`,
      x: HUB_POSITION.x + 3.9 * cos(a),
      z: HUB_POSITION.z + 3.9 * sin(a),
      heading: headingToward(cos(a), sin(a)),
      action: 'stretch',
      duration: 5,
    });
  }
  return spots;
}

// ------------------------------------------------------------ celebration spots

const CELEBRATE_RADIUS = 2.5;

export interface CelebrateSpot {
  x: number;
  z: number;
  /** Everyone faces the camera while celebrating. */
  heading: number;
}

/** Where each agent gathers on the rug when the whole task is approved. */
export function celebrateSpots(layout: OfficeLayout): Map<string, CelebrateSpot> {
  const toCamera = headingToward(Math.SQRT1_2, Math.SQRT1_2);
  const at = (angle: number): CelebrateSpot => ({
    x: HUB_POSITION.x + CELEBRATE_RADIUS * cos(angle),
    z: HUB_POSITION.z + CELEBRATE_RADIUS * sin(angle),
    heading: toCamera,
  });
  const map = new Map<string, CelebrateSpot>();
  map.set(layout.hub.agentId, at(Math.PI / 4));
  for (const desk of layout.desks) {
    map.set(desk.agentId, at(Math.atan2(desk.z - HUB_POSITION.z, desk.x - HUB_POSITION.x)));
  }
  return map;
}
