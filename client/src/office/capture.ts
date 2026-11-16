/**
 * Deterministic capture mode for the README GIF (`?capture=1`).
 *
 * Normally the scene follows the real clock. In capture mode nothing moves on its
 * own: the R3F loop is stopped (`frameloop="never"`) and a recorder calls
 * `window.__officeCapture.step()` to advance exactly one frame (1/15 s) — the 3D
 * clock, the scene time used by envelopes and goals, and every CSS animation (bubble
 * badges, dots). The task is fed from a recorded timeline instead of the live stream,
 * so the same recording gives the same frames, however slowly they are captured.
 */
import type { Task } from '@agent-office/shared';

export const CAPTURE_FPS = 15;

/** True when the page was opened with `?capture` (any value but "0"). */
export function isCaptureMode(search: string): boolean {
  const value = new URLSearchParams(search).get('capture');
  return value !== null && value !== '0';
}

export const CAPTURE: boolean =
  typeof window !== 'undefined' && isCaptureMode(window.location.search);

let captureTime = 0;

/** Seconds on the scene's clock: the real clock, or the stepped one in capture mode. */
export function sceneNow(): number {
  return CAPTURE ? captureTime : performance.now() / 1000;
}

/** Move the capture clock forward; returns the new time (seconds). */
export function advanceCaptureClock(seconds: number): number {
  captureTime += seconds;
  return captureTime;
}

/**
 * CSS animations follow the wall clock; in capture mode each one is paused when it
 * first shows up and then moved forward by exactly one frame per step.
 */
export function stepCssAnimations(root: Document, ms: number): void {
  for (const animation of root.getAnimations()) {
    if (animation.playState === 'running') {
      animation.pause();
      if (animation.currentTime === null) animation.currentTime = 0;
      continue; // A new animation starts at 0 in this frame.
    }
    const current = Number(animation.currentTime ?? 0);
    animation.currentTime = current + ms;
  }
}

/** Filled in by the scene's `CaptureDriver` while the Canvas is mounted. */
export const captureHooks: { step?: (frames?: number) => Promise<void>; ready: boolean } = {
  ready: false,
};

/** Expose the recorder API on `window` (capture mode only). */
export function installCaptureApi(setTask: (task: Task | null) => void): void {
  window.__officeCapture = {
    step: async (frames = 1) => {
      if (!captureHooks.step) throw new Error('The 3D scene is not ready yet');
      await captureHooks.step(frames);
    },
    time: () => captureTime,
    setTask,
    ready: () => captureHooks.ready,
  };
}

/** What the recorder can call from outside (Chrome DevTools Protocol). */
export interface CaptureApi {
  /** Advance the scene by `frames` frames (default 1). */
  step: (frames?: number) => Promise<void>;
  /** Scene time in seconds. */
  time: () => number;
  /** Show this task snapshot as if it came from the server (null = no task). */
  setTask: (task: Task | null) => void;
  /** True once the 3D scene has rendered its first frame. */
  ready: () => boolean;
}

declare global {
  interface Window {
    __officeCapture?: CaptureApi;
  }
}
