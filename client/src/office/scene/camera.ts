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

// --------------------------------------------------------------- user orbit

/** How far the viewer may turn and zoom the camera, relative to the default iso view. */
export const ORBIT = {
  azimuthRangeDeg: 35,
  polarMinDeg: 40,
  polarMaxDeg: 65,
  /** Zoom limits as multiples of the zoom that fits the whole room. */
  zoomMin: 0.7,
  zoomMax: 2.5,
  /** Zoom used when focusing a desk (at least; never zooms out). */
  focusZoom: 1.9,
} as const;

export interface OrbitLimits {
  minAzimuth: number;
  maxAzimuth: number;
  minPolar: number;
  maxPolar: number;
  minZoom: number;
  maxZoom: number;
}

/** Limits in radians and absolute zoom, for a room that fits at `fitZoom`. */
export function orbitLimits(fitZoom: number): OrbitLimits {
  return {
    minAzimuth: rad(ISO.azimuthDeg - ORBIT.azimuthRangeDeg),
    maxAzimuth: rad(ISO.azimuthDeg + ORBIT.azimuthRangeDeg),
    minPolar: rad(ORBIT.polarMinDeg),
    maxPolar: rad(ORBIT.polarMaxDeg),
    minZoom: fitZoom * ORBIT.zoomMin,
    maxZoom: fitZoom * ORBIT.zoomMax,
  };
}

/** Zoom for looking at one desk: closer than the overview, never further out than now. */
export function focusZoom(fitZoom: number, currentZoom: number): number {
  return Math.min(Math.max(currentZoom, fitZoom * ORBIT.focusZoom), fitZoom * ORBIT.zoomMax);
}

/** Height of the point the camera looks at when focusing a desk. */
export const FOCUS_HEIGHT = 0.9;

export interface ViewState {
  /** Radians; may be accumulated beyond ±π by the controls. */
  azimuth: number;
  polar: number;
  zoom: number;
  target: Vec3;
}

const wrapAngle = (a: number) => Math.atan2(Math.sin(a), Math.cos(a));

/** True when the view is (practically) the default overview for this fit. */
export function isOverview(view: ViewState, fit: FitResult): boolean {
  const d = (a: Vec3, b: Vec3) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
  return (
    Math.abs(wrapAngle(view.azimuth - rad(ISO.azimuthDeg))) < 0.01 &&
    Math.abs(view.polar - rad(ISO.polarDeg)) < 0.01 &&
    Math.abs(view.zoom / fit.zoom - 1) < 0.01 &&
    // the target may slide along the viewing direction without changing the picture
    d(projectOnPlane(view.target), projectOnPlane(fit.target)) < 0.05
  );
}

/** Remove the component along the default viewing direction (an ortho view ignores it). */
function projectOnPlane(p: Vec3): Vec3 {
  const n = isoDirection();
  const k = dot(p, n);
  return [p[0] - n[0] * k, p[1] - n[1] * k, p[2] - n[2] * k];
}
