import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE } from '../data/balance';
import { T } from '../data/terrain';
import { hash2 } from '../core/rng';
import type { GameMap } from '../sim/grid';
import type { TerrainLayer } from '../render/terrainLayer';
import { chunkedInstances } from './instancing';
import { bananaLeafTexture, barkTexture, frondTexture } from './textures';
import { cutout, leafSpray } from './surfaces';

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
function crown(n: number, length: number, width: number, droop: number, seed: number, segs = 6): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const f = leaf(length * (0.85 + hash2(i, seed, 1) * 0.3), width, droop * (0.8 + hash2(i, seed, 2) * 0.5), segs);
    f.rotateY((i / n) * Math.PI * 2 + hash2(i, seed, 3) * 0.4);
    parts.push(f);
  }
  const g = mergeGeometries(parts)!;
  g.translate(0, 1, 0);
  return g;
}

/**
 * A leafy mound built the way game foliage is: sprays of leaves on cards
 * set round a dome, each facing out, with normals bent outward from the
 * middle so the whole mound shades round like a real bush.
 */
function leafMound(seed: number, cards: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  const centre = new THREE.Vector3(0, -0.25, 0);
  for (let i = 0; i < cards; i++) {
    const a = hash2(i, seed, 1) * Math.PI * 2;
    // From the crown down the sides: more cards near the top.
    const up = 1 - Math.pow(hash2(i, seed, 2), 1.6) * 0.95;
    const dir = new THREE.Vector3(Math.cos(a) * Math.sqrt(1 - up * up), up, Math.sin(a) * Math.sqrt(1 - up * up));
    const size = 0.62 + hash2(i, seed, 3) * 0.3;
    const card = new THREE.PlaneGeometry(size, size);
    const q = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    card.applyQuaternion(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), hash2(i, seed, 4) * Math.PI * 2));
    card.applyQuaternion(q);
    card.translate(dir.x * 0.38, dir.y * 0.3 + 0.12, dir.z * 0.38);
    const p = card.attributes.position;
    const n = card.attributes.normal;
    for (let k = 0; k < p.count; k++) {
      const v = new THREE.Vector3(p.getX(k), p.getY(k), p.getZ(k)).sub(centre).normalize();
      n.setXYZ(k, v.x, v.y, v.z);
    }
    parts.push(card);
  }
  return mergeGeometries(parts)!;
}

/** Seconds of wind, advanced by the battlefield each frame; every swaying plant reads it. */
export const wind = { value: 0 };

/**
 * Let a plant sway in the wind: its vertices move by how high they stand
 * (grass, ferns) or how far out they reach (palm fronds), each plant in its
 * own rhythm, in gusts that roll across the field.
 */
function swaying<M extends THREE.Material>(mat: M, amount: number, by: 'height' | 'reach'): M {
  const before = mat.onBeforeCompile.bind(mat);
  const key = mat.customProgramCacheKey.bind(mat);
  mat.onBeforeCompile = (shader, renderer) => {
    before(shader, renderer);
    shader.uniforms.windTime = wind;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float windTime;').replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
#ifdef USE_INSTANCING
vec2 wOrigin = vec2(instanceMatrix[3][0], instanceMatrix[3][2]);
#else
vec2 wOrigin = vec2(0.0);
#endif
float wPhase = windTime * 1.7 + wOrigin.x * 0.045 + wOrigin.y * 0.031;
float wGust = 0.55 + 0.45 * sin(windTime * 0.35 + wOrigin.x * 0.006 - wOrigin.y * 0.004);
float wReach = ${by === 'height' ? 'max(0.0, transformed.y)' : 'length(transformed.xz)'};
float wBend = wReach * wReach * wGust * ${amount.toFixed(4)};
transformed.x += sin(wPhase) * wBend;
transformed.z += cos(wPhase * 0.83) * wBend * 0.6;`,
    );
  };
  mat.customProgramCacheKey = () => `${key()}|sway-${by}-${amount}`;
  return mat;
}

/**
 * Leaves and blades are lit the same from either side, as thin leaves are:
 * the back of a card keeps its own normal instead of facing the ground.
 */
function bothSidesLit<M extends THREE.Material>(mat: M): M {
  mat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace('#include <normal_fragment_begin>', '#include <normal_fragment_begin>\nnormal = normalize(vNormal);');
  };
  mat.customProgramCacheKey = () => 'both-sides';
  return mat;
}

/** Cut-out material for scanned foliage: hard alpha edges, smoothed by multisampling, and leaf-shaped shadows. */
function foliage(map: THREE.Texture, opts: { roughness?: number; color?: number } = {}): { mat: THREE.MeshStandardMaterial; depth: THREE.MeshDepthMaterial } {
  const mat = bothSidesLit(new THREE.MeshStandardMaterial({ map, alphaTest: 0.5, alphaToCoverage: true, side: THREE.DoubleSide, roughness: opts.roughness ?? 0.85, color: opts.color ?? 0xffffff }));
  const depth = new THREE.MeshDepthMaterial({ map, alphaTest: 0.5, depthPacking: THREE.RGBADepthPacking });
  return { mat, depth };
}

/** Grass clumps on the grass sheet (pixels of the 1024 sheet: x0, y0, x1, y1; roots along y1). */
const GRASS_CLUMPS: readonly [number, number, number, number][] = [
  [205, 765, 505, 905],
  [600, 775, 835, 880],
  [30, 890, 200, 1002],
  [255, 905, 500, 1010],
  [590, 885, 805, 1015],
];
/** Fern fronds on the fern sheet (stalk along y1). */
const FERN_FRONDS: readonly [number, number, number, number][] = [
  [90, 110, 240, 975],
  [320, 25, 465, 780],
  [555, 25, 675, 510],
  [520, 520, 645, 990],
  [730, 110, 860, 920],
];

/** Normals pointing mostly up, so cards of grass and fern light like the ground they grow from. */
function upNormals(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const n = g.attributes.normal;
  for (let i = 0; i < n.count; i++) {
    const v = new THREE.Vector3(n.getX(i) * 0.35, 1, n.getZ(i) * 0.35).normalize();
    n.setXYZ(i, v.x, v.y, v.z);
  }
  return g;
}

/** A grass clump: three upright cards of scanned grass crossing at 60°, roots at the origin. */
function grassClump(seed: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < 3; i++) {
    const [x0, y0, x1, y1] = GRASS_CLUMPS[Math.floor(hash2(i, seed, 1) * GRASS_CLUMPS.length)];
    const h = ((y1 - y0) / (x1 - x0)) * 1.35;
    const g = new THREE.PlaneGeometry(1, h);
    g.translate(0, h / 2, 0);
    const uv = g.attributes.uv;
    for (let k = 0; k < uv.count; k++) uv.setXY(k, (uv.getX(k) ? x1 : x0) / 1024, (uv.getY(k) ? y0 : y1) / 1024);
    g.rotateY((i * Math.PI) / 3 + hash2(i, seed, 2) * 0.4);
    parts.push(g);
  }
  return upNormals(mergeGeometries(parts)!);
}

/** A fern: fronds of scanned fern arching out from the crown and drooping at the tips. */
function fernPlant(seed: number, fronds: number): THREE.BufferGeometry {
  const parts: THREE.BufferGeometry[] = [];
  for (let i = 0; i < fronds; i++) {
    const [x0, y0, x1, y1] = FERN_FRONDS[Math.floor(hash2(i, seed, 1) * FERN_FRONDS.length)];
    const w = (x1 - x0) / (y1 - y0);
    const g = new THREE.PlaneGeometry(w, 1, 1, 6);
    const p = g.attributes.position;
    const uv = g.attributes.uv;
    const rise = 0.45 + hash2(i, seed, 2) * 0.3;
    for (let k = 0; k < p.count; k++) {
      const t = p.getY(k) + 0.5;
      // Out along +z, rising then drooping.
      p.setXYZ(k, p.getX(k) * (0.4 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.1))), rise * t - (rise + 0.25) * t * t, t * 0.9);
      uv.setXY(k, (uv.getX(k) ? x1 : x0) / 1024, (y1 - t * (y1 - y0)) / 1024);
    }
    g.rotateY((i / fronds) * Math.PI * 2 + hash2(i, seed, 3) * 0.5);
    parts.push(g);
  }
  const g = mergeGeometries(parts)!;
  g.computeVertexNormals();
  return upNormals(g);
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, matrices: THREE.Matrix4[], shadow = true, setup?: (m: THREE.InstancedMesh) => void, colors?: THREE.Color[]): THREE.Group {
  return chunkedInstances(geo, mat, matrices, { castShadow: shadow, setup, colors });
}

/** A coconut palm's crown: a full head of long drooping fronds round a few young ones standing up. */
function palmCrown(seed: number): THREE.BufferGeometry {
  const old = crown(18, 0.7, 0.26, 0.55, seed, 8);
  const young = crown(4, 0.44, 0.18, 0.06, seed + 5, 4);
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
export function buildVegetation(map: GameMap, terrain: TerrainLayer, density = 1): { ground: THREE.Group; crowns: THREE.Group } {
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
  const frondMat = swaying(bothSidesLit(new THREE.MeshStandardMaterial({ map: frondTexture(), alphaTest: 0.35, side: THREE.DoubleSide, roughness: 0.8, transparent: true, opacity: 0.9 })), 0.035, 'reach');
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
  // Leaf cards: sprays of scanned leaves, cut out by alpha, shading round, casting leaf-shaped shadows.
  const leaves = foliage(leafSpray(), { roughness: 0.75 });
  const leafMat = leaves.mat;
  const leafDepth = leaves.depth;
  broadCrowns.forEach((list, v) => {
    if (!list.length) return;
    crowns.add(instanced(leafMound(60 + v, 26), leafMat, list, true, (m) => ((m.renderOrder = 2), (m.customDepthMaterial = leafDepth))));
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
  const grassTint: THREE.Color[] = [];
  const ferns: THREE.Matrix4[] = [];
  const fernTint: THREE.Color[] = [];
  const clump = (x: number, z: number, s: number, dry: number) => {
    // On Low graphics, only some of the grass.
    if (density < 1 && hash2(x, z, 98) > density) return;
    grass.push(mat4(x, 0, z, hash2(x, z, 91) * 6, s, s * (0.8 + hash2(x, z, 92) * 0.5), s));
    // From deep green through yellow-green to straw. (The scan is dark: it was shot to be lit
    // through from behind, so it is brightened to sit on the sunlit ground.)
    const k = (0.85 + hash2(x, z, 93) * 0.35) * 2.3;
    grassTint.push(new THREE.Color(k * (0.82 + dry * 0.5), k * (1.0 + dry * 0.05), k * (0.5 + dry * 0.15)));
  };
  const fern = (x: number, z: number, s: number) => {
    ferns.push(mat4(x, 0.2, z, hash2(x, z, 94) * 6, s, s, s));
    const k = (0.75 + hash2(x, z, 95) * 0.35) * 1.8;
    fernTint.push(new THREE.Color(k * 0.9, k, k * 0.7));
  };
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
        // A kitchen garden by the house: rows of greens, planted straight.
        const byHouse = [[1, 0], [-1, 0], [0, 1], [0, -1]].some(([dx, dy]) => at(tx + dx, ty + dy) === T.Building);
        if (byHouse && hh(176) < 0.3) {
          const along = hh(177) < 0.5;
          for (let r = 0; r < 3; r++) {
            for (let k = 0; k < 5; k++) {
              const a = 2 + k * 3 + (hh(180 + r * 5 + k) - 0.5) * 0.8;
              const b = 3 + r * 5;
              const s = 1.8 + hh(200 + r * 5 + k) * 0.8;
              plants.push(mat4(tx * TILE + (along ? a : b), 0, ty * TILE + (along ? b : a), hh(220 + r * 5 + k) * 6, s, s * 0.9, s));
            }
          }
        }
      }
      // Grass in clumps: thick along every edge (verges, yards, hedges, jungle, fences), patchy out in
      // the open, a few tufts along the edges of the roads, and dry straw-coloured in places.
      const dry = Math.max(0, hash2(Math.floor(tx / 5), Math.floor(ty / 5), 96) - 0.55) * 2;
      let edges = 0;
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (at(tx + dx, ty + dy) !== t) edges++;
      if (t === T.Open || t === T.Hedge || t === T.Jungle || t === T.Wire || t === T.TankTrap) {
        const patch = hash2(Math.floor(tx / 3), Math.floor(ty / 3), 97);
        const n = t === T.Open ? Math.round(1 + patch * 3 + edges * 1.2) : 3;
        for (let i = 0; i < n; i++) clump(tx * TILE + hh(100 + i) * TILE, ty * TILE + hh(110 + i) * TILE, 4.5 + hh(120 + i) * 4, dry);
      } else if (t === T.Road && edges > 0 && hh(125) < 0.7) {
        // On the verge, towards whichever side leaves the road.
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          if (at(tx + dx, ty + dy) === T.Road) continue;
          clump(tx * TILE + TILE / 2 + dx * 6 + (hh(126) - 0.5) * 8 * (1 - Math.abs(dx)), ty * TILE + TILE / 2 + dy * 6 + (hh(127) - 0.5) * 8 * (1 - Math.abs(dy)), 3.5 + hh(128) * 3, dry);
        }
      }
      // Ferns in the jungle and along its edge, by hedges and in the shade of houses.
      if (t === T.Jungle) for (let i = 0; i < 2; i++) fern(tx * TILE + hh(130 + i * 3) * TILE, ty * TILE + hh(131 + i * 3) * TILE, 6 + hh(132 + i * 3) * 4);
      else if ((t === T.Hedge || (t === T.Open && edges > 0)) && hh(140) < 0.28) fern(tx * TILE + hh(141) * TILE, ty * TILE + hh(142) * TILE, 5 + hh(143) * 3);
    }
  }
  if (bushes.length) ground.add(instanced(leafMound(20, 16), leafMat, bushes, true, (m) => (m.customDepthMaterial = leafDepth), bushTint));
  if (plants.length) {
    // Taro, ginger and young banana: a low rosette of broad leaves.
    const g = crown(7, 1, 0.42, 0.55, 95);
    g.scale(1, 0.7, 1);
    g.translate(0, -0.7, 0);
    const mat = swaying(bothSidesLit(new THREE.MeshStandardMaterial({ map: bananaLeafTexture(), alphaTest: 0.4, side: THREE.DoubleSide, roughness: 0.75, color: 0xd8e8c0 })), 0.15, 'height');
    ground.add(instanced(g, mat, plants, false));
  }
  // Scanned grass and ferns, swaying. Grass is too fine to cast a shadow worth its cost; ferns cast theirs.
  if (grass.length) {
    const g = foliage(cutout('grass_medium_01'), { roughness: 0.9 });
    swaying(g.mat, 0.5, 'height');
    const half = Math.ceil(grass.length / 2);
    ground.add(instanced(grassClump(1), g.mat, grass.slice(0, half), false, undefined, grassTint.slice(0, half)));
    ground.add(instanced(grassClump(2), g.mat, grass.slice(half), false, undefined, grassTint.slice(half)));
  }
  // Rice: seedlings in straight rows across the water of every paddy.
  const lay = terrain.layout;
  if (lay) {
    const rice: THREE.Matrix4[] = [];
    const riceTint: THREE.Color[] = [];
    for (let z = 2; z < map.pixelHeight; z += 3.2) {
      for (let x = 2; x < map.pixelWidth; x += 2.6) {
        if (lay.sample(lay.paddy, x, z) < 0.72 || (density < 1 && hash2(x, z, 265) > density)) continue;
        const jx = x + (hash2(x, z, 260) - 0.5) * 0.6;
        const jz = z + (hash2(x, z, 261) - 0.5) * 0.5;
        const s = 2.6 + hash2(x, z, 262) * 1.0;
        rice.push(mat4(jx, -0.5, jz, hash2(x, z, 263) * 6, s, s * 1.5, s));
        const k = (0.95 + hash2(x, z, 264) * 0.3) * 3;
        riceTint.push(new THREE.Color(k * 0.55, k * 1.05, k * 0.25));
      }
    }
    if (rice.length) {
      const r = foliage(cutout('grass_medium_01'), { roughness: 0.8 });
      swaying(r.mat, 0.6, 'height');
      ground.add(instanced(grassClump(7), r.mat, rice, false, undefined, riceTint));
    }
  }
  if (ferns.length) {
    const f = foliage(cutout('fern_02'), { roughness: 0.8 });
    swaying(f.mat, 0.12, 'height');
    ground.add(instanced(fernPlant(3, 9), f.mat, ferns, true, (m) => (m.customDepthMaterial = f.depth), fernTint));
  }
  return { ground, crowns };
}
