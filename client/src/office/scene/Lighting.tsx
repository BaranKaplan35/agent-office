import { useMemo } from 'react';
import type { QualityProfile } from '../quality';
import { lightDirection, type DaylightState } from './daylight';

const SUN_DISTANCE = 26;
/**
 * Three.js lights are physically based: an ambient intensity of 1 lights a surface
 * to only ~1/π of its colour. The keyframes in `daylight.ts` are written as
 * "perceived" strengths, so the ambient parts are scaled up here.
 */
const HEMISPHERE_SCALE = 2.3;
const KEY_SCALE = 1.5;
const FILL_DAY = 1.0;
const FILL_NIGHT = 0.5;

/**
 * Sun by day / moon by night through the windows (soft shadows), a sky-and-bounce
 * hemisphere light, and a gentle fill so the camera-facing sides never go black.
 * The warm pendant lamps are separate lights (see `PendantLamp`).
 */
export function Lighting({ light, profile }: { light: DaylightState; profile: QualityProfile }) {
  const { keyLight, hemisphere, night } = light;
  const position = useMemo(() => {
    const [x, y, z] = lightDirection(keyLight.azimuthDeg, keyLight.elevationDeg);
    return [x * SUN_DISTANCE, y * SUN_DISTANCE, z * SUN_DISTANCE] as [number, number, number];
  }, [keyLight.azimuthDeg, keyLight.elevationDeg]);

  return (
    <>
      <hemisphereLight
        args={[hemisphere.sky, hemisphere.ground, hemisphere.intensity * HEMISPHERE_SCALE]}
      />
      <directionalLight
        position={position}
        color={keyLight.color}
        intensity={keyLight.intensity * KEY_SCALE}
        castShadow={profile.shadows}
        shadow-mapSize={[profile.shadowMapSize, profile.shadowMapSize]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
        shadow-camera-near={1}
        shadow-camera-far={60}
        shadow-bias={-0.0004}
        shadow-normalBias={0.03}
        shadow-radius={4}
      />
      {/* fill from the camera side: no shadows, cool at night */}
      <directionalLight
        position={[14, 16, 14]}
        color={night > 0.5 ? '#9fb2ff' : '#fff6ea'}
        intensity={FILL_DAY + (FILL_NIGHT - FILL_DAY) * night}
      />
    </>
  );
}
