import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Object3D, type InstancedMesh } from 'three';
import { seeded } from './parts';

const ROWS = 7;
const SPACING = 0.062;
const TOTAL = ROWS * SPACING;
const SCREEN_HALF_H = 0.21;
const SCREEN_LEFT = -0.33;
const LINE_H = 0.028;
/** Lines per second of scroll. */
const SCROLL_SPEED = 0.07;

/**
 * Lines of "text" on a monitor, drawn as one instanced mesh. With `animate` they
 * scroll upwards and fade at the edges, like a program printing output;
 * otherwise they stand still.
 */
export function ScreenLines({ animate, seed = 1 }: { animate: boolean; seed?: number }) {
  const mesh = useRef<InstancedMesh>(null);
  const dummy = useMemo(() => new Object3D(), []);
  const widths = useMemo(() => {
    const rand = seeded(seed * 97 + 5);
    return Array.from({ length: ROWS }, () => 0.28 + rand() * 0.4);
  }, [seed]);

  const place = (time: number) => {
    const m = mesh.current;
    if (!m) return;
    for (let i = 0; i < ROWS; i++) {
      const w = widths[i] as number;
      const offset = (((i * SPACING + time * SCROLL_SPEED) % TOTAL) + TOTAL) % TOTAL;
      const fade = Math.min(1, Math.min(offset, TOTAL - offset) / (SPACING * 1.1));
      dummy.position.set(SCREEN_LEFT + w / 2, SCREEN_HALF_H - 0.02 - offset, 0);
      dummy.scale.set(w, LINE_H * Math.max(fade, 0.001), 1);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    }
    m.instanceMatrix.needsUpdate = true;
  };

  useLayoutEffect(() => place(0));
  useFrame(({ clock }) => {
    if (animate) place(clock.elapsedTime);
  });

  return (
    <group position={[0, 0.5, 0.025]}>
      <instancedMesh ref={mesh} args={[undefined, undefined, ROWS]} frustumCulled={false}>
        <planeGeometry args={[1, 1]} />
        <meshBasicMaterial color="#ffffff" transparent opacity={0.78} toneMapped={false} />
      </instancedMesh>
    </group>
  );
}
