import { useFrame } from '@react-three/fiber';
import { useLayoutEffect, useMemo, useRef } from 'react';
import { Color, Object3D, type InstancedMesh } from 'three';
import { seeded } from '../random';

const COUNT = 110;
const DURATION = 12;

interface Props {
  /** Starts a burst when it turns true. */
  active: boolean;
  x: number;
  z: number;
  colors: ReadonlyArray<string>;
}

/** A burst of falling paper confetti (one instanced mesh) for when the whole task is approved. */
export function Confetti({ active, x, z, colors }: Props) {
  const mesh = useRef<InstancedMesh>(null);
  const start = useRef<number | null>(null);

  const bits = useMemo(() => {
    const rand = seeded(2026);
    return Array.from({ length: COUNT }, (_, i) => ({
      dx: (rand() - 0.5) * 6.4,
      dz: (rand() - 0.5) * 6.4,
      y0: 3 + rand() * 1.6,
      fall: 0.9 + rand() * 0.8,
      delay: rand() * 1.6,
      sway: 0.2 + rand() * 0.5,
      spin: 2 + rand() * 5,
      phase: rand() * Math.PI * 2,
      color: colors[i % colors.length] as string,
    }));
  }, [colors]);

  useLayoutEffect(() => {
    const m = mesh.current;
    if (!m) return;
    const c = new Color();
    bits.forEach((b, i) => m.setColorAt(i, c.set(b.color)));
    if (m.instanceColor) m.instanceColor.needsUpdate = true;
  }, [bits]);

  const dummy = useMemo(() => new Object3D(), []);

  useFrame(({ clock }) => {
    const m = mesh.current;
    if (!m) return;
    if (!active) {
      start.current = null;
      m.visible = false;
      return;
    }
    start.current ??= clock.elapsedTime;
    const t = clock.elapsedTime - start.current;
    m.visible = t < DURATION;
    if (!m.visible) return;

    bits.forEach((b, i) => {
      const age = Math.max(0, t - b.delay);
      const y = Math.max(0.03, b.y0 - b.fall * age);
      const falling = y > 0.031;
      dummy.position.set(
        x + b.dx + (falling ? Math.sin(age * 2 + b.phase) * b.sway : 0),
        y,
        z + b.dz,
      );
      dummy.rotation.set(
        falling ? age * b.spin : Math.PI / 2,
        falling ? age * b.spin * 0.7 : b.phase,
        0,
      );
      dummy.scale.setScalar(age > 0 ? 1 : 0.001);
      dummy.updateMatrix();
      m.setMatrixAt(i, dummy.matrix);
    });
    m.instanceMatrix.needsUpdate = true;
  });

  return (
    <instancedMesh
      ref={mesh}
      args={[undefined, undefined, COUNT]}
      frustumCulled={false}
      visible={false}
    >
      <boxGeometry args={[0.09, 0.012, 0.055]} />
      <meshBasicMaterial toneMapped={false} />
    </instancedMesh>
  );
}
