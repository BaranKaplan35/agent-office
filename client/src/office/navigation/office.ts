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
import {
  ARMCHAIR,
  BOOKSHELF,
  COFFEE_CORNER,
  coffeeToWorld,
  COFFEE_STOOLS,
  PLANTS,
  PRINTER,
  SIDE_TABLE,
  SOFA,
  WATER_COOLER,
  WHITEBOARD,
} from '../props';
import { buildGrid, isWalkable, type Bounds, type Grid, type Obstacle, type Vec2 } from './grid';

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

  // lounge and utilities
  const rect = (x: number, z: number, halfW: number, halfD: number): Obstacle => ({
    kind: 'rect',
    x,
    z,
    halfW,
    halfD,
    rotationY: 0,
  });
  out.push(rect(SOFA.x, SOFA.z, SOFA.length / 2 + 0.03, SOFA.depth / 2 + 0.03));
  out.push(rect(ARMCHAIR.x, ARMCHAIR.z, ARMCHAIR.size / 2, ARMCHAIR.size / 2));
  out.push(rect(PRINTER.x, PRINTER.z, PRINTER.depth / 2 + 0.03, PRINTER.length / 2 + 0.03));
  out.push({ kind: 'circle', x: WATER_COOLER.x, z: WATER_COOLER.z, r: WATER_COOLER.radius + 0.03 });
  out.push({ kind: 'circle', x: SIDE_TABLE.x, z: SIDE_TABLE.z, r: SIDE_TABLE.radius + 0.03 });
  out.push(rect(WHITEBOARD.x, WHITEBOARD.z, WHITEBOARD.depth / 2, WHITEBOARD.width / 2 + 0.05));

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

export type SpotAction =
  | 'coffee'
  | 'window'
  | 'browse'
  | 'stretch'
  | 'stand'
  | 'phone'
  | 'water'
  | 'printer'
  | 'whiteboard'
  | 'lounge'
  | 'visit';

export interface IdleSpot {
  id: string;
  /** Where the character stands (for a seat: where it stands before sitting down). */
  x: number;
  z: number;
  /** Rotation around Y the character ends up facing. */
  heading: number;
  action: SpotAction;
  /** How long a character stays, in seconds. */
  duration: number;
  /** A seat (sofa, armchair): the character sits down here, facing `heading`. */
  sit?: Vec2;
  /** A teammate's desk: never visited by its own agent. */
  owner?: string;
}

const headingToward = (dx: number, dz: number) => Math.atan2(dx, dz);
const FACE_PLUS_X = headingToward(1, 0);
const FACE_MINUS_X = headingToward(-1, 0);

// Only the left window: a desk's chair can stand in front of the middle one, and
// the sofa sits under the right one.
const WINDOW_CENTERS = [-3.8];

/** Open floor at the front of the room, where no desk ever stands. */
const FLOOR_SPOTS: ReadonlyArray<[SpotAction, number, number, number]> = [
  ['stretch', 4.0, 3.55, 5],
  ['stretch', 1.25, 4.75, 5],
  ['phone', 4.35, 4.85, 9],
  ['phone', 4.4, -0.25, 9],
];

/**
 * Places a free-roaming character can stop, all in areas that stay free for any
 * team size: the coffee counter, a window, the bookshelf, the lounge, the printer,
 * the water cooler, the whiteboard and open floor at the front of the room. With a
 * layout, teammates' desks are added too (looking at someone's screen).
 */
export function idleSpots(layout?: OfficeLayout): IdleSpot[] {
  const spots: IdleSpot[] = [];

  for (const [i, lx] of [-0.62, 0.15].entries()) {
    const p = coffeeToWorld(lx, 1.0);
    spots.push({ id: `coffee-${i}`, ...p, heading: FACE_MINUS_X, action: 'coffee', duration: 8 });
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
      heading: FACE_MINUS_X,
      action: 'browse',
      duration: 7,
    });
  }
  FLOOR_SPOTS.forEach(([action, x, z, duration], i) => {
    spots.push({
      id: `${action}-${i}`,
      x,
      z,
      heading: headingToward(Math.SQRT1_2, Math.SQRT1_2),
      action,
      duration,
    });
  });

  // utilities along the open right edge, and the whiteboard
  spots.push({
    id: 'printer',
    x: PRINTER.x - PRINTER.depth / 2 - 0.55,
    z: PRINTER.z,
    heading: FACE_PLUS_X,
    action: 'printer',
    duration: 5,
  });
  spots.push({
    id: 'water',
    x: WATER_COOLER.x - WATER_COOLER.radius - 0.55,
    z: WATER_COOLER.z,
    heading: FACE_PLUS_X,
    action: 'water',
    duration: 7,
  });
  spots.push({
    id: 'whiteboard',
    x: WHITEBOARD.x + 0.8,
    z: WHITEBOARD.z - 0.25,
    heading: FACE_MINUS_X,
    action: 'whiteboard',
    duration: 9,
  });

  // lounge: two sofa seats and the armchair
  const sofaFront = SOFA.z + SOFA.depth / 2;
  for (const [i, dx] of [-0.5, 0.5].entries()) {
    spots.push({
      id: `sofa-${i}`,
      x: SOFA.x + dx,
      z: sofaFront + 0.5,
      sit: { x: SOFA.x + dx, z: SOFA.z + 0.08 },
      heading: headingToward(0, 1),
      action: 'lounge',
      duration: 12,
    });
  }
  spots.push({
    id: 'armchair',
    x: ARMCHAIR.x - ARMCHAIR.size / 2 - 0.5,
    z: ARMCHAIR.z,
    sit: { x: ARMCHAIR.x - 0.05, z: ARMCHAIR.z },
    heading: FACE_MINUS_X,
    action: 'lounge',
    duration: 12,
  });

  if (layout) spots.push(...visitSpots(layout));
  return spots;
}

/**
 * Standing beside a teammate's chair, looking at the screen. One per worker desk;
 * its `owner` never visits it.
 */
export function visitSpots(layout: OfficeLayout): IdleSpot[] {
  return layout.desks.map((slot): IdleSpot => {
    const stand = deskToWorld(slot, -slot.monitorSide * 0.8, CHAIR_Z + 0.5);
    const screen = deskToWorld(slot, slot.monitorSide * 0.62, -0.22);
    return {
      id: `visit-${slot.agentId}`,
      ...stand,
      heading: headingToward(screen.x - stand.x, screen.z - stand.z),
      action: 'visit',
      duration: 6,
      owner: slot.agentId,
    };
  });
}

// ------------------------------------------------------------- meeting places

export type MeetKind = 'coffee' | 'window' | 'desk' | 'lounge' | 'floor' | 'cooler';

export interface MeetSlot extends Vec2 {
  /** Facing the middle of the group. */
  heading: number;
  /** The slot is an idle spot (the coffee counter): reserve it for the chat. */
  spotId?: string;
}

export interface MeetPlace {
  id: string;
  kind: MeetKind;
  center: Vec2;
  /** Two or three places to stand, facing the centre. */
  slots: MeetSlot[];
}

const SLOT_RADIUS = 0.58;
/** Chatting characters keep this far from seats and idle spots, so they never block them. */
export const KEEP_CLEAR = 0.65;

/**
 * Where idle characters meet for a chat: in front of the coffee counter, by the
 * water cooler, at a window, in the lounge, on the open floor and beside each
 * desk. Slots that would stand on furniture, on a seat or its approach, or on an
 * idle spot are dropped; a place needs at least two slots left.
 */
export function meetPlaces(layout: OfficeLayout, grid: Grid): MeetPlace[] {
  const blocked: Vec2[] = [
    ...[layout.hub, ...layout.desks].flatMap((slot) => {
      const seat = seatFor(slot);
      return [seat, seat.approach];
    }),
    ...idleSpots(layout),
  ];

  const slotsAround = (center: Vec2, angle: number): MeetSlot[] =>
    [0, Math.PI, Math.PI / 2]
      .map((da): MeetSlot => {
        const a = angle + da;
        const p = { x: center.x + SLOT_RADIUS * cos(a), z: center.z + SLOT_RADIUS * sin(a) };
        return { ...p, heading: headingToward(center.x - p.x, center.z - p.z) };
      })
      .filter(
        (p) =>
          isWalkable(grid, p) &&
          blocked.every((b) => Math.hypot(b.x - p.x, b.z - p.z) >= KEEP_CLEAR),
      );

  /** The first candidate centre with room for at least two people wins. */
  const place = (
    id: string,
    kind: MeetKind,
    candidates: ReadonlyArray<Vec2>,
    angle: number,
  ): MeetPlace => {
    for (const center of candidates) {
      const slots = slotsAround(center, angle);
      if (slots.length >= 2) return { id, kind, center, slots };
    }
    return { id, kind, center: candidates[0] as Vec2, slots: [] };
  };

  // Two people at the counter, turned towards each other (the counter's own spots).
  const counter = idleSpots().filter((s) => s.action === 'coffee');
  const mid = {
    x: counter.reduce((sum, s) => sum + s.x, 0) / counter.length,
    z: counter.reduce((sum, s) => sum + s.z, 0) / counter.length,
  };
  const coffee: MeetPlace = {
    id: 'coffee',
    kind: 'coffee',
    center: mid,
    slots: counter.map((s) => ({
      x: s.x,
      z: s.z,
      // half towards the partner, half towards the counter
      heading: headingToward(mid.x - s.x - 1, mid.z - s.z),
      spotId: s.id,
    })),
  };

  const places = [
    coffee,
    place('cooler', 'cooler', [{ x: 4.55, z: 1.5 }], Math.PI / 4),
    place('window', 'window', [{ x: -2.6, z: -ROOM.depth / 2 + 1.3 }], 0),
    place(
      'lounge',
      'lounge',
      [
        { x: 4.2, z: -3.55 },
        { x: 3.3, z: -4.35 },
        { x: 5.2, z: -2.6 },
      ],
      0,
    ),
    place('floor', 'floor', [{ x: 2.75, z: 3.3 }], -Math.PI / 4),
    ...layout.desks.map((slot) => {
      // beside the desk's free end, the pair standing along the desk's length
      const center = deskToWorld(slot, -slot.monitorSide * 1.55, CHAIR_Z + 0.35);
      return place(`desk-${slot.agentId}`, 'desk', [center], Math.PI / 2 - slot.rotationY);
    }),
  ];
  return places.filter((p) => p.slots.length >= 2);
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
