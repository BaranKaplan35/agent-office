/**
 * The shared corners of the office (all built from primitives): the lounge under
 * the right-hand window, the printer and water cooler along the open right edge,
 * and a whiteboard on a rolling stand near the front.
 */
import {
  ARMCHAIR,
  LOUNGE_RUG,
  PRINTER,
  SIDE_TABLE,
  SOFA,
  WATER_COOLER,
  WHITEBOARD,
} from '../props';
import { mixHex } from '../scene/daylight';
import type { ScenePalette } from '../scene/palette';
import { Box, Cyl } from './parts';

const GRAPHITE = '#2a2f36';
// A small shared set of colours: parts in the same colour merge into one mesh.
const OFF_WHITE = '#eef0f2';
const LIGHT_GREY = '#ccd2da';
const PAPER = '#f7f5ef';
const WATER_BLUE = '#3b82f6';

/** A sofa-like seat facing local +Z: base, cushions, back and arms. */
function Couch({
  palette,
  length,
  depth,
  seats,
}: {
  palette: ScenePalette;
  length: number;
  depth: number;
  seats: number;
}) {
  const cover = mixHex(palette.primary, palette.surface, 0.5);
  const cushion = mixHex(cover, '#ffffff', 0.12);
  const inner = length - 0.4;
  const seatW = inner / seats;
  return (
    <group>
      {[-1, 1].map((sx) =>
        [-1, 1].map((sz) => (
          <Cyl
            key={`${sx}${sz}`}
            radius={0.035}
            height={0.1}
            position={[sx * (length / 2 - 0.12), 0.05, sz * (depth / 2 - 0.12)]}
            color={palette.woodDark}
            segments={6}
          />
        )),
      )}
      <Box color={cover} size={[length, 0.2, depth]} radius={0.05} position={[0, 0.2, 0]} />
      {Array.from({ length: seats }, (_, i) => (
        <Box
          key={i}
          color={cushion}
          size={[seatW - 0.03, 0.13, depth - 0.25]}
          radius={0.05}
          position={[-inner / 2 + seatW * (i + 0.5), 0.36, 0.08]}
        />
      ))}
      <Box
        color={cover}
        size={[length, 0.5, 0.2]}
        radius={0.06}
        position={[0, 0.52, -depth / 2 + 0.1]}
      />
      {[-1, 1].map((s) => (
        <Box
          key={s}
          color={cover}
          size={[0.2, 0.42, depth]}
          radius={0.06}
          position={[s * (length / 2 - 0.1), 0.4, 0]}
        />
      ))}
    </group>
  );
}

export function LoungeCorner({ palette }: { palette: ScenePalette }) {
  const rug = mixHex(palette.rug, palette.accent, 0.25);
  return (
    <group>
      <Box
        color={rug}
        size={[LOUNGE_RUG.width, 0.02, LOUNGE_RUG.depth]}
        radius={0.01}
        position={[LOUNGE_RUG.x, 0.01, LOUNGE_RUG.z]}
        castShadow={false}
      />
      <group position={[SOFA.x, 0, SOFA.z]}>
        <Couch palette={palette} length={SOFA.length} depth={SOFA.depth} seats={2} />
        {/* a throw pillow in the accent colour */}
        <Box
          color={palette.accent}
          size={[0.32, 0.3, 0.1]}
          radius={0.05}
          position={[SOFA.length / 2 - 0.42, 0.55, -SOFA.depth / 2 + 0.28]}
          rotation={[-0.25, 0.2, 0.1]}
        />
      </group>
      <group position={[ARMCHAIR.x, 0, ARMCHAIR.z]} rotation={[0, -Math.PI / 2, 0]}>
        <Couch palette={palette} length={ARMCHAIR.size} depth={ARMCHAIR.size} seats={1} />
      </group>
      {/* side table with a stack of books */}
      <group position={[SIDE_TABLE.x, 0, SIDE_TABLE.z]}>
        <Cyl
          radius={SIDE_TABLE.radius}
          height={0.04}
          position={[0, 0.5, 0]}
          color={palette.wood}
          segments={20}
        />
        <Cyl radius={0.04} height={0.48} position={[0, 0.24, 0]} color={palette.woodDark} />
        <Cyl radius={0.16} height={0.02} position={[0, 0.01, 0]} color={palette.woodDark} />
        <Box color={palette.primary} size={[0.24, 0.05, 0.17]} position={[0, 0.545, 0]} />
        <Box
          color={palette.accent}
          size={[0.21, 0.05, 0.15]}
          position={[0.01, 0.595, 0]}
          rotation={[0, 0.3, 0]}
        />
      </group>
    </group>
  );
}

export function Printer({ palette }: { palette: ScenePalette }) {
  return (
    // local +X faces into the room (-X in the world)
    <group position={[PRINTER.x, 0, PRINTER.z]} rotation={[0, Math.PI, 0]}>
      <Box
        color={palette.woodDark}
        size={[PRINTER.depth, 0.62, PRINTER.length]}
        radius={0.02}
        position={[0, 0.31, 0]}
      />
      <Box
        color={mixHex(palette.wood, palette.woodDark, 0.4)}
        size={[0.02, 0.24, PRINTER.length - 0.12]}
        position={[PRINTER.depth / 2, 0.42, 0]}
      />
      <Box color={OFF_WHITE} size={[0.5, 0.26, 0.66]} radius={0.03} position={[-0.02, 0.75, 0]} />
      <Box color={LIGHT_GREY} size={[0.44, 0.05, 0.6]} radius={0.02} position={[-0.04, 0.9, 0]} />
      {/* output tray with a few printed pages */}
      <Box color={LIGHT_GREY} size={[0.2, 0.02, 0.4]} position={[0.3, 0.66, 0]} />
      <Box color={PAPER} size={[0.2, 0.025, 0.3]} position={[0.3, 0.685, 0]} castShadow={false} />
      <Box
        color={palette.success}
        emissive={palette.success}
        emissiveIntensity={1.2}
        size={[0.01, 0.025, 0.025]}
        position={[0.235, 0.82, 0.24]}
        castShadow={false}
      />
      <Box color={GRAPHITE} size={[0.01, 0.06, 0.14]} position={[0.235, 0.8, 0.12]} />
    </group>
  );
}

export function WaterCooler({ palette }: { palette: ScenePalette }) {
  return (
    <group position={[WATER_COOLER.x, 0, WATER_COOLER.z]}>
      <Box color={OFF_WHITE} size={[0.42, 0.9, 0.42]} radius={0.04} position={[0, 0.45, 0]} />
      <Box color={LIGHT_GREY} size={[0.3, 0.06, 0.04]} position={[-0.21, 0.66, 0]} />
      {/* blue and red taps on the room side */}
      <Box color={WATER_BLUE} size={[0.05, 0.05, 0.05]} position={[-0.23, 0.74, -0.07]} />
      <Box color={palette.danger} size={[0.05, 0.05, 0.05]} position={[-0.23, 0.74, 0.07]} />
      <Cyl radius={0.17} height={0.06} position={[0, 0.93, 0]} color={LIGHT_GREY} segments={18} />
      <Cyl
        radius={0.16}
        height={0.42}
        position={[0, 1.17, 0]}
        color="#9fd3f0"
        opacity={0.7}
        roughness={0.15}
        segments={18}
        castShadow={false}
      />
      <Cyl radius={0.06} height={0.05} position={[0, 1.41, 0]} color={WATER_BLUE} segments={10} />
      {/* paper cups on the side */}
      <Cyl radius={0.045} height={0.28} position={[0, 0.66, 0.25]} color={PAPER} segments={10} />
    </group>
  );
}

export function Whiteboard({ palette }: { palette: ScenePalette }) {
  const half = WHITEBOARD.width / 2;
  const ink = [palette.primary, palette.accent, palette.danger];
  return (
    // the writing side faces +X
    <group position={[WHITEBOARD.x, 0, WHITEBOARD.z]}>
      {[-1, 1].map((s) => (
        <group key={s} position={[0, 0, s * (half - 0.05)]}>
          <Box color={palette.metal} size={[0.5, 0.04, 0.05]} position={[0, 0.06, 0]} />
          {[-1, 1].map((w) => (
            <Cyl
              key={w}
              radius={0.03}
              height={0.04}
              position={[w * 0.22, 0.02, 0]}
              rotation={[Math.PI / 2, 0, 0]}
              color={GRAPHITE}
              segments={8}
            />
          ))}
          <Cyl
            radius={0.022}
            height={1.85}
            position={[0, 0.98, 0]}
            color={palette.metal}
            segments={8}
          />
        </group>
      ))}
      <Box
        color={palette.metal}
        size={[0.05, 1.04, WHITEBOARD.width - 0.02]}
        radius={0.015}
        position={[0, 1.35, 0]}
      />
      <Box
        color={PAPER}
        size={[0.02, 0.96, WHITEBOARD.width - 0.1]}
        position={[0.022, 1.35, 0]}
        castShadow={false}
      />
      <Box color={palette.metal} size={[0.1, 0.025, 1.0]} position={[0.05, 0.84, 0]} />
      {/* a little flow chart: three boxes with arrows, and a chart */}
      {[-0.45, 0, 0.45].map((z, i) => (
        <Box
          key={z}
          color={ink[i] as string}
          size={[0.006, 0.16, 0.26]}
          position={[0.035, 1.62, z]}
          castShadow={false}
        />
      ))}
      {[-0.225, 0.225].map((z) => (
        <Box
          key={z}
          color={GRAPHITE}
          size={[0.006, 0.02, 0.14]}
          position={[0.035, 1.62, z]}
          castShadow={false}
        />
      ))}
      {[0.12, 0.22, 0.16, 0.3].map((h, i) => (
        <Box
          key={i}
          color={i === 3 ? palette.success : palette.primary}
          size={[0.006, h, 0.07]}
          position={[0.035, 1.05 + h / 2, -0.5 + i * 0.11]}
          castShadow={false}
        />
      ))}
      <Box
        color={GRAPHITE}
        size={[0.006, 0.015, 0.5]}
        position={[0.035, 1.2, 0.35]}
        rotation={[0.35, 0, 0]}
        castShadow={false}
      />
    </group>
  );
}
