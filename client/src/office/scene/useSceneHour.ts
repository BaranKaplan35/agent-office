import { useEffect, useState } from 'react';
import { hourFromDate, parseHourParam } from './daylight';

const REFRESH_MS = 30_000;

/**
 * The hour (0–24, fractional) that drives the light. `?hour=19.5` pins it, which
 * is how the README screenshots are taken; otherwise it follows the viewer's clock.
 */
export function useSceneHour(): number {
  const pinned = parseHourParam(window.location.search);
  const [hour, setHour] = useState(() => pinned ?? hourFromDate(new Date()));

  useEffect(() => {
    if (pinned !== null) return;
    const timer = setInterval(() => setHour(hourFromDate(new Date())), REFRESH_MS);
    return () => clearInterval(timer);
  }, [pinned]);

  return pinned ?? hour;
}
