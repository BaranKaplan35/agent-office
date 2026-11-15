import { useEffect, useMemo } from 'react';
import { Color, Float32BufferAttribute, PlaneGeometry } from 'three';
import { ROOM } from '../layout';
import { mixHex, type DaylightState } from '../scene/daylight';
import type { ScenePalette } from '../scene/palette';
import { Ball, Box, Cyl, seeded } from './parts';

const { width: W, depth: D, wallThickness: T } = ROOM;

// A narrow backdrop just behind the window wall: it only needs to fill what can
// be seen through the windows, so nothing sticks out above or beside the room.
const SKY = { x0: -W / 2 - 1.5, x1: W / 2 - 1.6, y0: -1, y1: 2.0 };
const SKY_Z = -D / 2 - T - 0.8;
const SKY_CENTER_X = (SKY.x0 + SKY.x1) / 2;

function SkyBackdrop({ light }: { light: DaylightState }) {
  const geometry = useMemo(() => {
    const g = new PlaneGeometry(SKY.x1 - SKY.x0, SKY.y1 - SKY.y0);
    const top = new Color(light.sky.top);
    const bottom = new Color(light.sky.bottom);
    // PlaneGeometry order: top-left, top-right, bottom-left, bottom-right.
    g.setAttribute(
      'color',
      new Float32BufferAttribute(
        [top, top, bottom, bottom].flatMap((c) => [c.r, c.g, c.b]),
        3,
      ),
    );
    return g;
  }, [light.sky.top, light.sky.bottom]);
  useEffect(() => () => geometry.dispose(), [geometry]);

  return (
    <mesh geometry={geometry} position={[SKY_CENTER_X, (SKY.y0 + SKY.y1) / 2, SKY_Z]}>
      <meshBasicMaterial vertexColors toneMapped={false} />
    </mesh>
  );
}

const STARS = (() => {
  const rand = seeded(99);
  return Array.from({ length: 22 }, () => ({
    x: SKY.x0 + 0.4 + rand() * (SKY.x1 - SKY.x0 - 0.8),
    y: 0.2 + rand() * 1.6,
    size: 0.018 + rand() * 0.02,
  }));
})();

function Celestial({ light }: { light: DaylightState }) {
  const { kind, azimuthDeg, elevationDeg } = light.celestial;
  const x = -0.75 + (azimuthDeg / 60) * 5;
  const y = 0.35 + (elevationDeg / 45) * 1.35;
  const sun = kind === 'sun';
  const color = sun ? '#fff3c4' : '#e8eeff';
  return (
    <group position={[0, 0, SKY_Z + 0.02]}>
      <mesh position={[x, y, 0]}>
        <circleGeometry args={[sun ? 0.62 : 0.5, 32]} />
        <meshBasicMaterial
          color={color}
          transparent
          opacity={sun ? 0.22 : 0.14}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <mesh position={[x, y, 0.01]}>
        <circleGeometry args={[sun ? 0.28 : 0.22, 32]} />
        <meshBasicMaterial color={color} toneMapped={false} />
      </mesh>
      {light.night > 0.3 &&
        STARS.map((s, i) => (
          <mesh key={i} position={[s.x, s.y, 0.005]}>
            <planeGeometry args={[s.size, s.size]} />
            <meshBasicMaterial
              color="#ffffff"
              transparent
              opacity={(light.night - 0.3) / 0.7}
              depthWrite={false}
              toneMapped={false}
            />
          </mesh>
        ))}
    </group>
  );
}

const TREES = [
  { x: -4.9, h: 0.55, r: 0.7 },
  { x: -3.1, h: 0.7, r: 0.8 },
  { x: -1.3, h: 0.5, r: 0.62 },
  { x: 0.8, h: 0.75, r: 0.85 },
  { x: 2.5, h: 0.55, r: 0.66 },
  { x: 4.2, h: 0.65, r: 0.75 },
];

function Garden({ palette }: { palette: ScenePalette }) {
  const grass = mixHex(palette.leaf, palette.floorB, 0.25);
  const z = -D / 2 - T - 0.3;
  return (
    <group>
      {/* ends before the wall's right edge, so it never shows beside the room */}
      <Box
        color={grass}
        size={[11.5, 0.12, 2.2]}
        position={[-1.85, -0.06, -D / 2 - T - 1.1]}
        castShadow={false}
        receiveShadow={false}
      />
      {TREES.map((t, i) => (
        <group key={t.x} position={[t.x, 0, z - (i % 2) * 0.25]}>
          <Cyl
            radius={0.07}
            height={t.h}
            position={[0, t.h / 2, 0]}
            color={palette.woodDark}
            segments={6}
            flat
            castShadow={false}
            receiveShadow={false}
          />
          <Ball
            radius={t.r}
            detail={1}
            position={[0, t.h + t.r * 0.7, 0]}
            color={i % 2 ? palette.leaf : palette.leafDark}
            castShadow={false}
            receiveShadow={false}
          />
        </group>
      ))}
    </group>
  );
}

/** What you can see through the windows. Never casts shadows (it must not block the sun). */
export function Outside({ palette, light }: { palette: ScenePalette; light: DaylightState }) {
  return (
    <group>
      <SkyBackdrop light={light} />
      <Celestial light={light} />
      <Garden palette={palette} />
    </group>
  );
}
