/**
 * Primitive building blocks for every model in the office. Nothing is loaded
 * from outside: all furniture, plants and props are composed from these.
 */
import { RoundedBox } from '@react-three/drei';
import { useLayoutEffect, useRef } from 'react';
import { Color, DoubleSide, Object3D, type InstancedMesh } from 'three';

export type V3 = [number, number, number];

interface MaterialProps {
  color: string;
  roughness?: number;
  metalness?: number;
  emissive?: string;
  emissiveIntensity?: number;
  /** Faceted shading (organic low-poly look). */
  flat?: boolean;
  opacity?: number;
  depthWrite?: boolean;
  doubleSide?: boolean;
}

interface PlacementProps {
  position?: V3;
  rotation?: V3;
  castShadow?: boolean;
  receiveShadow?: boolean;
}

function Material({
  color,
  roughness = 0.85,
  metalness = 0,
  emissive,
  emissiveIntensity = 1,
  flat = false,
  opacity = 1,
  depthWrite,
  doubleSide,
}: MaterialProps) {
  return (
    <meshStandardMaterial
      color={color}
      roughness={roughness}
      metalness={metalness}
      emissive={emissive ?? '#000000'}
      emissiveIntensity={emissive ? emissiveIntensity : 0}
      flatShading={flat}
      transparent={opacity < 1}
      opacity={opacity}
      depthWrite={depthWrite}
      side={doubleSide ? DoubleSide : undefined}
    />
  );
}

type BoxProps = MaterialProps & PlacementProps & { size: V3; radius?: number };

export function Box({
  size,
  radius = 0,
  position,
  rotation,
  castShadow = true,
  receiveShadow = true,
  ...material
}: BoxProps) {
  const r = Math.min(radius, Math.min(...size) / 2 - 0.001);
  if (r > 0.002) {
    return (
      <RoundedBox
        args={size}
        radius={r}
        smoothness={3}
        position={position}
        rotation={rotation}
        castShadow={castShadow}
        receiveShadow={receiveShadow}
      >
        <Material {...material} />
      </RoundedBox>
    );
  }
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry args={size} />
      <Material {...material} />
    </mesh>
  );
}

type CylProps = MaterialProps &
  PlacementProps & {
    /** One radius, or [top, bottom]. */
    radius: number | [number, number];
    height: number;
    segments?: number;
    openEnded?: boolean;
  };

export function Cyl({
  radius,
  height,
  segments = 14,
  openEnded,
  position,
  rotation,
  castShadow = true,
  receiveShadow = true,
  ...material
}: CylProps) {
  const [top, bottom] = typeof radius === 'number' ? [radius, radius] : radius;
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <cylinderGeometry args={[top, bottom, height, segments, 1, openEnded]} />
      <Material {...material} doubleSide={openEnded || material.doubleSide} />
    </mesh>
  );
}

type BallProps = MaterialProps & PlacementProps & { radius: number; detail?: number; scale?: V3 };

/** Low-poly sphere (icosahedron). */
export function Ball({
  radius,
  detail = 1,
  scale,
  position,
  rotation,
  castShadow = true,
  receiveShadow = true,
  ...material
}: BallProps) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      scale={scale}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <icosahedronGeometry args={[radius, detail]} />
      <Material flat {...material} />
    </mesh>
  );
}

type ConeProps = MaterialProps &
  PlacementProps & { radius: number; height: number; segments?: number };

export function Cone({
  radius,
  height,
  segments = 6,
  position,
  rotation,
  castShadow = true,
  receiveShadow = true,
  ...material
}: ConeProps) {
  return (
    <mesh
      position={position}
      rotation={rotation}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <coneGeometry args={[radius, height, segments]} />
      <Material flat {...material} />
    </mesh>
  );
}

export interface InstanceItem {
  position: V3;
  scale: V3;
  color: string;
}

interface InstancedBoxesProps {
  items: ReadonlyArray<InstanceItem>;
  castShadow?: boolean;
  receiveShadow?: boolean;
  roughness?: number;
}

/** Many unit boxes drawn in a single call (floor planks, books …). */
export function InstancedBoxes({
  items,
  castShadow = true,
  receiveShadow = true,
  roughness = 0.9,
}: InstancedBoxesProps) {
  const ref = useRef<InstancedMesh>(null);

  useLayoutEffect(() => {
    const mesh = ref.current;
    if (!mesh) return;
    const dummy = new Object3D();
    const color = new Color();
    items.forEach((item, i) => {
      dummy.position.set(...item.position);
      dummy.scale.set(...item.scale);
      dummy.updateMatrix();
      mesh.setMatrixAt(i, dummy.matrix);
      mesh.setColorAt(i, color.set(item.color));
    });
    mesh.instanceMatrix.needsUpdate = true;
    if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
  }, [items]);

  return (
    <instancedMesh
      // Re-create the mesh when the number of instances changes.
      key={items.length}
      ref={ref}
      args={[undefined, undefined, items.length]}
      castShadow={castShadow}
      receiveShadow={receiveShadow}
    >
      <boxGeometry args={[1, 1, 1]} />
      <meshStandardMaterial roughness={roughness} />
    </instancedMesh>
  );
}

/** Small deterministic PRNG so every office looks the same on every load. */
export function seeded(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
