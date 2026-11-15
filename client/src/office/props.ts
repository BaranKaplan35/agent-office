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
 * Pendant lamps. They hang high, and the first sits above the coordinator's chair rather
 * than the hub's centre: from the camera a lamp over the centre would cover the head.
 */
export const LAMPS: ReadonlyArray<{ x: number; z: number }> = [
  { x: HUB_POSITION.x - 0.9, z: HUB_POSITION.z - 0.9 },
  { x: -W / 2 + 1.7, z: 3.0 },
  { x: -W / 2 + 1.6, z: -3.4 },
];
export const LAMP_Y = 3.05;
