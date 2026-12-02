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

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], shadow = true, setup?: (m: THREE.InstancedMesh) => void, colors?: THREE.Color[]): THREE.Group {
  return chunkedInstances(geo, mat, matrices, { castShadow: shadow, setup, colors });
}

/** A coconut palm's crown: a full head of long drooping fronds round a few young ones standing up. */
function palmCrown(seed: number): THREE.BufferGeometry {
  const old = crown(14, 0.66, 0.24, 0.5, seed);
  const young = crown(5, 0.42, 0.18, 0.06, seed + 5);
  young.translate(0, 0.01, 0);
  return mergeGeometries([old, young])!;
}

/** A palm trunk, ringed and gently bowed, one unit tall. */
function palmTrunk(): THREE.BufferGeometry {
  const g = new THREE.CylinderGeometry(0.026, 0.045, 1, 8, 6);
  g.translate(0, 0.5, 0);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const t = p.getY(i);
    p.setX(i, p.getX(i) + 0.07 * t * t);
  }
  g.computeVertexNormals();
  return g;
}

/** A leafy green in the range seen across the field: lush, dusty, yellowed or deep. */
function leafTint(a: number, b: number): THREE.Color {
  // Multiplies the foliage texture: near white, leaning yellow, blue-green or dark.
  const k = 0.8 + b * 0.45;
  return new THREE.Color(k * (0.8 + a * 0.35), k * (1.0 + (b - 0.5) * 0.12), k * (0.62 + (1 - a) * 0.3));
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
          const height = 28 + h(1) * 16;
          const lean = (h(2) - 0.5) * 0.22;
          const lean2 = (h(3) - 0.5) * 0.22;
          trunks.push(mat4(x, 0, z, tree.turn, height, height, height, lean, lean2));
          // The crown sits on the bowed trunk's tip.
          const crownMat = mat4(x, 0, z, tree.turn, (r / 0.55) * 1.35, height, (r / 0.55) * 1.35, lean, lean2);
          crownMat.multiply(new THREE.Matrix4().makeTranslation((0.07 * height) / ((r / 0.55) * 1.35), 0, 0));
          palmCrowns[Math.floor(h(4) * 3)].push(crownMat);
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
  ground.add(instanced(palmTrunk(), bark, trunks));
  const broadTrunkGeo = new THREE.CylinderGeometry(0.06, 0.1, 1, 6, 1);
  broadTrunkGeo.translate(0, 0.5, 0);
  ground.add(instanced(broadTrunkGeo, bark, broadTrunks));

  // Crowns: alpha-cut leaves, a little see-through, drawn after the troops.
  const frondMat = new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8, transparent: true, opacity: 0.9 });
  const frondDepth = new THREE.MeshDepthMaterial({ map: frondTexture(), alphaTest: 0.35, depthPacking: THREE.RGBADepthPacking });
  palmCrowns.forEach((list, v) => {
    if (!list.length) return;
    crowns.add(
      instanced(palmCrown(40 + v), frondMat, list, true, (m) => {
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

  // Bushes along the hedgerows, undergrowth in the jungle and along the edges of
  // fields, yards and roads, and low leafy plants scattered through the grass.
  const bushes: THREE.Matrix4[] = [];
  const bushTint: THREE.Color[] = [];
  const plants: THREE.Matrix4[] = [];
  const grass: THREE.Matrix4[] = [];
  const at = (tx: number, ty: number) => (map.inBounds(tx, ty) ? map.get(tx, ty) : T.Open);
  const bush = (x: number, z: number, s: number, k: number) => {
    bushes.push(mat4(x, s * 0.22, z, hash2(x, z, 71) * 6, s, s * (0.7 + hash2(x, z, 72) * 0.25), s));
    bushTint.push(leafTint(hash2(x, z, 73), hash2(x, z, 74)).multiplyScalar(k));
  };
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const t = map.get(tx, ty);
      const hh = (i: number) => hash2(tx, ty, i);
      if (t === T.Hedge) {
        for (let i = 0; i < 5; i++) bush(tx * TILE + 2 + hh(50 + i) * 12, ty * TILE + 2 + hh(60 + i) * 12, 6 + hh(40 + i) * 5, 1);
      } else if (t === T.Jungle) {
        for (let i = 0; i < 2; i++) bush(tx * TILE + hh(130 + i) * TILE, ty * TILE + hh(140 + i) * TILE, 7 + hh(150 + i) * 6, 0.8);
      } else if (t === T.Open) {
        // Thicker where the field meets something else: jungle, hedges, yards, water, roads.
        let edge = false;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const n = at(tx + dx, ty + dy);
          if (n === T.Jungle || n === T.Hedge || n === T.Building || n === T.Water || n === T.Road || n === T.Paddy) edge = true;
        }
        if (edge && hh(160) < 0.4) bush(tx * TILE + hh(161) * TILE, ty * TILE + hh(162) * TILE, 4 + hh(163) * 5, 1);
        else if (hh(164) < 0.07) bush(tx * TILE + hh(165) * TILE, ty * TILE + hh(166) * TILE, 3.5 + hh(167) * 4, 1.05);
        if (hh(170) < (edge ? 0.3 : 0.12)) plants.push(mat4(tx * TILE + hh(171) * TILE, 0, ty * TILE + hh(172) * TILE, hh(173) * 6, 3.5 + hh(174) * 2.5, 2.5 + hh(175) * 2, 3.5 + hh(174) * 2.5));
      }
      if (t === T.Open || t === T.Jungle) {
        const n = t === T.Jungle ? 3 : hash2(tx, ty, 80) < 0.55 ? 2 : 0;
        for (let i = 0; i < n; i++) {
          const s = 3 + hash2(tx, ty, 90 + i) * 3;
          grass.push(mat4(tx * TILE + hash2(tx, ty, 100 + i) * TILE, 0, ty * TILE + hash2(tx, ty, 110 + i) * TILE, hash2(tx, ty, 120 + i) * 3, s, s * 0.8, s));
        }
      }
    }
  }
  if (bushes.length) ground.add(instanced(canopyBlob(20, 4), new THREE.MeshStandardMaterial({ map: foliageTexture(), roughness: 0.9 }), bushes, true, undefined, bushTint));
  if (plants.length) {
    // Taro, ginger and young banana: a low rosette of broad leaves.
    const g = crown(7, 1, 0.42, 0.55, 95);
    g.scale(1, 0.7, 1);
    g.translate(0, -0.7, 0);
    const mat = new THREE.MeshStandardMaterial({ map: bananaLeafTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75, color: 0xd8e8c0 });
    ground.add(instanced(g, mat, plants, false));
  }
  // Grass is left to the ground painting: seen from above, 3D tufts read as clutter.
  if (grass.length && false) {
    const blade = new THREE.PlaneGeometry(1, 1);
    blade.translate(0, 0.5, 0);
    const cross = mergeGeometries([blade, blade.clone().rotateY(Math.PI / 2)])!;
    ground.add(instanced(cross, new THREE.MeshStandardMaterial({ map: grassTexture(), alphaTest: 0.45, side: THREE.DoubleSide, roughness: 1 }), grass, false));
  }
  return { ground, crowns };
}
