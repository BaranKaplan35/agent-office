import { useMemo } from 'react';
import type { ActivityTone } from '../../state/selectors';
import { DESK, HUB_RADIUS, MONITOR_YAW, ROOM } from '../layout';
import { mixHex } from '../scene/daylight';
import type { ScenePalette } from '../scene/palette';
import { SmallPlant } from './Decor';
import { Ball, Box, Cyl, InstancedBoxes, seeded, type InstanceItem, type V3 } from './parts';
import { toneColors } from './tone';

/** Electronics stay dark graphite in both themes. */
const GRAPHITE = '#2a2f36';

// ------------------------------------------------------------------ monitor

const LINE_WIDTHS = [0.5, 0.64, 0.38, 0.58, 0.3, 0.46];

export function Monitor({
  palette,
  tone,
  position,
  yaw = 0,
}: {
  palette: ScenePalette;
  tone: ActivityTone;
  position: V3;
  yaw?: number;
}) {
  const screen = toneColors(palette, tone);
  const lit = tone !== 'muted';
  return (
    <group position={position} rotation={[0, yaw, 0]}>
      <Cyl radius={0.13} height={0.02} position={[0, 0.01, 0]} color={GRAPHITE} segments={20} />
      <Box color={GRAPHITE} size={[0.05, 0.24, 0.04]} position={[0, 0.14, 0]} />
      <Box color={GRAPHITE} size={[0.86, 0.52, 0.045]} radius={0.02} position={[0, 0.5, 0]} />
      <mesh position={[0, 0.5, 0.0235]}>
        <planeGeometry args={[0.78, 0.44]} />
        <meshStandardMaterial
          color="#0f1418"
          emissive={screen.color}
          emissiveIntensity={screen.intensity * (lit ? 0.55 : 1)}
        />
      </mesh>
      {lit &&
        LINE_WIDTHS.map((w, i) => (
          <mesh key={i} position={[-0.33 + (w / 2) * 0.8, 0.66 - i * 0.065, 0.025]}>
            <planeGeometry args={[w * 0.8, 0.028]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.78} toneMapped={false} />
          </mesh>
        ))}
      {/* a status light on the back, so the state is visible from behind too */}
      <Box
        color={screen.color}
        emissive={screen.color}
        emissiveIntensity={screen.intensity * 1.4}
        size={[0.07, 0.07, 0.012]}
        position={[0.32, 0.7, -0.028]}
        castShadow={false}
      />
    </group>
  );
}

// -------------------------------------------------------------------- chair

export function Chair({ palette, color }: { palette: ScenePalette; color: string }) {
  const dark = mixHex(color, '#000000', 0.22);
  return (
    <group position={[0, 0, DESK.chairOffset]}>
      <Box color={color} size={[0.54, 0.09, 0.54]} radius={0.04} position={[0, 0.5, 0]} />
      <Box color={dark} size={[0.52, 0.56, 0.08]} radius={0.04} position={[0, 0.86, 0.28]} />
      <Cyl radius={0.04} height={0.3} position={[0, 0.3, 0]} color={palette.metal} segments={8} />
      {[0, 1, 2, 3, 4].map((i) => (
        <group key={i} rotation={[0, (i * Math.PI * 2) / 5, 0]}>
          <Box color={GRAPHITE} size={[0.3, 0.035, 0.05]} position={[0.15, 0.08, 0]} />
          <Ball radius={0.035} detail={0} position={[0.3, 0.035, 0]} color={GRAPHITE} />
        </group>
      ))}
    </group>
  );
}

// --------------------------------------------------------------------- desk

export interface StationProps {
  palette: ScenePalette;
  agentColor: string;
  tone: ActivityTone;
  monitorSide: 1 | -1;
  withPlant?: boolean;
}

/** A worker's desk with its monitor, props and chair (local +Z = chair side). */
export function Desk({ palette, agentColor, tone, monitorSide, withPlant }: StationProps) {
  const drawer = mixHex(palette.wood, agentColor, 0.45);
  return (
    <group>
      <Box
        color={palette.wood}
        size={[DESK.width, 0.06, DESK.depth]}
        radius={0.025}
        position={[0, 0.75, 0]}
      />
      <Box color={palette.woodDark} size={[0.06, 0.72, 0.9]} position={[-0.93, 0.36, 0]} />
      <Box color={palette.woodDark} size={[0.06, 0.72, 0.9]} position={[0.93, 0.36, 0]} />
      <Box color={palette.woodDark} size={[1.8, 0.4, 0.03]} position={[0, 0.52, -0.42]} />
      {/* drawer unit */}
      <Box
        color={palette.woodDark}
        size={[0.5, 0.55, 0.85]}
        radius={0.02}
        position={[0.62, 0.4, 0]}
      />
      <Box color={drawer} size={[0.46, 0.2, 0.02]} radius={0.01} position={[0.62, 0.55, 0.435]} />
      <Box color={drawer} size={[0.46, 0.2, 0.02]} radius={0.01} position={[0.62, 0.3, 0.435]} />
      {/* the agent's colour: an edge strip towards the hub and a desk mat */}
      <Box color={agentColor} size={[DESK.width, 0.085, 0.04]} position={[0, 0.75, -0.5]} />
      <Box
        color={agentColor}
        size={[0.95, 0.008, 0.46]}
        position={[-0.15, 0.783, 0.14]}
        castShadow={false}
      />

      <Box
        color={palette.metal}
        size={[0.44, 0.02, 0.14]}
        radius={0.008}
        position={[-0.15, 0.8, 0.16]}
      />
      <Box
        color={palette.metal}
        size={[0.06, 0.025, 0.1]}
        radius={0.012}
        position={[0.27, 0.8, 0.16]}
      />
      <Box
        color={palette.surface}
        size={[0.26, 0.012, 0.34]}
        position={[-0.78, 0.786, 0.1]}
        rotation={[0, 0.25, 0]}
      />
      <Cyl
        radius={0.05}
        height={0.09}
        position={[0.72, 0.825, -0.18]}
        color={palette.accent}
        segments={10}
      />

      <Monitor
        palette={palette}
        tone={tone}
        position={[monitorSide * 0.62, 0.78, -0.22]}
        yaw={-monitorSide * MONITOR_YAW}
      />
      {withPlant && <SmallPlant palette={palette} position={[-0.8, 0.78, -0.3]} />}
      <Chair palette={palette} color={agentColor} />
    </group>
  );
}

// ---------------------------------------------------------------- hub desk

/** The coordinator's round hub desk (local +Z = chair side). */
export function HubDesk({ palette, agentColor, tone }: Omit<StationProps, 'monitorSide'>) {
  return (
    <group>
      <Cyl
        radius={HUB_RADIUS}
        height={0.07}
        position={[0, 0.76, 0]}
        color={palette.wood}
        segments={40}
      />
      <Cyl
        radius={0.36}
        height={0.72}
        position={[0, 0.36, 0]}
        color={palette.woodDark}
        segments={16}
      />
      <Cyl
        radius={0.7}
        height={0.05}
        position={[0, 0.025, 0]}
        color={palette.woodDark}
        segments={24}
      />
      {/* glowing hub ring in the coordinator's colour */}
      <mesh position={[0, 0.8, 0]} rotation={[-Math.PI / 2, 0, 0]}>
        <ringGeometry args={[1.12, 1.24, 64]} />
        <meshStandardMaterial
          color={agentColor}
          emissive={agentColor}
          emissiveIntensity={0.85}
          roughness={0.5}
        />
      </mesh>
      {/* outbox tray: assignments leave from here */}
      <Box
        color={palette.surface}
        size={[0.56, 0.05, 0.38]}
        radius={0.015}
        position={[0, 0.825, -0.62]}
      />
      <Box color={palette.wallShade} size={[0.5, 0.012, 0.33]} position={[0, 0.857, -0.62]} />
      <Box
        color="#ffffff"
        size={[0.24, 0.016, 0.16]}
        position={[-0.08, 0.872, -0.62]}
        rotation={[0, 0.12, 0]}
      />
      <Box
        color="#ffffff"
        size={[0.24, 0.016, 0.16]}
        position={[-0.07, 0.888, -0.61]}
        rotation={[0, -0.1, 0]}
      />
      <Monitor palette={palette} tone={tone} position={[-0.78, 0.8, -0.35]} yaw={0.6} />
      <Monitor palette={palette} tone={tone} position={[0.78, 0.8, -0.35]} yaw={-0.6} />
      <Box
        color={palette.metal}
        size={[0.5, 0.02, 0.15]}
        radius={0.008}
        position={[0, 0.81, 0.18]}
      />
      <Cyl
        radius={0.05}
        height={0.09}
        position={[0.95, 0.855, 0.35]}
        color={palette.surface}
        segments={10}
      />
      <SmallPlant palette={palette} position={[-1.0, 0.8, 0.3]} />
      <group position={[0, 0, 0.6]}>
        <Chair palette={palette} color={agentColor} />
      </group>
    </group>
  );
}

// ------------------------------------------------------------ room furniture

export function Rug({ palette, x, z }: { palette: ScenePalette; x: number; z: number }) {
  const inner = mixHex(palette.rug, '#ffffff', 0.22);
  return (
    <group position={[x, 0, z]}>
      <Cyl
        radius={3.15}
        height={0.025}
        position={[0, 0.0125, 0]}
        color={palette.rug}
        segments={56}
        castShadow={false}
      />
      <Cyl
        radius={2.85}
        height={0.03}
        position={[0, 0.015, 0]}
        color={inner}
        segments={56}
        castShadow={false}
      />
    </group>
  );
}

export function Bookshelf({ palette }: { palette: ScenePalette }) {
  const boards = [0.04, 0.62, 1.2, 1.78, 2.34];
  const books = useMemo<InstanceItem[]>(() => {
    const rand = seeded(21);
    const colors = [
      palette.primary,
      palette.accent,
      palette.success,
      palette.warning,
      palette.danger,
      palette.fabric,
      palette.wood,
      palette.surface,
    ];
    const items: InstanceItem[] = [];
    for (const board of boards.slice(0, 4)) {
      let x = -1.1;
      while (x < 1.05) {
        if (rand() < 0.12) {
          x += 0.14; // a gap
          continue;
        }
        const w = 0.05 + rand() * 0.06;
        const h = 0.3 + rand() * 0.2;
        items.push({
          position: [x + w / 2, board + 0.02 + h / 2, 0.02] as V3,
          scale: [w, h, 0.3] as V3,
          color: colors[Math.floor(rand() * colors.length)] as string,
        });
        x += w + 0.008;
      }
    }
    return items;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [palette]);

  return (
    <group position={[-ROOM.width / 2 + 0.27, 0, -3.4]} rotation={[0, Math.PI / 2, 0]}>
      <Box color={palette.wood} size={[0.05, 2.38, 0.5]} position={[-1.2, 1.19, 0]} />
      <Box color={palette.wood} size={[0.05, 2.38, 0.5]} position={[1.2, 1.19, 0]} />
      <Box color={palette.woodDark} size={[2.4, 2.38, 0.03]} position={[0, 1.19, -0.235]} />
      {boards.map((y) => (
        <Box key={y} color={palette.wood} size={[2.4, 0.04, 0.5]} position={[0, y, 0]} />
      ))}
      <InstancedBoxes items={books} />
    </group>
  );
}

export function CoffeeCorner({ palette }: { palette: ScenePalette }) {
  const mugColors = [palette.primary, palette.accent, palette.surface];
  return (
    <group position={[-ROOM.width / 2 + 0.38, 0, 3.0]} rotation={[0, Math.PI / 2, 0]}>
      <Box color={palette.woodDark} size={[2.4, 0.88, 0.7]} radius={0.03} position={[0, 0.44, 0]} />
      <Box
        color={palette.surface}
        size={[2.46, 0.06, 0.76]}
        radius={0.02}
        position={[0, 0.91, 0]}
      />
      {[-0.8, 0, 0.8].map((x) => (
        <group key={x}>
          <Box
            color={palette.wood}
            size={[0.74, 0.7, 0.02]}
            radius={0.01}
            position={[x, 0.44, 0.36]}
          />
          <Box color={palette.accent} size={[0.1, 0.02, 0.025]} position={[x, 0.7, 0.385]} />
        </group>
      ))}

      {/* coffee machine */}
      <group position={[-0.62, 0.94, -0.06]}>
        <Box color={GRAPHITE} size={[0.5, 0.5, 0.4]} radius={0.04} position={[0, 0.25, 0]} />
        <Box
          color={palette.accent}
          size={[0.52, 0.08, 0.42]}
          radius={0.03}
          position={[0, 0.54, 0]}
        />
        <Box color={palette.metal} size={[0.4, 0.03, 0.3]} position={[0, 0.02, 0.06]} />
        <Cyl
          radius={0.075}
          height={0.2}
          position={[0, 0.15, 0.13]}
          color={palette.glass}
          opacity={0.55}
          segments={10}
        />
        <Box
          color={palette.success}
          emissive={palette.success}
          emissiveIntensity={1.4}
          size={[0.05, 0.05, 0.01]}
          position={[0.17, 0.4, 0.205]}
          castShadow={false}
        />
      </group>
      {mugColors.map((c, i) => (
        <group key={c + i} position={[0.1 + i * 0.2, 0.94, 0.08 + (i % 2) * 0.06]}>
          <Cyl radius={0.05} height={0.09} position={[0, 0.045, 0]} color={c} segments={10} />
          <Box color={c} size={[0.03, 0.05, 0.015]} position={[0.062, 0.05, 0]} />
        </group>
      ))}
      <SmallPlant palette={palette} position={[0.95, 0.94, 0.0]} cactus />

      {/* wall shelf with cups */}
      <Box
        color={palette.wood}
        size={[1.7, 0.05, 0.28]}
        radius={0.015}
        position={[0.1, 1.6, -0.2]}
      />
      {[-0.55, -0.3, 0, 0.3, 0.55].map((x, i) => (
        <Cyl
          key={x}
          radius={0.045}
          height={0.085}
          position={[x, 1.67, -0.2]}
          color={mugColors[i % 3] as string}
          segments={10}
        />
      ))}

      {/* stools */}
      {[-0.55, 0.45].map((x, i) => (
        <group key={x} position={[x, 0, 0.95 + i * 0.05]}>
          <Cyl
            radius={0.22}
            height={0.07}
            position={[0, 0.64, 0]}
            color={i === 0 ? palette.accent : palette.primary}
            segments={16}
          />
          <Cyl
            radius={0.03}
            height={0.6}
            position={[0, 0.3, 0]}
            color={palette.metal}
            segments={6}
          />
          <Cyl
            radius={0.17}
            height={0.03}
            position={[0, 0.015, 0]}
            color={palette.metal}
            segments={14}
          />
        </group>
      ))}
    </group>
  );
}
