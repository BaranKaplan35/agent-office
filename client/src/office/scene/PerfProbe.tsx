import { useFrame, useThree } from '@react-three/fiber';
import { useEffect, useRef } from 'react';

export interface PerfSample {
  fps: number;
  calls: number;
  triangles: number;
  geometries: number;
  textures: number;
  programs: number;
}

declare global {
  interface Window {
    /** Written twice a second when the page is opened with `?perf`. */
    __officePerf?: PerfSample;
    /** The scene graph and camera, for poking at from the console (only with `?perf`). */
    __officeScene?: unknown;
    __officeCamera?: unknown;
  }
}

const enabled =
  typeof window !== 'undefined' && new URLSearchParams(window.location.search).has('perf');

/**
 * Development aid: with `?perf` in the URL, publishes frame rate and renderer
 * counts on `window.__officePerf` (read them from the console). Does nothing otherwise.
 */
export function PerfProbe() {
  const gl = useThree((s) => s.gl);
  const scene = useThree((s) => s.scene);
  const camera = useThree((s) => s.camera);
  useEffect(() => {
    if (!enabled) return;
    window.__officeScene = scene;
    window.__officeCamera = camera;
  }, [scene, camera]);
  const acc = useRef({ frames: 0, time: 0 });

  useFrame((_, delta) => {
    if (!enabled) return;
    const a = acc.current;
    a.frames += 1;
    a.time += delta;
    if (a.time < 0.5) return;
    const { render, memory, programs } = gl.info;
    window.__officePerf = {
      fps: Math.round(a.frames / a.time),
      calls: render.calls,
      triangles: render.triangles,
      geometries: memory.geometries,
      textures: memory.textures,
      programs: programs?.length ?? 0,
    };
    a.frames = 0;
    a.time = 0;
  });

  return null;
}
