/**
 * Fixed furniture placements, shared by the 3D scene (what to draw) and by the
 * navigation layer (what characters must walk around). Pure data.
 */
import { HUB_POSITION, ROOM } from './layout';

const { width: W, depth: D } = ROOM;

/** Bookshelf against the left (-X) wall. `length` runs along Z. */
export const BOOKSHELF = { x: -W / 2 + 0.27, z: -3.4, length: 2.4, depth: 0.5 } as const;

/** Coffee counter against the left wall. `length` runs along Z. */
export const COFFEE_CORNER = { x: -W / 2 + 0.38, z: 3.0, length: 2.4, depth: 0.7 } as const;

/**
 * Convert a position in the coffee corner's local frame (it is rotated a quarter
 * turn: local +Z points into the room, local +X points along -Z) to world X/Z.
 */
export function coffeeToWorld(lx: number, lz: number): { x: number; z: number } {
  return { x: COFFEE_CORNER.x + lz, z: COFFEE_CORNER.z - lx };
}

/** Stools at both ends of the counter (local frame). */
export const COFFEE_STOOLS = [
  { lx: -1.45, lz: 0.95 },
  { lx: 1.45, lz: 0.95 },
] as const;

// ---------------------------------------------------------- lounge and utilities
// The front and right floor (the open sides of the cutaway) hold the shared spots.

/** Sofa against the window wall, under the right-hand window; it faces +Z. */
export const SOFA = { x: 4.85, z: -D / 2 + 0.55, length: 2.1, depth: 0.85 } as const;
/** Armchair at the open right edge, facing the sofa side (-X). */
export const ARMCHAIR = { x: W / 2 - 0.6, z: -3.55, size: 0.9 } as const;
/** Small round side table between the sofa and the armchair. */
export const SIDE_TABLE = { x: W / 2 - 0.42, z: -4.8, radius: 0.24 } as const;
/** Rug under the lounge. */
export const LOUNGE_RUG = { x: 5.0, z: -4.45, width: 3.2, depth: 2.3 } as const;
/** Printer on a low cabinet at the right edge, facing -X. `length` runs along Z. */
export const PRINTER = { x: W / 2 - 0.55, z: 0.75, length: 0.95, depth: 0.62 } as const;
/** Water cooler at the right edge, facing -X. */
export const WATER_COOLER = { x: W / 2 - 0.5, z: 2.25, radius: 0.3 } as const;
/**
 * Whiteboard on a rolling stand near the front edge. Its writing side faces +X, so
 * the camera sees it at an angle; `width` runs along Z.
 */
export const WHITEBOARD = { x: 2.55, z: 5.05, width: 1.6, depth: 0.5 } as const;

export type PlantKind = 'tall' | 'bush';

export const PLANTS: ReadonlyArray<{
  kind: PlantKind;
  x: number;
  z: number;
  scale: number;
  /** Footprint radius (for walking around it). */
  radius: number;
}> = [
  { kind: 'tall', x: -W / 2 + 0.6, z: -D / 2 + 0.6, scale: 1.15, radius: 0.45 },
  { kind: 'bush', x: 3.3, z: -D / 2 + 0.6, scale: 0.95, radius: 0.5 },
  { kind: 'bush', x: -W / 2 + 0.7, z: 0.6, scale: 0.8, radius: 0.42 },
  { kind: 'tall', x: W / 2 - 0.8, z: -1.2, scale: 1, radius: 0.4 },
  { kind: 'bush', x: W / 2 - 0.8, z: 4.0, scale: 0.9, radius: 0.48 },
];

/**
 * Pendant lamps, hanging from the (invisible) ceiling. None hangs in the screen
 * column of a desk bubble at the default view (checked in `props.test.ts`): the one
 * near the hub hangs in front of it, over the coordinator's chair side.
 * The first `lampLights` of them (per quality level) also light the room.
 */
export const LAMPS: ReadonlyArray<{ x: number; z: number }> = [
  { x: HUB_POSITION.x + 1.5, z: HUB_POSITION.z + 0.9 },
  { x: -W / 2 + 1.7, z: 3.0 },
  { x: LOUNGE_RUG.x, z: LOUNGE_RUG.z + 0.2 },
  { x: -W / 2 + 1.6, z: -3.4 },
];
export const LAMP_Y = 3.05;
/** Where the cords end: the top of the shadow box that closes the room. */
export const CEILING_Y = ROOM.wallHeight + 0.2;
