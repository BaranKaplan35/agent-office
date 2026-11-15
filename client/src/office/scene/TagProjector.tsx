import { useFrame } from '@react-three/fiber';
import { useMemo, type RefObject } from 'react';
import { Vector3 } from 'three';
import type { V3 } from '../models/parts';

export interface TagAnchor {
  id: string;
  /** World-space point the tag hangs from. */
  position: V3;
}

/**
 * Keeps ordinary DOM name tags glued to 3D points: every frame it projects each
 * anchor through the camera and writes the screen position straight to the
 * element (no React state, no re-render). The tags live in the normal React tree,
 * so they are real, focusable buttons and can use the app's context.
 */
export function TagProjector({
  anchors,
  registry,
}: {
  anchors: ReadonlyArray<TagAnchor>;
  registry: RefObject<Map<string, HTMLElement>>;
}) {
  const point = useMemo(() => new Vector3(), []);

  useFrame(({ camera, size }) => {
    for (const anchor of anchors) {
      const el = registry.current.get(anchor.id);
      if (!el) continue;
      point.set(...anchor.position).project(camera);
      const x = (point.x * 0.5 + 0.5) * size.width;
      const y = (-point.y * 0.5 + 0.5) * size.height;
      el.style.transform = `translate(${x.toFixed(1)}px, ${y.toFixed(1)}px)`;
      el.style.visibility = point.z > 1 ? 'hidden' : 'visible';
    }
  });

  return null;
}
