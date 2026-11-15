/**
 * Graphics quality. The user picks Auto / High / Low (stored per viewer); Auto
 * starts at High and drops to Low for the rest of the session when the scene
 * runs slowly. The workflow never depends on this: it only changes how the
 * scene is drawn.
 */
import { create } from 'zustand';

export const QUALITY_SETTINGS = ['auto', 'high', 'low'] as const;
export type QualitySetting = (typeof QUALITY_SETTINGS)[number];
export type QualityLevel = 'high' | 'low';

export interface QualityProfile {
  level: QualityLevel;
  shadows: boolean;
  shadowMapSize: number;
  /** Device-pixel-ratio range handed to the canvas. */
  dpr: [number, number];
  /** How many pendant lamps get a real point light. */
  lampLights: number;
}

const PROFILES: Record<QualityLevel, QualityProfile> = {
  high: { level: 'high', shadows: true, shadowMapSize: 2048, dpr: [1, 2], lampLights: 3 },
  low: { level: 'low', shadows: false, shadowMapSize: 512, dpr: [1, 1], lampLights: 1 },
};

export function profileFor(level: QualityLevel): QualityProfile {
  return PROFILES[level];
}

export function resolveLevel(setting: QualitySetting, autoLevel: QualityLevel): QualityLevel {
  return setting === 'auto' ? autoLevel : setting;
}

export function isQualitySetting(value: unknown): value is QualitySetting {
  return typeof value === 'string' && (QUALITY_SETTINGS as readonly string[]).includes(value);
}

const STORAGE_KEY = 'agent-office.quality';

function readStored(): QualitySetting {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (isQualitySetting(stored)) return stored;
  } catch {
    // Storage can be blocked; fall back to the default.
  }
  return 'auto';
}

interface QualityState {
  setting: QualitySetting;
  /** What Auto currently resolves to. */
  autoLevel: QualityLevel;
  setSetting: (setting: QualitySetting) => void;
  /** Called by the performance monitor; only ever lowers the level. */
  lowerAutoLevel: () => void;
}

export const useQuality = create<QualityState>()((set) => ({
  setting: readStored(),
  autoLevel: 'high',
  setSetting: (setting) => {
    set({ setting });
    try {
      localStorage.setItem(STORAGE_KEY, setting);
    } catch {
      // Not persisting is fine.
    }
  },
  lowerAutoLevel: () => set({ autoLevel: 'low' }),
}));

/** The level the scene should render at right now. */
export function useQualityLevel(): QualityLevel {
  return useQuality((s) => resolveLevel(s.setting, s.autoLevel));
}
