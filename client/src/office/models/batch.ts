/**
 * Static batching: the office is built from hundreds of small primitives, and
 * every mesh costs a draw call (two with shadows). Parts that never move are
 * merged here into one mesh per distinct material, which cuts the draw calls
 * several times over while the scene code stays a readable tree of primitives.
 *
 * Anything that moves or changes on its own (monitors, clock hands, faces …) is
 * marked `userData.dynamic` and left alone, together with its whole subtree.
 */
import { Mesh, type BufferGeometry, type Material, type Object3D, Matrix4 } from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** Properties that decide whether two materials draw identically. */
export function materialKey(material: Material): string {
  const m = material as Material & {
    color?: { getHexString(): string };
    emissive?: { getHexString(): string };
    emissiveIntensity?: number;
    roughness?: number;
    metalness?: number;
    flatShading?: boolean;
    toneMapped?: boolean;
    map?: { uuid: string } | null;
  };
  return [
    m.type,
    m.color?.getHexString(),
    m.emissive?.getHexString(),
    m.emissiveIntensity,
    m.roughness,
    m.metalness,
    m.flatShading,
    m.transparent,
    m.opacity,
    m.side,
    m.depthWrite,
    m.colorWrite,
    m.toneMapped,
    m.vertexColors,
    m.map?.uuid ?? '',
  ].join('|');
}

export interface MergeResult {
  /** The merged meshes, in the root's local space (add them to the root). */
  meshes: Mesh[];
  /** The originals that were merged; they were hidden and can be shown again. */
  hidden: Object3D[];
}

/** Position + normal only, never indexed, so every primitive merges with every other. */
function prepare(geometry: BufferGeometry, matrix: Matrix4): BufferGeometry {
  const g = geometry.index ? geometry.toNonIndexed() : geometry.clone();
  for (const name of Object.keys(g.attributes)) {
    if (name !== 'position' && name !== 'normal') g.deleteAttribute(name);
  }
  g.clearGroups();
  g.applyMatrix4(matrix);
  if (!g.attributes.normal) g.computeVertexNormals();
  return g;
}

/**
 * Merge every visible, static mesh under `root` (single-material meshes only).
 * The originals are hidden, not removed: React still owns them, and pointer
 * events still reach them.
 */
export function mergeStatic(root: Object3D): MergeResult {
  root.updateWorldMatrix(true, true);
  const toLocal = new Matrix4().copy(root.matrixWorld).invert();
  const buckets = new Map<
    string,
    { material: Material; cast: boolean; receive: boolean; geometries: BufferGeometry[] }
  >();
  const hidden: Object3D[] = [];

  const visit = (object: Object3D, isRoot: boolean) => {
    if (!isRoot && (object.userData.dynamic || !object.visible)) return;
    const mesh = object as Mesh;
    if (
      mesh.isMesh &&
      !(mesh as { isInstancedMesh?: boolean }).isInstancedMesh &&
      !Array.isArray(mesh.material)
    ) {
      const material = mesh.material as Material;
      const key = `${materialKey(material)}|${mesh.castShadow}|${mesh.receiveShadow}`;
      let bucket = buckets.get(key);
      if (!bucket) {
        bucket = {
          material,
          cast: mesh.castShadow,
          receive: mesh.receiveShadow,
          geometries: [],
        };
        buckets.set(key, bucket);
      }
      const matrix = new Matrix4().multiplyMatrices(toLocal, mesh.matrixWorld);
      bucket.geometries.push(prepare(mesh.geometry, matrix));
      hidden.push(mesh);
    }
    for (const child of object.children) visit(child, false);
  };
  visit(root, true);

  const meshes: Mesh[] = [];
  for (const bucket of buckets.values()) {
    const merged = mergeGeometries(bucket.geometries, false);
    bucket.geometries.forEach((g) => g.dispose());
    if (!merged) continue;
    const mesh = new Mesh(merged, bucket.material.clone());
    mesh.castShadow = bucket.cast;
    mesh.receiveShadow = bucket.receive;
    mesh.userData.dynamic = true; // never merge a merge
    mesh.userData.batched = true;
    meshes.push(mesh);
  }
  for (const object of hidden) object.visible = false;
  return { meshes, hidden };
}

/** Undo `mergeStatic`: show the originals and free the merged meshes. */
export function unmerge(root: Object3D, result: MergeResult): void {
  for (const mesh of result.meshes) {
    root.remove(mesh);
    mesh.geometry.dispose();
    (mesh.material as Material).dispose();
  }
  for (const object of result.hidden) object.visible = true;
}
