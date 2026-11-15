/**
 * Isometric camera maths (pure). The scene uses an orthographic camera looking
 * at the room from the front corner; `fitCamera` picks the zoom and target so
 * the whole room fits the canvas at any size.
 */

export type Vec3 = [number, number, number];

/** True isometric: 45° around, ~55° from the vertical (≈ 35° above the horizon). */
export const ISO = { azimuthDeg: 45, polarDeg: 55 } as const;

const rad = (deg: number) => (deg * Math.PI) / 180;
const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a: Vec3, b: Vec3): Vec3 => [
  a[1] * b[2] - a[2] * b[1],
  a[2] * b[0] - a[0] * b[2],
  a[0] * b[1] - a[1] * b[0],
];
const normalize = (v: Vec3): Vec3 => {
  const len = Math.hypot(...v);
  return [v[0] / len, v[1] / len, v[2] / len];
};

/** Unit vector from the target towards the camera. */
export function isoDirection(
  azimuthDeg: number = ISO.azimuthDeg,
  polarDeg: number = ISO.polarDeg,
): Vec3 {
  const az = rad(azimuthDeg);
  const polar = rad(polarDeg);
  return [Math.sin(polar) * Math.sin(az), Math.cos(polar), Math.sin(polar) * Math.cos(az)];
}

/** Screen-space axes of a camera looking along `-direction` with +Y up. */
export function cameraBasis(direction: Vec3): { right: Vec3; up: Vec3 } {
  const forward: Vec3 = [-direction[0], -direction[1], -direction[2]];
  const right = normalize(cross(forward, [0, 1, 0]));
  const up = normalize(cross(right, forward));
  return { right, up };
}

export interface FitInput {
  corners: ReadonlyArray<Vec3>;
  direction: Vec3;
  /** Canvas size in CSS pixels. */
  viewport: { width: number; height: number };
  /** Empty border around the content, as a fraction of the viewport (0–0.4). */
  margin?: number;
}

export interface FitResult {
  /** Pixels per world unit (what an orthographic camera's `zoom` means in R3F). */
  zoom: number;
  /** Point the camera looks at. */
  target: Vec3;
}

export function fitCamera({ corners, direction, viewport, margin = 0.06 }: FitInput): FitResult {
  const { right, up } = cameraBasis(direction);
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const corner of corners) {
    const x = dot(corner, right);
    const y = dot(corner, up);
    minX = Math.min(minX, x);
    maxX = Math.max(maxX, x);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const extentX = Math.max(maxX - minX, 1e-6);
  const extentY = Math.max(maxY - minY, 1e-6);
  const usable = 1 - Math.min(Math.max(margin, 0), 0.4) * 2;
  const zoom = Math.max(
    1,
    Math.min((viewport.width * usable) / extentX, (viewport.height * usable) / extentY),
  );

  const cx = (minX + maxX) / 2;
  const cy = (minY + maxY) / 2;
  const target: Vec3 = [
    right[0] * cx + up[0] * cy,
    right[1] * cx + up[1] * cy,
    right[2] * cx + up[2] * cy,
  ];
  return { zoom, target };
}
