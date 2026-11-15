import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import type { Mesh } from 'three';
import { seeded } from './parts';

const ROWS = 7;
const SPACING = 0.062;
const TOTAL = ROWS * SPACING;
const SCREEN_HALF_H = 0.21;
const SCREEN_LEFT = -0.33;
/** Lines per second of scroll. */
const SCROLL_SPEED = 0.07;

/**
 * Lines of "text" on a monitor. With `animate` they scroll upwards and fade at the
 * edges, like a program printing output; otherwise they stand still.
 */
export function ScreenLines({ animate, seed = 1 }: { animate: boolean; seed?: number }) {
  const meshes = useRef<Array<Mesh | null>>([]);
  const widths = useMemo(() => {
    const rand = seeded(seed * 97 + 5);
    return Array.from({ length: ROWS }, () => 0.28 + rand() * 0.4);
  }, [seed]);

  const place = (time: number) => {
    for (let i = 0; i < ROWS; i++) {
      const mesh = meshes.current[i];
      if (!mesh) continue;
      const offset = (((i * SPACING + time * SCROLL_SPEED) % TOTAL) + TOTAL) % TOTAL;
      const fade = Math.min(1, Math.min(offset, TOTAL - offset) / (SPACING * 1.1));
      mesh.position.y = SCREEN_HALF_H - 0.02 - offset;
      mesh.scale.y = Math.max(fade, 0.001);
    }
  };

  useLayoutEffect(() => place(0));
  useFrame(({ clock }) => {
    if (animate) place(clock.elapsedTime);
  });

  return (
    <group position={[0, 0.5, 0.025]}>
      {widths.map((w, i) => (
        <mesh
          key={i}
          ref={(m) => {
            meshes.current[i] = m;
          }}
          position={[SCREEN_LEFT + w / 2, 0, 0]}
        >
          <planeGeometry args={[w, 0.028]} />
          <meshBasicMaterial color="#ffffff" transparent opacity={0.78} toneMapped={false} />
        </mesh>
      ))}
    </group>
  );
}
