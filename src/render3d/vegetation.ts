import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE } from '../data/balance';
import { T } from '../data/terrain';
import { hash2 } from '../core/rng';
import type { GameMap } from '../sim/grid';
import type { TerrainLayer } from '../render/terrainLayer';
import { chunkedInstances } from './instancing';
import { bananaLeafTexture, barkTexture, foliageTexture, frondTexture, grassTexture } from './textures';

/** Terrain canvas pixels per world unit (the terrain layer paints at 2×). */
const PX_PER_UNIT = 2;

/** A drooping leaf along +x from the origin, `length` long. */
function leaf(length: number, width: number, droop: number, segs = 6): THREE.BufferGeometry {
  const g = new THREE.PlaneGeometry(length, width, segs, 1);
  g.translate(length / 2, 0, 0);
  g.rotateX(-Math.PI / 2);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getX(i) / length;
    p.setY(i, p.getY(i) + 0.18 * length * t - droop * t * t);
  }
  g.computeVertexNormals();
  return g;
}

/** A crown of fronds round the top of a unit-height trunk. */
function crown(n: number, length: number, width: number, droop: number, seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const f = leaf(length * (0.85 + hash2(i, seed, 1) * 0.3), width, droop * (0.8 + hash2(i, seed, 2) * 0.5));
    f.rotateY((i / n) * Math.PI * 2 + hash2(i, seed, 3) * 0.4);
    parts.push(f);
  }
  const g = mergeGeometries(parts)!;
  g.translate(0, 1, 0);
  return g;
}

/** A rounded leafy mass made of lumpy spheres. */
function canopyBlob(seed: number, lumps: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < lumps; i++) {
    const s = new THREE.IcosahedronGeometry(0.34 + hash2(i, seed, 1) * 0.14, i === 0 ? 1 : 0);
    const p = s.attributes.position;
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k));
      v.multiplyScalar(0.85 + hash2(k, i + seed, 2) * 0.3);
      p.setXYZ(k, v.x, v.y * 0.75, v.z);
    }
    const a = (i / lumps) * Math.PI * 2;
    const r = i === 0 ? 0 : 0.28;
    s.translate(Math.cos(a) * r, i === 0 ? 0.15 : hash2(i, seed, 3) * 0.12, Math.sin(a) * r);
    parts.push(s);
  }
  const g = mergeGeometries(parts.map((p) => (p.index ? p.toNonIndexed() : p)))!;
  g.computeVertexNormals();
  return g;
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], shadow = true, setup?: (m: THREE.InstancedMesh) => void): THREE.Group {
  return chunkedInstances(geo, mat, matrices, { castShadow: shadow, setup });
}

const tmp = new THREE.Object3D();
function mat4(x: number, y: number, z: number, rotY: number, sx: number, sy: number, sz: number, tiltX = 0, tiltZ = 0): THREE.Matrix4 {
  tmp.position.set(x, y, z);
  tmp.rotation.set(tiltX, rotY, tiltZ);
  tmp.scale.set(sx, sy, sz);
  tmp.updateMatrix();
  return tmp.matrix.clone();
}

/**
 * Vegetation for the whole map: coconut palms and broadleaf trees where the
 * terrain layer grows them, banana plants by the houses, bushes along the
 * hedgerows and tufts of grass across the open ground. Tree crowns are a
 * separate, slightly see-through group so they can be drawn over the troops.
 */
export function buildVegetation(map: GameMap, terrain: TerrainLayer): { ground: THREE.Group; crowns: THREE.Group } {
  const ground = new THREE.Group();
  const crowns = new THREE.Group();
  const trunks: THREE.Matrix4[] = [];
  const palmCrowns: THREE.Matrix4[][] = [[], [], []];
  const broadTrunks: THREE.Matrix4[] = [];
  const broadCrowns: THREE.Matrix4[][] = [[], []];
  const bananas: THREE.Matrix4[] = [];
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      for (const tree of terrain.treesOf(tx, ty)) {
        const x = tree.x / PX_PER_UNIT;
        const z = tree.y / PX_PER_UNIT;
        const r = tree.r / PX_PER_UNIT;
        const h = (i: number) => hash2(tree.seed, i, 777);
        if (tree.kind === 'palm') {
          const height = 22 + h(1) * 12;
          const lean = (h(2) - 0.5) * 0.22;
          const lean2 = (h(3) - 0.5) * 0.22;
          trunks.push(mat4(x, 0, z, tree.turn, height, height, height, lean, lean2));
          palmCrowns[Math.floor(h(4) * 3)].push(mat4(x, 0, z, tree.turn, (r / 0.55) * 1.25, height, (r / 0.55) * 1.25, lean, lean2));
        } else if (tree.kind === 'broad') {
          const height = 16 + h(1) * 8;
          broadTrunks.push(mat4(x, 0, z, tree.turn, height * 0.7, height * 0.7, height * 0.7));
          broadCrowns[Math.floor(h(4) * 2)].push(mat4(x, height * 0.62, z, tree.turn, r * 2, r * 1.5, r * 2));
        } else {
          bananas.push(mat4(x, 0, z, tree.turn, 9 + h(1) * 3, 7 + h(2) * 2, 9 + h(1) * 3));
        }
      }
    }
  }

  const bark = new THREE.MeshStandardMaterial({ map: barkTexture(), roughness: 0.95 });
  const trunkGeo = new THREE.CylinderGeometry(0.03, 0.05, 1, 7, 1);
  trunkGeo.translate(0, 0.5, 0);
  ground.add(instanced(trunkGeo, bark, trunks));
  const broadTrunkGeo = new THREE.CylinderGeometry(0.06, 0.1, 1, 6, 1);
  broadTrunkGeo.translate(0, 0.5, 0);
  ground.add(instanced(broadTrunkGeo, bark, broadTrunks));

  // Crowns: alpha-cut leaves, a little see-through, drawn after the troops.
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8, transparent: true, opacity: 0.9 });
  const frondDepth = new THREE.MeshDepthMaterial({ map: frondTexture(), alphaTest: 0.35, depthPacking: THREE.RGBADepthPacking });
  palmCrowns.forEach((list, v) => {
    if (!list.length) return;
    crowns.add(
      instanced(crown(9 + v, 0.55, 0.2, 0.32, 40 + v), frondMat, list, true, (m) => {
        m.customDepthMaterial = frondDepth;
        m.renderOrder = 2;
      }),
    );
  });
  const leafMat = new THREE.MeshStandardMaterial({ map: foliageTexture(), roughness: 0.85, transparent: true, opacity: 0.9 });
  broadCrowns.forEach((list, v) => {
    if (!list.length) return;
    crowns.add(instanced(canopyBlob(60 + v, 5), leafMat, list, true, (m) => (m.renderOrder = 2)));
  });
  if (bananas.length) {
    const bananaMat = new THREE.MeshStandardMaterial({ map: bananaLeafTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75 });
    const g = crown(6, 1, 0.38, 0.5, 90);
    g.scale(1, 0.6, 1);
    const depth = new THREE.MeshDepthMaterial({ map: bananaLeafTexture(), alphaTest: 0.4, depthPacking: THREE.RGBADepthPacking });
    ground.add(instanced(g, bananaMat, bananas, true, (m) => (m.customDepthMaterial = depth)));
  }

  // Bushes along the hedgerows.
  const bushes: THREE.Matrix4[] = [];
  const grass: THREE.Matrix4[] = [];
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const t = map.get(tx, ty);
      if (t === T.Hedge) {
        for (let i = 0; i < 4; i++) {
          const s = 6 + hash2(tx, ty, 40 + i) * 4;
          bushes.push(mat4(tx * TILE + 3 + hash2(tx, ty, 50 + i) * 10, s * 0.25, ty * TILE + 3 + hash2(tx, ty, 60 + i) * 10, hash2(tx, ty, 70 + i) * 6, s, s * 0.8, s));
        }
      } else if (t === T.Open || t === T.Jungle) {
        const n = t === T.Jungle ? 3 : hash2(tx, ty, 80) < 0.55 ? 2 : 0;
        for (let i = 0; i < n; i++) {
          const s = 3 + hash2(tx, ty, 90 + i) * 3;
          grass.push(mat4(tx * TILE + hash2(tx, ty, 100 + i) * TILE, 0, ty * TILE + hash2(tx, ty, 110 + i) * TILE, hash2(tx, ty, 120 + i) * 3, s, s * 0.8, s));
        }
      }
    }
  }
  if (bushes.length) ground.add(instanced(canopyBlob(20, 4), new THREE.MeshStandardMaterial({ map: foliageTexture(), roughness: 0.9, color: 0xb8c8a8 }), bushes));
  // Grass is left to the ground painting: seen from above, 3D tufts read as clutter.
  if (grass.length && false) {
    const blade = new THREE.PlaneGeometry(1, 1);
    blade.translate(0, 0.5, 0);
    const cross = mergeGeometries([blade, blade.clone().rotateY(Math.PI / 2)])!;
    ground.add(instanced(cross, new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }), grass, false));
  }
  return { ground, crowns };
}
