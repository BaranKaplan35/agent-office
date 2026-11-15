import { mixHex } from '../scene/daylight';
import type { ScenePalette } from '../scene/palette';
import { ROOM } from '../layout';
import { Ball, Box, Cone, Cyl, type V3 } from './parts';

// ------------------------------------------------------------------- plants

export function SmallPlant({
  palette,
  position,
  cactus,
}: {
  palette: ScenePalette;
  position: V3;
  cactus?: boolean;
}) {
  const pot = mixHex(palette.rug, palette.accent, 0.35);
  return (
    <group position={position}>
      <Cyl radius={[0.07, 0.055]} height={0.1} position={[0, 0.05, 0]} color={pot} segments={8} />
      {cactus ? (
        <>
          <Cyl
            radius={0.045}
            height={0.2}
            position={[0, 0.2, 0]}
            color={palette.leaf}
            segments={7}
            flat
          />
          <Cyl
            radius={0.025}
            height={0.09}
            position={[0.07, 0.22, 0]}
            rotation={[0, 0, -0.9]}
            color={palette.leaf}
            segments={6}
            flat
          />
        </>
      ) : (
        <>
          <Ball radius={0.09} detail={0} position={[0, 0.17, 0]} color={palette.leaf} />
          <Ball radius={0.07} detail={0} position={[0.07, 0.14, 0.03]} color={palette.leafDark} />
          <Ball radius={0.06} detail={0} position={[-0.06, 0.15, -0.02]} color={palette.leafDark} />
        </>
      )}
    </group>
  );
}

/** A tall floor plant with pointed leaves. */
export function TallPlant({
  palette,
  position,
  scale = 1,
}: {
  palette: ScenePalette;
  position: V3;
  scale?: number;
}) {
  const pot = mixHex(palette.rug, palette.accent, 0.3);
  const leaves = Array.from({ length: 8 }, (_, i) => {
    const angle = (i / 8) * Math.PI * 2 + 0.3;
    const tilt = 0.28 + (i % 3) * 0.14;
    return { angle, tilt, height: 0.85 + (i % 4) * 0.14 };
  });
  return (
    <group position={position} scale={scale}>
      <Cyl
        radius={[0.3, 0.22]}
        height={0.46}
        position={[0, 0.23, 0]}
        color={pot}
        segments={10}
        flat
      />
      <Cyl
        radius={0.29}
        height={0.03}
        position={[0, 0.45, 0]}
        color={palette.woodDark}
        segments={10}
      />
      {leaves.map(({ angle, tilt, height }, i) => (
        <group key={i} rotation={[0, angle, 0]} position={[0, 0.46, 0]}>
          <group rotation={[0, 0, tilt]}>
            <Cone
              radius={0.13}
              height={height}
              segments={5}
              position={[0, height / 2, 0]}
              color={i % 2 ? palette.leaf : palette.leafDark}
            />
          </group>
        </group>
      ))}
    </group>
  );
}

/** A round, bushy floor plant. */
export function BushPlant({
  palette,
  position,
  scale = 1,
}: {
  palette: ScenePalette;
  position: V3;
  scale?: number;
}) {
  const pot = mixHex(palette.rug, palette.primary, 0.25);
  return (
    <group position={position} scale={scale}>
      <Cyl
        radius={[0.34, 0.25]}
        height={0.42}
        position={[0, 0.21, 0]}
        color={pot}
        segments={9}
        flat
      />
      <Ball radius={0.42} position={[0, 0.78, 0]} color={palette.leaf} />
      <Ball radius={0.3} position={[0.3, 0.7, 0.1]} color={palette.leafDark} />
      <Ball radius={0.28} position={[-0.28, 0.72, -0.12]} color={palette.leafDark} />
      <Ball radius={0.26} position={[0.05, 1.08, 0.02]} color={palette.leaf} />
    </group>
  );
}

// -------------------------------------------------------------- wall clock

/** Shows the scene's time (the real time unless `?hour=` pins it). */
export function WallClock({ palette, hour }: { palette: ScenePalette; hour: number }) {
  const h = ((hour % 12) + 12) % 12;
  const minutes = (hour % 1) * 60;
  const hourAngle = -((h + minutes / 60) / 12) * Math.PI * 2;
  const minuteAngle = -(minutes / 60) * Math.PI * 2;
  const marks = Array.from({ length: 12 }, (_, i) => i);

  return (
    <group position={[-ROOM.width / 2 + 0.04, 2.55, -0.4]} rotation={[0, Math.PI / 2, 0]}>
      <Cyl
        radius={0.42}
        height={0.06}
        rotation={[Math.PI / 2, 0, 0]}
        color={palette.wood}
        segments={32}
      />
      <Cyl
        radius={0.36}
        height={0.07}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0.004]}
        color={palette.surface}
        segments={32}
        castShadow={false}
      />
      {marks.map((i) => {
        const a = (i / 12) * Math.PI * 2;
        const big = i % 3 === 0;
        return (
          <Box
            key={i}
            color={palette.ink}
            size={[big ? 0.03 : 0.018, big ? 0.07 : 0.045, 0.01]}
            position={[Math.sin(a) * 0.3, Math.cos(a) * 0.3, 0.045]}
            rotation={[0, 0, -a]}
            castShadow={false}
          />
        );
      })}
      <group position={[0, 0, 0.055]} rotation={[0, 0, hourAngle]} userData={{ dynamic: true }}>
        <Box
          color={palette.ink}
          size={[0.035, 0.19, 0.012]}
          position={[0, 0.07, 0]}
          castShadow={false}
        />
      </group>
      <group position={[0, 0, 0.065]} rotation={[0, 0, minuteAngle]} userData={{ dynamic: true }}>
        <Box
          color={palette.ink}
          size={[0.025, 0.28, 0.012]}
          position={[0, 0.1, 0]}
          castShadow={false}
        />
      </group>
      <Cyl
        radius={0.03}
        height={0.03}
        rotation={[Math.PI / 2, 0, 0]}
        position={[0, 0, 0.075]}
        color={palette.accent}
        segments={10}
        castShadow={false}
      />
    </group>
  );
}

// ------------------------------------------------------------ pendant lamp

export function PendantLamp({
  palette,
  position,
  glow,
  light,
}: {
  palette: ScenePalette;
  position: V3;
  /** 0–1 from the time of day. */
  glow: number;
  /** Whether this lamp also lights the room (limited by the quality level). */
  light: boolean;
}) {
  const shade = mixHex(palette.surface, palette.accent, 0.25);
  const bulbGlow = 0.35 + glow * 2.4;
  return (
    <group position={position}>
      <Cyl
        radius={0.012}
        height={1.7}
        position={[0, 0.85 + 0.15, 0]}
        color={palette.ink}
        segments={4}
        castShadow={false}
      />
      <Cyl
        radius={[0.1, 0.4]}
        height={0.32}
        position={[0, 0, 0]}
        color={shade}
        segments={20}
        openEnded
      />
      <Ball
        radius={0.11}
        detail={1}
        position={[0, -0.08, 0]}
        color="#fff4d6"
        emissive={palette.lamp}
        emissiveIntensity={bulbGlow}
        castShadow={false}
      />
      {light && (
        <pointLight
          position={[0, -0.25, 0]}
          color={palette.lamp}
          intensity={glow * 22}
          distance={12}
          decay={1.6}
        />
      )}
    </group>
  );
}
