/**
 * Motion in the office. The viewer picks System / Full / Reduced in the ⚙ menu
 * (stored per viewer); System follows `prefers-reduced-motion`. Windows reports
 * that preference whenever "Animation effects" is off, which is why Full exists.
 * `?motion=reduce` or `?motion=full` overrides everything for screenshots.
 *
 * Under reduced motion nobody wanders or chats, poses hold still, envelopes fade
 * instead of flying, the camera jumps instead of gliding and there is no confetti.
 */
import { useSyncExternalStore } from 'react';
import { create } from 'zustand';

export const MOTION_SETTINGS = ['system', 'full', 'reduced'] as const;
export type MotionSetting = (typeof MOTION_SETTINGS)[number];
export type MotionOverride = 'reduce' | 'full' | null;

/** Read the `?motion=` override from a query string (pure). */
export function motionOverride(search: string): MotionOverride {
  const value = new URLSearchParams(search).get('motion');
  return value === 'reduce' || value === 'full' ? value : null;
}

export function isMotionSetting(value: unknown): value is MotionSetting {
  return typeof value === 'string' && (MOTION_SETTINGS as readonly string[]).includes(value);
}

/** Should the office be calm? URL override first, then the viewer's choice, then the system. */
export function resolveReduced(
  setting: MotionSetting,
  systemReduced: boolean,
  override: MotionOverride = null,
): boolean {
  if (override) return override === 'reduce';
  if (setting === 'system') return systemReduced;
  return setting === 'reduced';
}

const STORAGE_KEY = 'agent-office.motion';

function readStored(): MotionSetting {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isMotionSetting(stored)) return stored;
  } catch {
    // Storage can be blocked; fall back to the default.
  }
  return 'system';
}

interface MotionState {
  setting: MotionSetting;
  setSetting: (setting: MotionSetting) => void;
}

export const useMotion = create<MotionState>()((set) => ({
  setting: readStored(),
  setSetting: (setting) => {
    set({ setting });
    try {
      localStorage.setItem(STORAGE_KEY, setting);
    } catch {
      // Not persisting is fine.
    }
  },
}));

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

/** The system's own reduced-motion preference (live). */
export function useSystemReducedMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => mediaQuery()?.matches ?? false,
    () => false,
  );
}

/** True when office animations should be calm (no loops, no wandering, no flights). */
export function useReducedMotion(): boolean {
  const setting = useMotion((s) => s.setting);
  const system = useSystemReducedMotion();
  const override = typeof window !== 'undefined' ? motionOverride(window.location.search) : null;
  return resolveReduced(setting, system, override);
}
