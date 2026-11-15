/**
 * Time of day → lighting (pure). The scene calls `daylight(hour)` with the
 * viewer's local time (or `?hour=19.5` for screenshots) and applies the result
 * to its lights and to the sky outside the windows.
 *
 * Everything is keyframed and eased between keyframes, so the light never jumps.
 * Azimuth: 0° = straight through the window wall, + towards +X (morning side),
 * - towards -X (evening side). The room only has windows on one wall, so the
 * range stays within about ±55°.
 */

export interface KeyLight {
  color: string;
  intensity: number;
  azimuthDeg: number;
  elevationDeg: number;
}

export interface DaylightState {
  /** Normalised to [0, 24). */
  hour: number;
  /** Sun by day, moon by night (same light, different colour and strength). */
  keyLight: KeyLight;
  hemisphere: { sky: string; ground: string; intensity: number };
  /** Colours of the sky gradient seen through the windows. */
  sky: { top: string; bottom: string };
  /** 0 (off) … 1 (full): how strongly the pendant lamps glow. */
  lamps: number;
  /** 0 (bright day) … 1 (deep night). */
  night: number;
  celestial: { kind: 'sun' | 'moon'; azimuthDeg: number; elevationDeg: number };
}

interface Keyframe {
  h: number;
  key: string;
  keyI: number;
  az: number;
  el: number;
  hemiSky: string;
  hemiGround: string;
  hemiI: number;
  skyTop: string;
  skyBottom: string;
  lamps: number;
  night: number;
}

// The moon crosses the window wall over the night: -35° at 21:30, 0° at midnight,
// +45° at 05:00, so the light never swings suddenly at dawn or dusk.
const NIGHT: Omit<Keyframe, 'h'> = {
  key: '#8ea3e8',
  keyI: 0.45,
  az: 0,
  el: 34,
  hemiSky: '#34426f',
  hemiGround: '#1f2437',
  hemiI: 0.75,
  skyTop: '#0a1230',
  skyBottom: '#1b2a55',
  lamps: 1,
  night: 1,
};

const KEYFRAMES: readonly Keyframe[] = [
  { h: 0, ...NIGHT },
  {
    ...NIGHT,
    h: 5,
    az: 45,
    hemiSky: '#3b4a7a',
    skyTop: '#101c45',
    skyBottom: '#3a3f6e',
    night: 0.9,
  },
  {
    h: 6.5, // dawn
    key: '#ffb98a',
    keyI: 1.2,
    az: 55,
    el: 7,
    hemiSky: '#b3bfe8',
    hemiGround: '#c8a98d',
    hemiI: 0.8,
    skyTop: '#7f9bdc',
    skyBottom: '#ffc9a3',
    lamps: 0.6,
    night: 0.3,
  },
  {
    h: 9, // morning
    key: '#fff1da',
    keyI: 2.6,
    az: 40,
    el: 30,
    hemiSky: '#eef3fa',
    hemiGround: '#dccdb0',
    hemiI: 0.95,
    skyTop: '#7db4f0',
    skyBottom: '#dcefff',
    lamps: 0.1,
    night: 0,
  },
  {
    h: 12.5, // noon
    key: '#fffbf2',
    keyI: 3.2,
    az: 0,
    el: 40,
    hemiSky: '#f3f5f8',
    hemiGround: '#e4d6bb',
    hemiI: 1,
    skyTop: '#69a8ee',
    skyBottom: '#d4e9ff',
    lamps: 0,
    night: 0,
  },
  {
    h: 16, // afternoon
    key: '#fff1d6',
    keyI: 2.8,
    az: -32,
    el: 30,
    hemiSky: '#eef3fa',
    hemiGround: '#dccdb0',
    hemiI: 0.95,
    skyTop: '#78b0ef',
    skyBottom: '#e0efff',
    lamps: 0.05,
    night: 0,
  },
  {
    h: 18.5, // golden hour
    key: '#ffbf78',
    keyI: 2.4,
    az: -52,
    el: 11,
    hemiSky: '#f5d3ab',
    hemiGround: '#cfa27c',
    hemiI: 0.85,
    skyTop: '#6f8fd8',
    skyBottom: '#ffc88a',
    lamps: 0.5,
    night: 0.15,
  },
  {
    h: 20, // dusk
    key: '#ff936f',
    keyI: 0.9,
    az: -55,
    el: 3,
    hemiSky: '#9283b4',
    hemiGround: '#6e5d72',
    hemiI: 0.65,
    skyTop: '#2e3a78',
    skyBottom: '#e47d6c',
    lamps: 0.9,
    night: 0.55,
  },
  { h: 21.5, ...NIGHT, az: -35 },
  { h: 24, ...NIGHT },
];

// ---------------------------------------------------------------- helpers

export function normalizeHour(hour: number): number {
  return ((hour % 24) + 24) % 24;
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const smooth = (t: number) => t * t * (3 - 2 * t);
const lerp = (a: number, b: number, t: number) => a + (b - a) * t;

export function hexToRgb(hex: string): [number, number, number] {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) throw new RangeError(`Not a #rrggbb colour: ${hex}`);
  const n = parseInt(m[1] as string, 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function rgbToHex([r, g, b]: [number, number, number]): string {
  const h = (v: number) =>
    Math.round(clamp(v, 0, 255))
      .toString(16)
      .padStart(2, '0');
  return `#${h(r)}${h(g)}${h(b)}`;
}

export function mixHex(a: string, b: string, t: number): string {
  const [ar, ag, ab] = hexToRgb(a);
  const [br, bg, bb] = hexToRgb(b);
  return rgbToHex([lerp(ar, br, t), lerp(ag, bg, t), lerp(ab, bb, t)]);
}

/** Unit vector pointing from the scene towards the light. */
export function lightDirection(azimuthDeg: number, elevationDeg: number): [number, number, number] {
  const az = (azimuthDeg * Math.PI) / 180;
  const el = (elevationDeg * Math.PI) / 180;
  return [Math.sin(az) * Math.cos(el), Math.sin(el), -Math.cos(az) * Math.cos(el)];
}

// ------------------------------------------------------------------- main

export function daylight(hourInput: number): DaylightState {
  const hour = normalizeHour(Number.isFinite(hourInput) ? hourInput : 12);
  const nextIndex = KEYFRAMES.findIndex((k) => k.h > hour);
  const b = KEYFRAMES[nextIndex === -1 ? KEYFRAMES.length - 1 : nextIndex] as Keyframe;
  const a = KEYFRAMES[
    Math.max(0, (nextIndex === -1 ? KEYFRAMES.length : nextIndex) - 1)
  ] as Keyframe;
  const t = a === b ? 0 : smooth(clamp((hour - a.h) / (b.h - a.h), 0, 1));

  const night = lerp(a.night, b.night, t);
  const azimuthDeg = lerp(a.az, b.az, t);
  const elevationDeg = lerp(a.el, b.el, t);

  return {
    hour,
    keyLight: {
      color: mixHex(a.key, b.key, t),
      intensity: lerp(a.keyI, b.keyI, t),
      azimuthDeg,
      elevationDeg,
    },
    hemisphere: {
      sky: mixHex(a.hemiSky, b.hemiSky, t),
      ground: mixHex(a.hemiGround, b.hemiGround, t),
      intensity: lerp(a.hemiI, b.hemiI, t),
    },
    sky: { top: mixHex(a.skyTop, b.skyTop, t), bottom: mixHex(a.skyBottom, b.skyBottom, t) },
    lamps: lerp(a.lamps, b.lamps, t),
    night,
    celestial: { kind: night < 0.5 ? 'sun' : 'moon', azimuthDeg, elevationDeg },
  };
}

// ------------------------------------------------------------ time source

export function hourFromDate(date: Date): number {
  return date.getHours() + date.getMinutes() / 60 + date.getSeconds() / 3600;
}

/**
 * Read `?hour=19.5` (or `?hour=19:30`) from a query string. Returns null when
 * absent or invalid, so the real clock is used.
 */
export function parseHourParam(search: string): number | null {
  const raw = new URLSearchParams(search).get('hour');
  if (raw === null) return null;
  const clock = /^(\d{1,2}):([0-5]\d)$/.exec(raw.trim());
  const value = clock ? Number(clock[1]) + Number(clock[2]) / 60 : Number(raw);
  if (raw.trim() === '' || !Number.isFinite(value) || value < 0 || value > 24) return null;
  return value;
}
