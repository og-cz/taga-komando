import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { SimplifyModifier } from 'three/examples/jsm/modifiers/SimplifyModifier.js';

/**
 * Imported 3D models (glTF), listed in assets/models/manifest.json: for each,
 * its file, its longest side in world units, how much of its detail to keep
 * for the battlefield (models made for close-ups are simplified on load to a
 * budget an RTS can afford in numbers) and where it comes from. A model is
 * flattened to one geometry and one material, standing on y = 0 and centred,
 * ready to instance. Anything that has not loaded, or failed to, is simply
 * missing: callers draw their own stand-in instead.
 */
export interface ModelEntry {
  id: string;
  file: string;
  /** Longest side, in world units, once scaled. */
  length: number;
  /** Fraction of the vertices to keep (1 = as authored). */
  keep?: number;
  source: string;
}

export interface Model {
  geometry: THREE.BufferGeometry;
  material: THREE.Material;
}

const DIR = 'assets/models/';
const models = new Map<string, Model>();
let loading: Promise<void> | null = null;
const listeners = new Set<() => void>();

/** A model ready to instance, or null if it is not (yet) available. */
export function model(id: string): Model | null {
  return models.get(id) ?? null;
}

/** Call `fn` whenever more models have finished loading; returns a function to stop. */
export function onModelsLoaded(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function loadOne(loader: GLTFLoader, e: ModelEntry): Promise<void> {
  const gltf = await loader.loadAsync(DIR + e.file);
  gltf.scene.updateMatrixWorld(true);
  const parts: THREE.BufferGeometry[] = [];
  let material: THREE.Material | null = null;
  gltf.scene.traverse((o) => {
    if (!(o instanceof THREE.Mesh)) return;
    const g = (o.geometry as THREE.BufferGeometry).clone();
    g.applyMatrix4(o.matrixWorld);
    // Keep only what every part has, so they merge.
    for (const name of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(name)) g.deleteAttribute(name);
    parts.push(g.index ? g.toNonIndexed() : g);
    material ??= Array.isArray(o.material) ? o.material[0] : o.material;
  });
  if (!parts.length || !material) throw new Error(`no mesh in ${e.file}`);
  let geo = parts.length === 1 ? parts[0] : mergeGeometries(parts)!;
  if (e.keep !== undefined && e.keep < 1) {
    // Weld, then collapse edges down to the budget; UVs are carried along.
    const welded = mergeVertices(geo, 1e-4);
    const target = Math.floor(welded.attributes.position.count * (1 - e.keep));
    geo = new SimplifyModifier().modify(welded, target);
    geo.computeVertexNormals();
  }
  // Stand it on the ground, centred, scaled to its length.
  geo.computeBoundingBox();
  const box = geo.boundingBox!;
  const size = box.getSize(new THREE.Vector3());
  const k = e.length / Math.max(size.x, size.y, size.z);
  geo.translate(-(box.min.x + box.max.x) / 2, -box.min.y, -(box.min.z + box.max.z) / 2);
  geo.scale(k, k, k);
  geo.computeBoundingSphere();
  models.set(e.id, { geometry: geo, material });
}

/** Load the manifest and every model in it (once). Failures are reported and skipped. */
export function preloadModels(): Promise<void> {
  loading ??= (async () => {
    let entries: ModelEntry[] = [];
    try {
      const res = await fetch(DIR + 'manifest.json');
      entries = ((await res.json()) as { models: ModelEntry[] }).models;
    } catch (err) {
      console.warn('no model manifest', err);
      return;
    }
    const loader = new GLTFLoader();
    await Promise.all(
      entries.map((e) =>
        loadOne(loader, e)
          .then(() => listeners.forEach((fn) => fn()))
          .catch((err) => console.warn(`model ${e.id} not loaded`, err)),
      ),
    );
  })();
  return loading;
}
