import { describe, expect, it } from 'vitest';
import {
  daylight,
  hexToRgb,
  hourFromDate,
  lightDirection,
  mixHex,
  normalizeHour,
  parseHourParam,
} from './daylight';

const HEX = /^#[0-9a-f]{6}$/;

describe('daylight', () => {
  it('is bright at noon and dim at midnight', () => {
    const noon = daylight(12.5);
    const midnight = daylight(0);
    expect(noon.keyLight.intensity).toBeGreaterThan(2.5);
    expect(midnight.keyLight.intensity).toBeLessThan(0.6);
    expect(noon.night).toBe(0);
    expect(midnight.night).toBe(1);
    expect(noon.celestial.kind).toBe('sun');
    expect(midnight.celestial.kind).toBe('moon');
  });

  it('switches the lamps on in the evening and off at noon', () => {
    expect(daylight(12.5).lamps).toBe(0);
    expect(daylight(12).lamps).toBeLessThan(0.02);
    expect(daylight(21).lamps).toBeGreaterThan(0.8);
    expect(daylight(3).lamps).toBe(1);
  });

  it('moves the sun from the morning side to the evening side', () => {
    expect(daylight(9).keyLight.azimuthDeg).toBeGreaterThan(20);
    expect(daylight(12.5).keyLight.azimuthDeg).toBeCloseTo(0, 5);
    expect(daylight(16).keyLight.azimuthDeg).toBeLessThan(-20);
    expect(daylight(12.5).keyLight.elevationDeg).toBeGreaterThan(
      daylight(18.5).keyLight.elevationDeg,
    );
  });

  it('keeps the light shining through the window wall at every hour', () => {
    for (let h = 0; h < 24; h += 0.25) {
      const { azimuthDeg, elevationDeg } = daylight(h).keyLight;
      expect(Math.abs(azimuthDeg)).toBeLessThanOrEqual(60);
      expect(elevationDeg).toBeGreaterThan(0);
      expect(elevationDeg).toBeLessThanOrEqual(45);
    }
  });

  it('only returns valid #rrggbb colours', () => {
    for (let h = 0; h < 24; h += 0.5) {
      const d = daylight(h);
      for (const c of [
        d.keyLight.color,
        d.hemisphere.sky,
        d.hemisphere.ground,
        d.sky.top,
        d.sky.bottom,
      ]) {
        expect(c).toMatch(HEX);
      }
    }
  });

  it('changes smoothly: no jumps between close hours', () => {
    const maxChannelDiff = (a: string, b: string) =>
      Math.max(...hexToRgb(a).map((v, i) => Math.abs(v - (hexToRgb(b)[i] as number))));
    for (let h = 0; h < 24; h += 0.05) {
      const a = daylight(h);
      const b = daylight(h + 0.05);
      expect(Math.abs(a.keyLight.intensity - b.keyLight.intensity)).toBeLessThan(0.15);
      expect(Math.abs(a.hemisphere.intensity - b.hemisphere.intensity)).toBeLessThan(0.05);
      expect(Math.abs(a.lamps - b.lamps)).toBeLessThan(0.08);
      expect(Math.abs(a.keyLight.azimuthDeg - b.keyLight.azimuthDeg)).toBeLessThan(3);
      expect(maxChannelDiff(a.keyLight.color, b.keyLight.color)).toBeLessThan(14);
      expect(maxChannelDiff(a.sky.top, b.sky.top)).toBeLessThan(14);
      expect(maxChannelDiff(a.sky.bottom, b.sky.bottom)).toBeLessThan(14);
    }
  });

  it('wraps around midnight and tolerates odd input', () => {
    expect(daylight(24)).toEqual(daylight(0));
    expect(daylight(-1)).toEqual(daylight(23));
    expect(daylight(25).hour).toBeCloseTo(1, 10);
    expect(daylight(Number.NaN).hour).toBe(12);
  });
});

describe('colour helpers', () => {
  it('mixes hex colours', () => {
    expect(mixHex('#000000', '#ffffff', 0.5)).toBe('#808080');
    expect(mixHex('#ff0000', '#0000ff', 0)).toBe('#ff0000');
    expect(() => hexToRgb('teal')).toThrow(RangeError);
  });

  it('lightDirection is a unit vector that points to the window side', () => {
    const [x, y, z] = lightDirection(0, 40);
    expect(Math.hypot(x, y, z)).toBeCloseTo(1, 10);
    expect(z).toBeLessThan(0);
    expect(y).toBeGreaterThan(0);
    expect(lightDirection(50, 20)[0]).toBeGreaterThan(0);
  });
});

describe('time source', () => {
  it('normalises hours', () => {
    expect(normalizeHour(25.5)).toBe(1.5);
    expect(normalizeHour(-0.5)).toBe(23.5);
  });

  it('converts a date to a fractional hour', () => {
    expect(hourFromDate(new Date(2026, 0, 1, 13, 30, 0))).toBe(13.5);
  });

  it('parses the ?hour override', () => {
    expect(parseHourParam('?hour=19.5')).toBe(19.5);
    expect(parseHourParam('?x=1&hour=7:30')).toBe(7.5);
    expect(parseHourParam('?hour=0')).toBe(0);
    expect(parseHourParam('?hour=24')).toBe(24);
    expect(parseHourParam('')).toBeNull();
    expect(parseHourParam('?hour=')).toBeNull();
    expect(parseHourParam('?hour=abc')).toBeNull();
    expect(parseHourParam('?hour=25')).toBeNull();
    expect(parseHourParam('?hour=-2')).toBeNull();
  });
});
