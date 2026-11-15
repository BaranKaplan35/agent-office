/**
 * Hub-and-spoke office layout (pure; no Three.js).
 *
 * The coordinator sits at a round hub desk near the middle of the room, the
 * workers' desks stand on an arc around it, all facing the hub. The arc is
 * centred on the room's back corner, so the open front of the room (towards
 * the camera) stays free and every desk is visible.
 *
 * Coordinates: X to the right-front, Z to the left-front (the camera looks from
 * +X/+Z towards the back corner at -X/-Z), Y up, floor at y = 0.
 * A desk's local +Z axis points to the chair side, so `rotationY` makes the
 * worker (sitting at +Z) look at the hub.
 */

export const ROOM = {
  width: 13, // along X
  depth: 11, // along Z
  wallHeight: 3.4,
  wallThickness: 0.35,
  floorSlab: 0.6,
} as const;

export const DESK = { width: 2, depth: 1, chairOffset: 0.95 } as const;
export const HUB_POSITION = { x: 0.6, z: 0.2 } as const;
export const HUB_RADIUS = 1.35;

const ARC_RADIUS = 3.9;
const ARC_STEP = (45 * Math.PI) / 180;
/** Direction from the hub to the room's back corner (-X, -Z). */
const BACK_ANGLE = (-135 * Math.PI) / 180;
/** Horizontal unit vector from the scene towards the camera. */
const TO_CAMERA = [Math.SQRT1_2, Math.SQRT1_2] as const;
/** How far a worker's monitor is turned towards the worker, in radians. */
export const MONITOR_YAW = 0.55;

export interface AgentRef {
  id: string;
  type: 'coordinator' | 'worker';
}

export interface DeskSlot {
  agentId: string;
  type: AgentRef['type'];
  x: number;
  z: number;
  /** Rotation around Y; the chair side (local +Z) points away from the hub. */
  rotationY: number;
  /** Side of the desk (local X sign) where the monitor stands, so its screen is visible. */
  monitorSide: 1 | -1;
}

export interface OfficeLayout {
  hub: DeskSlot;
  /** Workers in config order, left-to-right along the arc. */
  desks: DeskSlot[];
}

/** Rotation that makes a desk's chair side point along (dx, dz). */
export function rotationFacingAwayFrom(dx: number, dz: number): number {
  return Math.atan2(dx, dz);
}

/** World-space horizontal direction a seated agent looks at (local -Z). */
export function lookDirection(rotationY: number): [number, number] {
  return [-Math.sin(rotationY), -Math.cos(rotationY)];
}

/** Pick the monitor side whose (turned) screen faces the camera best. */
export function monitorSideFor(rotationY: number): 1 | -1 {
  const score = (side: 1 | -1) => {
    const yaw = rotationY - side * MONITOR_YAW;
    return Math.sin(yaw) * TO_CAMERA[0] + Math.cos(yaw) * TO_CAMERA[1];
  };
  return score(1) >= score(-1) ? 1 : -1;
}

export function buildLayout(agents: ReadonlyArray<AgentRef>): OfficeLayout {
  const coordinators = agents.filter((a) => a.type === 'coordinator');
  if (coordinators.length !== 1) {
    throw new RangeError(`An office needs exactly one coordinator (found ${coordinators.length})`);
  }
  const workers = agents.filter((a) => a.type === 'worker');

  const hubRotation = rotationFacingAwayFrom(Math.cos(BACK_ANGLE), Math.sin(BACK_ANGLE));
  const hub: DeskSlot = {
    agentId: (coordinators[0] as AgentRef).id,
    type: 'coordinator',
    x: HUB_POSITION.x,
    z: HUB_POSITION.z,
    rotationY: hubRotation,
    monitorSide: monitorSideFor(hubRotation),
  };

  const desks = workers.map((worker, i): DeskSlot => {
    const angle = BACK_ANGLE + (i - (workers.length - 1) / 2) * ARC_STEP;
    const dx = Math.cos(angle);
    const dz = Math.sin(angle);
    const rotationY = rotationFacingAwayFrom(dx, dz);
    return {
      agentId: worker.id,
      type: 'worker',
      x: HUB_POSITION.x + ARC_RADIUS * dx,
      z: HUB_POSITION.z + ARC_RADIUS * dz,
      rotationY,
      monitorSide: monitorSideFor(rotationY),
    };
  });

  return { hub, desks };
}

/** The 8 corners of the room's bounding box (used to frame the camera). */
export function roomCorners(): Array<[number, number, number]> {
  const t = ROOM.wallThickness;
  const xs = [-ROOM.width / 2 - t, ROOM.width / 2];
  const ys = [-ROOM.floorSlab, ROOM.wallHeight + 0.35];
  const zs = [-ROOM.depth / 2 - t, ROOM.depth / 2];
  return xs.flatMap((x) => ys.flatMap((y) => zs.map((z): [number, number, number] => [x, y, z])));
}
