import { useMemo } from 'react';
import { ROOM } from '../layout';
import { mixHex } from '../scene/daylight';
import type { ScenePalette } from '../scene/palette';
import { Box, InstancedBoxes, seeded, type InstanceItem, type V3 } from './parts';

const { width: W, depth: D, wallHeight: H, wallThickness: T, floorSlab: SLAB } = ROOM;

/** Window openings in the back-right (-Z) wall. */
export const WINDOW = { width: 2.2, sill: 0.95, top: 2.45, centers: [-3.8, 0.2, 4.2] } as const;
const WINDOW_HEIGHT = WINDOW.top - WINDOW.sill;
const WALL_Z = -D / 2 - T / 2;
const PLANKS = 22;

function Planks({ palette }: { palette: ScenePalette }) {
  const items = useMemo<InstanceItem[]>(() => {
    const rand = seeded(7);
    const pitch = D / PLANKS;
    return Array.from({ length: PLANKS }, (_, i) => ({
      position: [0, -0.025, -D / 2 + (i + 0.5) * pitch] as V3,
      scale: [W, 0.05, pitch - 0.012] as V3,
      color: mixHex(palette.floorA, palette.floorB, rand() * 0.9 + (i % 2) * 0.1),
    }));
  }, [palette.floorA, palette.floorB]);
  return <InstancedBoxes items={items} castShadow={false} roughness={0.75} />;
}

/** The back-right wall with real window openings, so sunlight only enters through them. */
function WindowWall({ palette }: { palette: ScenePalette }) {
  const xL = -W / 2 - T;
  const xR = W / 2;
  const half = WINDOW.width / 2;
  const edges = [xL, ...WINDOW.centers.flatMap((c) => [c - half, c + half]), xR];
  const piers = [0, 2, 4, 6].map((i) => ({
    from: edges[i] as number,
    to: edges[i + 1] as number,
  }));
  const wall = { color: palette.wall, roughness: 0.95 };

  return (
    <group>
      <Box
        {...wall}
        size={[xR - xL, WINDOW.sill, T]}
        position={[(xL + xR) / 2, WINDOW.sill / 2, WALL_Z]}
      />
      <Box
        {...wall}
        size={[xR - xL, H - WINDOW.top, T]}
        position={[(xL + xR) / 2, (WINDOW.top + H) / 2, WALL_Z]}
      />
      {piers.map(({ from, to }) => (
        <Box
          key={from}
          {...wall}
          size={[to - from, WINDOW_HEIGHT, T]}
          position={[(from + to) / 2, (WINDOW.sill + WINDOW.top) / 2, WALL_Z]}
        />
      ))}
      <Box
        color={palette.wallShade}
        size={[xR - xL, 0.07, T + 0.05]}
        position={[(xL + xR) / 2, H + 0.035, WALL_Z]}
      />
      {WINDOW.centers.map((cx) => (
        <Window key={cx} cx={cx} palette={palette} />
      ))}
    </group>
  );
}

function Window({ cx, palette }: { cx: number; palette: ScenePalette }) {
  const w = WINDOW.width;
  const h = WINDOW_HEIGHT;
  const cy = WINDOW.sill + h / 2;
  const frame = { color: palette.surface, roughness: 0.6 } as const;
  const f = 0.07;
  const depth = T * 0.7;
  return (
    <group position={[cx, 0, WALL_Z]}>
      <Box {...frame} size={[w, f, depth]} position={[0, WINDOW.sill + f / 2, 0]} />
      <Box {...frame} size={[w, f, depth]} position={[0, WINDOW.top - f / 2, 0]} />
      <Box {...frame} size={[f, h, depth]} position={[-w / 2 + f / 2, cy, 0]} />
      <Box {...frame} size={[f, h, depth]} position={[w / 2 - f / 2, cy, 0]} />
      <Box {...frame} size={[0.05, h, 0.06]} position={[0, cy, 0]} />
      <Box {...frame} size={[w, 0.05, 0.06]} position={[0, cy + 0.1, 0]} />
      <Box
        color={palette.glass}
        size={[w - f, h - f, 0.02]}
        position={[0, cy, 0]}
        opacity={0.16}
        roughness={0.1}
        depthWrite={false}
        castShadow={false}
        receiveShadow={false}
      />
      <Box
        {...frame}
        size={[w + 0.32, 0.07, T + 0.26]}
        position={[0, WINDOW.sill - 0.035, 0.12]}
        radius={0.02}
      />
    </group>
  );
}

function Poster({
  x,
  palette,
  tint,
}: {
  x: number;
  palette: ScenePalette;
  tint: 'primary' | 'accent';
}) {
  const main = tint === 'primary' ? palette.primary : palette.accent;
  const second = tint === 'primary' ? palette.accent : palette.success;
  return (
    <group position={[x, 1.7, -D / 2 + 0.03]}>
      <Box color={palette.wood} size={[1.06, 1.36, 0.05]} radius={0.015} />
      <Box
        color={palette.surface}
        size={[0.92, 1.22, 0.02]}
        position={[0, 0, 0.03]}
        receiveShadow={false}
      />
      <Box color={main} size={[0.7, 0.5, 0.02]} position={[0, 0.25, 0.045]} receiveShadow={false} />
      <Box
        color={second}
        size={[0.32, 0.32, 0.02]}
        position={[-0.17, -0.3, 0.045]}
        receiveShadow={false}
      />
      <Box
        color={palette.muted}
        size={[0.3, 0.06, 0.02]}
        position={[0.2, -0.22, 0.045]}
        receiveShadow={false}
      />
      <Box
        color={palette.muted}
        size={[0.22, 0.06, 0.02]}
        position={[0.24, -0.34, 0.045]}
        receiveShadow={false}
      />
    </group>
  );
}

/**
 * Invisible walls and ceiling that only cast shadows. They close the room so the
 * sun can only come in through the windows, while the camera still sees inside.
 */
function ShadowEnclosure() {
  const blocker = (size: V3, position: V3) => (
    <mesh position={position} castShadow>
      <boxGeometry args={size} />
      <meshBasicMaterial colorWrite={false} depthWrite={false} />
    </mesh>
  );
  const top = H + 0.2;
  return (
    <group>
      {blocker([T, top, D + T * 2], [W / 2 + T / 2, top / 2, 0])} {/* open side, right */}
      {blocker([W + T * 2, top, T], [0, top / 2, D / 2 + T / 2])} {/* open side, front */}
      {blocker([W + T * 2, 0.1, D + T * 2], [0, H + 0.2, 0])} {/* ceiling */}
    </group>
  );
}

export function Room({ palette }: { palette: ScenePalette }) {
  return (
    <group>
      {/* the diorama's base slab */}
      <Box
        color={palette.wallShade}
        size={[W + T, SLAB, D + T]}
        position={[-T / 2, -SLAB / 2 - 0.05, -T / 2]}
        castShadow={false}
        roughness={0.9}
      />
      <Planks palette={palette} />

      <WindowWall palette={palette} />
      <Poster x={-1.8} palette={palette} tint="primary" />
      <Poster x={2.2} palette={palette} tint="accent" />

      {/* left wall */}
      <Box
        color={palette.wall}
        size={[T, H, D + T]}
        position={[-W / 2 - T / 2, H / 2, -T / 2]}
        roughness={0.95}
      />
      <Box
        color={palette.wallShade}
        size={[T + 0.05, 0.07, D + T + 0.05]}
        position={[-W / 2 - T / 2, H + 0.035, -T / 2]}
      />

      {/* skirting boards */}
      <Box color={palette.wallShade} size={[W, 0.16, 0.05]} position={[0, 0.08, -D / 2 + 0.025]} />
      <Box color={palette.wallShade} size={[0.05, 0.16, D]} position={[-W / 2 + 0.025, 0.08, 0]} />

      <ShadowEnclosure />
    </group>
  );
}
