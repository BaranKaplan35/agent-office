import { useLayoutEffect, useRef, type ReactNode } from 'react';
import type { Group } from 'three';
import { mergeStatic, unmerge } from './batch';

interface Props {
  children: ReactNode;
  /**
   * Re-merge when this changes. Pass something that changes whenever a static
   * child would look different (palette, colours, layout); identity is enough.
   */
  version?: unknown;
}

/**
 * Draws its static children as a few merged meshes (see `batch.ts`). Children
 * marked `userData={{ dynamic: true }}` keep animating normally.
 */
export function StaticBatch({ children, version }: Props) {
  const root = useRef<Group>(null);

  // Runs after the children's own layout effects, so their geometry is final.
  useLayoutEffect(() => {
    const group = root.current;
    if (!group) return;
    const result = mergeStatic(group);
    result.meshes.forEach((m) => group.add(m));
    return () => unmerge(group, result);
  }, [version]);

  return <group ref={root}>{children}</group>;
}
