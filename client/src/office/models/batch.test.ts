import {
  BoxGeometry,
  Group,
  InstancedMesh,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  SphereGeometry,
} from 'three';
import { describe, expect, it } from 'vitest';
import { materialKey, mergeStatic, unmerge } from './batch';

const wood = () => new MeshStandardMaterial({ color: '#a0703c', roughness: 0.8 });

function scene() {
  const root = new Group();
  root.position.set(10, 0, 0);
  const a = new Mesh(new BoxGeometry(1, 1, 1), wood());
  a.position.set(1, 0, 0);
  const b = new Mesh(new SphereGeometry(0.5), wood());
  b.position.set(0, 2, 0);
  const shelf = new Group();
  shelf.position.set(0, 0, 3);
  const c = new Mesh(new BoxGeometry(1, 1, 1), wood());
  shelf.add(c);
  const glass = new Mesh(new BoxGeometry(1, 1, 1), new MeshBasicMaterial({ color: '#88ccff' }));
  const screen = new Group();
  screen.userData.dynamic = true;
  screen.add(new Mesh(new BoxGeometry(1, 1, 1), wood()));
  const lines = new InstancedMesh(new BoxGeometry(1, 1, 1), wood(), 3);
  root.add(a, b, shelf, glass, screen, lines);
  return { root, a, b, c, glass, screen, lines };
}

describe('materialKey', () => {
  it('matches materials that draw the same, separates those that do not', () => {
    expect(materialKey(wood())).toBe(materialKey(wood()));
    expect(materialKey(wood())).not.toBe(
      materialKey(new MeshStandardMaterial({ color: '#a0703c', roughness: 0.5 })),
    );
    expect(materialKey(wood())).not.toBe(materialKey(new MeshBasicMaterial({ color: '#a0703c' })));
  });
});

describe('mergeStatic', () => {
  it('merges static meshes per material and hides the originals', () => {
    const { root, a, b, c, glass, screen, lines } = scene();
    const result = mergeStatic(root);
    expect(result.meshes).toHaveLength(2); // wood + glass
    expect(result.hidden).toEqual(expect.arrayContaining([a, b, c, glass]));
    expect(result.hidden).toHaveLength(4);
    for (const o of [a, b, c, glass]) expect(o.visible).toBe(false);
    // dynamic subtrees and instanced meshes are left alone
    expect(screen.children[0]!.visible).toBe(true);
    expect(lines.visible).toBe(true);
  });

  it('bakes each part into the root’s local space', () => {
    const { root } = scene();
    const { meshes } = mergeStatic(root);
    const woodMesh = meshes.find((m) => (m.material as MeshStandardMaterial).roughness === 0.8)!;
    woodMesh.geometry.computeBoundingBox();
    const box = woodMesh.geometry.boundingBox!;
    // a: x 0.5…1.5 · b: y up to 2.5 · c: z up to 3.5 (root offset of 10 is not baked in)
    expect(box.max.x).toBeCloseTo(1.5, 5);
    expect(box.max.y).toBeCloseTo(2.5, 5);
    expect(box.max.z).toBeCloseTo(3.5, 5);
    expect(box.min.x).toBeCloseTo(-0.5, 5);
  });

  it('can be undone', () => {
    const { root, a } = scene();
    const result = mergeStatic(root);
    result.meshes.forEach((m) => root.add(m));
    unmerge(root, result);
    expect(a.visible).toBe(true);
    expect(root.children.some((o) => o.userData.batched)).toBe(false);
  });
});
