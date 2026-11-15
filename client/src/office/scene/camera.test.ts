import { describe, expect, it } from 'vitest';
import { roomCorners } from '../layout';
import { cameraBasis, fitCamera, ISO, isoDirection, type Vec3 } from './camera';

const dot = (a: Vec3, b: Vec3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];

describe('isoDirection', () => {
  it('is a unit vector above the horizon, equally between +X and +Z', () => {
    const d = isoDirection();
    expect(Math.hypot(...d)).toBeCloseTo(1, 10);
    expect(d[0]).toBeCloseTo(d[2], 10);
    expect(d[1]).toBeGreaterThan(0);
    // ~35° above the horizon (true isometric)
    expect((Math.asin(d[1]) * 180) / Math.PI).toBeCloseTo(90 - ISO.polarDeg, 5);
  });
});

describe('cameraBasis', () => {
  it('returns orthonormal axes perpendicular to the view direction', () => {
    const dir = isoDirection();
    const { right, up } = cameraBasis(dir);
    expect(Math.hypot(...right)).toBeCloseTo(1, 10);
    expect(Math.hypot(...up)).toBeCloseTo(1, 10);
    expect(dot(right, up)).toBeCloseTo(0, 10);
    expect(dot(right, dir)).toBeCloseTo(0, 10);
    expect(dot(up, dir)).toBeCloseTo(0, 10);
    expect(up[1]).toBeGreaterThan(0); // world up stays up on screen
  });
});

describe('fitCamera', () => {
  const direction = isoDirection();
  const { right, up } = cameraBasis(direction);
  const project = (corners: Vec3[], target: Vec3, zoom: number) =>
    corners.map((c) => ({
      x: dot([c[0] - target[0], c[1] - target[1], c[2] - target[2]], right) * zoom,
      y: dot([c[0] - target[0], c[1] - target[1], c[2] - target[2]], up) * zoom,
    }));

  it.each([
    { width: 1000, height: 600 },
    { width: 340, height: 520 },
    { width: 1600, height: 400 },
  ])('keeps the whole room inside a $width×$height canvas, centred', (viewport) => {
    const corners = roomCorners();
    const { zoom, target } = fitCamera({ corners, direction, viewport, margin: 0.05 });
    const pts = project(corners, target, zoom);
    const xs = pts.map((p) => p.x);
    const ys = pts.map((p) => p.y);

    expect(Math.max(...xs)).toBeLessThanOrEqual(viewport.width / 2 + 1e-6);
    expect(Math.min(...xs)).toBeGreaterThanOrEqual(-viewport.width / 2 - 1e-6);
    expect(Math.max(...ys)).toBeLessThanOrEqual(viewport.height / 2 + 1e-6);
    expect(Math.min(...ys)).toBeGreaterThanOrEqual(-viewport.height / 2 - 1e-6);
    // centred
    expect((Math.max(...xs) + Math.min(...xs)) / 2).toBeCloseTo(0, 5);
    expect((Math.max(...ys) + Math.min(...ys)) / 2).toBeCloseTo(0, 5);
    // tight in at least one direction (uses 90% of it with margin 0.05)
    const fillX = (Math.max(...xs) - Math.min(...xs)) / viewport.width;
    const fillY = (Math.max(...ys) - Math.min(...ys)) / viewport.height;
    expect(Math.max(fillX, fillY)).toBeCloseTo(0.9, 5);
  });

  it('zooms out when the canvas gets smaller and survives a zero-size canvas', () => {
    const corners = roomCorners();
    const big = fitCamera({ corners, direction, viewport: { width: 1200, height: 800 } });
    const small = fitCamera({ corners, direction, viewport: { width: 600, height: 400 } });
    expect(small.zoom).toBeCloseTo(big.zoom / 2, 5);
    const none = fitCamera({ corners, direction, viewport: { width: 0, height: 0 } });
    expect(none.zoom).toBe(1);
  });
});
