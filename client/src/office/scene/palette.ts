/**
 * Scene colours come from the CSS tokens in `styles/tokens.css`, so the office
 * follows the light / dark theme. Read at runtime; the hook re-reads when the
 * theme changes (a `data-theme` attribute or the OS colour scheme).
 */
import { useEffect, useState } from 'react';

export interface ScenePalette {
  isDark: boolean;
  floorA: string;
  floorB: string;
  wall: string;
  wallShade: string;
  surface: string;
  ink: string;
  muted: string;
  primary: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
  wood: string;
  woodDark: string;
  leaf: string;
  leafDark: string;
  metal: string;
  fabric: string;
  rug: string;
  glass: string;
  lamp: string;
}

/** Light-theme values, used when a token is missing (and in tests without a DOM). */
export const FALLBACK_PALETTE: ScenePalette = {
  isDark: false,
  floorA: '#e9e3d8',
  floorB: '#e2dacc',
  wall: '#d7cfc2',
  wallShade: '#cbc2b3',
  surface: '#ffffff',
  ink: '#1e2328',
  muted: '#6b7280',
  primary: '#0f766e',
  accent: '#f59e5b',
  success: '#22a06b',
  warning: '#e8b53a',
  danger: '#e5484d',
  wood: '#c99a6b',
  woodDark: '#a77a52',
  leaf: '#4f9a62',
  leafDark: '#3a7a4d',
  metal: '#aab2bd',
  fabric: '#8f9bb3',
  rug: '#e8c9a8',
  glass: '#bfe3ff',
  lamp: '#ffd9a0',
};

const TOKENS: Record<Exclude<keyof ScenePalette, 'isDark'>, string> = {
  floorA: '--scene-floor-a',
  floorB: '--scene-floor-b',
  wall: '--scene-wall',
  wallShade: '--scene-wall-shade',
  surface: '--surface',
  ink: '--ink',
  muted: '--muted',
  primary: '--primary',
  accent: '--accent',
  success: '--success',
  warning: '--warning',
  danger: '--danger',
  wood: '--scene-wood',
  woodDark: '--scene-wood-dark',
  leaf: '--scene-leaf',
  leafDark: '--scene-leaf-dark',
  metal: '--scene-metal',
  fabric: '--scene-fabric',
  rug: '--scene-rug',
  glass: '--scene-glass',
  lamp: '--scene-lamp',
};

const HEX = /^#[0-9a-f]{6}$/i;

export function isDarkTheme(root: HTMLElement = document.documentElement): boolean {
  const explicit = root.getAttribute('data-theme');
  if (explicit === 'dark') return true;
  if (explicit === 'light') return false;
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
}

export function readScenePalette(root: HTMLElement = document.documentElement): ScenePalette {
  const style = getComputedStyle(root);
  const palette: ScenePalette = { ...FALLBACK_PALETTE, isDark: isDarkTheme(root) };
  for (const [key, token] of Object.entries(TOKENS)) {
    const value = style.getPropertyValue(token).trim();
    if (HEX.test(value)) palette[key as keyof typeof TOKENS] = value;
  }
  return palette;
}

export function useScenePalette(): ScenePalette {
  const [palette, setPalette] = useState<ScenePalette>(() => readScenePalette());

  useEffect(() => {
    const update = () => setPalette(readScenePalette());
    const observer = new MutationObserver(update);
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme'],
    });
    const media = window.matchMedia?.('(prefers-color-scheme: dark)');
    media?.addEventListener('change', update);
    return () => {
      observer.disconnect();
      media?.removeEventListener('change', update);
    };
  }, []);

  return palette;
}
