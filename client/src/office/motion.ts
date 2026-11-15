/**
 * Reduced motion for the office. Follows the viewer's `prefers-reduced-motion`
 * setting; `?motion=reduce` (or `?motion=full`) overrides it for screenshots.
 *
 * Under reduced motion nobody wanders, poses hold still, envelopes fade instead of
 * flying, the camera jumps instead of gliding and there is no confetti.
 */
import { useSyncExternalStore } from 'react';

export type MotionOverride = 'reduce' | 'full' | null;

/** Read the `?motion=` override from a query string (pure). */
export function motionOverride(search: string): MotionOverride {
  const value = new URLSearchParams(search).get('motion');
  return value === 'reduce' || value === 'full' ? value : null;
}

const QUERY = '(prefers-reduced-motion: reduce)';

function mediaQuery(): MediaQueryList | null {
  return typeof window !== 'undefined' && typeof window.matchMedia === 'function'
    ? window.matchMedia(QUERY)
    : null;
}

function subscribe(onChange: () => void): () => void {
  const mq = mediaQuery();
  mq?.addEventListener('change', onChange);
  return () => mq?.removeEventListener('change', onChange);
}

function snapshot(): boolean {
  const override = typeof window !== 'undefined' ? motionOverride(window.location.search) : null;
  if (override) return override === 'reduce';
  return mediaQuery()?.matches ?? false;
}

/** True when office animations should be calm (no loops, no flights). */
export function useReducedMotion(): boolean {
  return useSyncExternalStore(subscribe, snapshot, () => false);
}
