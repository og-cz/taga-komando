import * as THREE from 'three';

/** World units per culling chunk (16 tiles). */
const CHUNK = 256;

/**
 * Many copies of one object, split by map chunk into instanced meshes with
 * their own bounds, so the GPU only draws the chunks the camera can see.
 * `setup` is applied to each mesh (render order, depth material...).
 */
export function chunkedInstances(
  geo: THREE.BufferGeometry,
  mat: THREE.Material,
  matrices: readonly THREE.Matrix4[],
  opts: { castShadow?: boolean; setup?: (m: THREE.InstancedMesh) => void } = {},
): THREE.Group {
  const group = new THREE.Group();
  const buckets = new Map<number, THREE.Matrix4[]>();
  for (const m of matrices) {
    const key = Math.floor(m.elements[12] / CHUNK) * 1000 + Math.floor(m.elements[14] / CHUNK);
    let list = buckets.get(key);
    if (!list) buckets.set(key, (list = []));
    list.push(m);
  }
  for (const list of buckets.values()) {
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((x, i) => mesh.setMatrixAt(i, x));
    mesh.castShadow = opts.castShadow ?? true;
    mesh.receiveShadow = true;
    mesh.computeBoundingSphere();
    mesh.frustumCulled = true;
    opts.setup?.(mesh);
    group.add(mesh);
  }
  return group;
}
