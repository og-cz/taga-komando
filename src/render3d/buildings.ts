import * as THREE from 'three';
import { TILE } from '../data/balance';
import { T } from '../data/terrain';
import { hash2 } from '../core/rng';
import type { GameMap } from '../sim/grid';
import type { TerrainLayer } from '../render/terrainLayer';
import { groundDetailTexture, wallAtlas } from './textures';

/** Height of the walls up to the eaves (world units; a tile is 16). */
export const WALL_H = 11;
/** Roof rise per unit of distance in from the eaves: tile and iron, and the steeper nipa thatch. */
const SLOPE = 0.62;
const THATCH_SLOPE = 0.92;
/** Past this far in from the eaves a roof stays flat (only the biggest buildings). */
const RISE_CAP = 26;
/** Roof mesh resolution, world units between vertices. */
const STEP = 4;
/** How far walls sit back under the eaves (nipa thatch hangs out further). */
const INSET = 1.6;
const THATCH_INSET = 2.8;

export interface BuildingInfo {
  /** Centre of a shell-damaged building, where it smokes (stage 1) or burns (stage 2). */
  damaged: { x: number; y: number; size: number; stage: 1 | 2 }[];
}

/** How badly the building on a tile is hit: 0 standing, 1 damaged, 2 burning. */
export type StageAt = (tile: number) => number;

/**
 * Every building on the map as real geometry: walls with windows and doors,
 * a stone footing, timber corner posts and eave boards, and roofs whose height
 * at each point is its distance in from the eaves, so any shape of building
 * gets proper hips, ridges and valleys. The roofs take their colour from the
 * terrain painting (clay tile, nipa or rusted iron), and the scene's light
 * does the rest.
 *
 * Damage shows two ways: a damaged house has its roof broken open and soot
 * up its walls; a burning one has lost most of its roof and its walls are
 * charred black. A house that falls in leaves rubble: broken wall stubs and
 * heaps of debris (see `buildRuins`).
 */
export function buildBuildings(
  map: GameMap,
  terrain: TerrainLayer,
  groundTex: THREE.Texture,
  stageAt: StageAt = () => 0,
  /** Tiles another model stands on (a headquarters): buildings touching them are left out. */
  covered: (tile: number) => boolean = () => false,
): { group: THREE.Group; info: BuildingInfo } {
  const group = new THREE.Group();
  const info: BuildingInfo = { damaged: [] };
  const isB = (tx: number, ty: number) => map.inBounds(tx, ty) && map.get(tx, ty) === T.Building;
  const W = map.w * TILE;
  const H = map.h * TILE;

  // Connected buildings.
  const label = new Int32Array(map.w * map.h).fill(-1);
  const comps: { tiles: number[] }[] = [];
  for (let i = 0; i < label.length; i++) {
    const tx = i % map.w;
    const ty = Math.floor(i / map.w);
    if (label[i] !== -1 || !isB(tx, ty)) continue;
    const tiles: number[] = [];
    const stack = [i];
    label[i] = comps.length;
    while (stack.length) {
      const k = stack.pop()!;
      tiles.push(k);
      const kx = k % map.w;
      const ky = Math.floor(k / map.w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const j = (ky + dy) * map.w + kx + dx;
        if (isB(kx + dx, ky + dy) && label[j] === -1) {
          label[j] = comps.length;
          stack.push(j);
        }
      }
    }
    comps.push({ tiles });
  }

  /** Distance from a point to the nearest ground that is not this building's. */
  const inward = (x: number, z: number): number => {
    const tx = Math.floor(x / TILE);
    const ty = Math.floor(z / TILE);
    let best = RISE_CAP / SLOPE;
    for (let dy = -3; dy <= 3; dy++) {
      for (let dx = -3; dx <= 3; dx++) {
        if (isB(tx + dx, ty + dy)) continue;
        const x0 = (tx + dx) * TILE;
        const z0 = (ty + dy) * TILE;
        const ddx = Math.max(x0 - x, 0, x - (x0 + TILE));
        const ddz = Math.max(z0 - z, 0, z - (z0 + TILE));
        best = Math.min(best, Math.hypot(ddx, ddz));
      }
    }
    return best;
  };

  const roofPos: number[] = [];
  const roofUv: number[] = [];
  const roofKind: number[] = [];
  const roofIdx: number[] = [];
  const wallPos: number[] = [];
  const wallUv: number[] = [];
  const wallNorm: number[] = [];
  const wallCol: number[] = [];
  /** Footings, corner posts and eave boards: boxes, each with its colour. */
  const trim: { m: THREE.Matrix4; c: THREE.Color }[] = [];
  const box = (x: number, y: number, z: number, sx: number, sy: number, sz: number, color: number, k = 1) =>
    trim.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), new THREE.Quaternion(), new THREE.Vector3(sx, sy, sz)), c: new THREE.Color(color).multiplyScalar(k) });
  const N = TILE / STEP;

  comps.forEach((comp, ci) => {
    if (comp.tiles.some(covered)) return;
    const seed = comp.tiles[0];
    let sx = 0;
    let sy = 0;
    for (const k of comp.tiles) {
      sx += (k % map.w) + 0.5;
      sy += Math.floor(k / map.w) + 0.5;
    }
    const cx = (sx / comp.tiles.length) * TILE;
    const cz = (sy / comp.tiles.length) * TILE;
    // Shelled houses: the roof broken open (damaged), or mostly gone and burning.
    const stage = Math.min(2, stageAt(seed));
    const damaged = stage > 0;
    const size = Math.sqrt(comp.tiles.length);
    const holeR = !damaged ? 0 : TILE * (stage === 2 ? 0.75 + size * 0.24 : 0.5 + hash2(seed, 4, 909) * 0.45) * (0.85 + hash2(seed, 7, 909) * 0.3);
    const hx = cx + (hash2(seed, 5, 909) - 0.5) * TILE * Math.min(1, size * 0.5);
    const hz = cz + (hash2(seed, 6, 909) - 0.5) * TILE * Math.min(1, size * 0.5);
    if (damaged) info.damaged.push({ x: hx, y: hz, size: holeR, stage: stage as 1 | 2 });
    const inHole = (x: number, z: number) => {
      if (!damaged) return false;
      const a = Math.atan2(z - hz, x - hx);
      const ragged = holeR * (0.75 + 0.35 * Math.sin(a * 5 + seed) * Math.sin(a * 3 - seed * 0.7));
      return Math.hypot(x - hx, z - hz) < ragged;
    };
    /** Soot on the walls: none on a sound house, streaks on a damaged one, charred on a burning one. */
    const soot = (x: number, y: number, z: number): number => {
      if (!damaged) return 1;
      const near = Math.max(0, 1 - Math.hypot(x - hx, z - hz) / (holeR * 2.4 + TILE));
      const up = y / (WALL_H + 0.6);
      const streak = 0.75 + 0.25 * Math.sin(x * 0.9 + z * 1.3 + seed);
      if (stage === 1) return 1 - near * up * 0.55 * streak;
      return Math.max(0.22, 0.62 - near * 0.3 - up * 0.25 * streak);
    };

    // Roofing: clay tile, nipa thatch or iron; thatch is steeper and hangs out further.
    const mat = terrain.roofMaterial(Math.floor(cx / TILE), Math.floor(cz / TILE));
    const slope = mat === 1 ? THATCH_SLOPE : SLOPE;
    const inset = mat === 1 ? THATCH_INSET : INSET;

    // Roof: a shared grid of vertices over the whole building.
    const index = new Map<number, number>();
    const vert = (gx: number, gz: number): number => {
      const key = gz * 100000 + gx;
      const got = index.get(key);
      if (got !== undefined) return got;
      const x = gx * STEP;
      const z = gz * STEP;
      let y = WALL_H + Math.min(RISE_CAP, inward(x, z) * slope);
      // Broken roofing sags round the edge of a shell hole.
      if (damaged) {
        const d = Math.hypot(x - hx, z - hz);
        if (d < holeR * 1.35) y -= (1 - d / (holeR * 1.35)) * 5;
      }
      const id = roofPos.length / 3;
      roofPos.push(x, y, z);
      roofUv.push(x / W, 1 - z / H);
      roofKind.push(mat);
      index.set(key, id);
      return id;
    };
    for (const k of comp.tiles) {
      const tx = k % map.w;
      const ty = Math.floor(k / map.w);
      for (let j = 0; j < N; j++) {
        for (let i = 0; i < N; i++) {
          const gx = tx * N + i;
          const gz = ty * N + j;
          const mx = (gx + 0.5) * STEP;
          const mz = (gz + 0.5) * STEP;
          if (inHole(mx, mz)) continue;
          const a = vert(gx, gz);
          const b = vert(gx + 1, gz);
          const c = vert(gx, gz + 1);
          const d = vert(gx + 1, gz + 1);
          // Split each cell along the diagonal that follows the roof best.
          const ya = roofPos[a * 3 + 1];
          const yd = roofPos[d * 3 + 1];
          const yb = roofPos[b * 3 + 1];
          const yc = roofPos[c * 3 + 1];
          if (Math.abs(ya - yd) < Math.abs(yb - yc)) roofIdx.push(a, c, d, a, d, b);
          else roofIdx.push(a, c, b, b, c, d);
        }
      }
    }

    // Walls: one bay per open tile edge, set back under the eaves.
    for (const k of comp.tiles) {
      const tx = k % map.w;
      const ty = Math.floor(k / map.w);
      const x0 = tx * TILE;
      const z0 = ty * TILE;
      const sides: [boolean, number, number, number, number, number, number][] = [
        // open?, ax, az, bx, bz, nx, nz (wall from a to b, facing n)
        [!isB(tx, ty - 1), x0, z0 + inset, x0 + TILE, z0 + inset, 0, -1],
        [!isB(tx, ty + 1), x0 + TILE, z0 + TILE - inset, x0, z0 + TILE - inset, 0, 1],
        [!isB(tx - 1, ty), x0 + inset, z0 + TILE, x0 + inset, z0, -1, 0],
        [!isB(tx + 1, ty), x0 + TILE - inset, z0, x0 + TILE - inset, z0 + TILE, 1, 0],
      ];
      sides.forEach(([open, ax, az, bx, bz, nx, nz], si) => {
        if (!open) return;
        // Pull the ends in at outside corners so the walls meet.
        const along: [number, number] = [Math.sign(bx - ax), Math.sign(bz - az)];
        const beforeOpen = !isB(tx - along[0], ty - along[1]);
        const afterOpen = !isB(tx + along[0], ty + along[1]);
        const a0x = ax + (beforeOpen ? along[0] * inset : 0);
        const a0z = az + (beforeOpen ? along[1] * inset : 0);
        const b0x = bx - (afterOpen ? along[0] * inset : 0);
        const b0z = bz - (afterOpen ? along[1] * inset : 0);
        const h = hash2(tx, ty, 300 + si);
        const variant = h < 0.14 ? 2 : h < 0.55 ? 1 : 0;
        const u0 = variant / 3;
        const u1 = (variant + 1) / 3;
        const v1 = 1 - mat / 3;
        const v0 = 1 - (mat + 1) / 3;
        const top = WALL_H + 0.6;
        const quad = [
          [a0x, 0, a0z, u0, v0],
          [b0x, 0, b0z, u1, v0],
          [b0x, top, b0z, u1, v1],
          [a0x, 0, a0z, u0, v0],
          [b0x, top, b0z, u1, v1],
          [a0x, top, a0z, u0, v1],
        ];
        for (const [x, y, z, u, v] of quad) {
          wallPos.push(x, y, z);
          wallUv.push(u, v);
          wallNorm.push(nx, 0, nz);
          const s = soot(x, y, z);
          wallCol.push(s, s * 0.97, s * 0.94);
        }
        // A stone footing along the foot of the wall.
        const char = stage === 2 ? 0.55 : 1;
        const mx = (a0x + b0x) / 2;
        const mz = (a0z + b0z) / 2;
        const len = Math.hypot(b0x - a0x, b0z - a0z);
        const shade = 0.85 + hash2(tx, ty, 320 + si) * 0.25;
        // (A nipa hut stands on a timber sill instead.)
        box(mx + nx * 0.35, 0.9, mz + nz * 0.35, nx ? 0.9 : len + 0.6, 1.8, nz ? 0.9 : len + 0.6, mat === 1 ? 0x4c3a26 : 0x6a6255, shade * char);
        // An eave board under the roof edge, out at the tile edge.
        const ex = mx + nx * (inset - 0.2);
        const ez = mz + nz * (inset - 0.2);
        const elen = len + (beforeOpen ? inset : 0) + (afterOpen ? inset : 0);
        if (!inHole(ex, ez)) box(ex, WALL_H - 0.2, ez, nx ? 0.35 : elen, 1.1, nz ? 0.35 : elen, 0x3b2a1b, char);
        // A timber post at each outside corner.
        if (beforeOpen) box(a0x + nx * 0.2, (WALL_H + 0.6) / 2, a0z + nz * 0.2, 1.3, WALL_H + 0.6, 1.3, 0x4a3522, char);
      });
    }
    void ci;
  });

  if (roofPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(roofUv, 2));
    g.setAttribute('roofKind', new THREE.Float32BufferAttribute(roofKind, 1));
    g.setIndex(roofIdx);
    g.computeVertexNormals();
    const roof = new THREE.Mesh(g, roofMaterial(groundTex));
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
  }
  if (wallPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(wallNorm, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(wallCol, 3));
    const walls = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: wallAtlas(), roughness: 0.92, side: THREE.DoubleSide, vertexColors: true }));
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);
  }
  const boxes = (list: { m: THREE.Matrix4; c: THREE.Color }[], mat: THREE.Material, geo: THREE.BufferGeometry = new THREE.BoxGeometry(1, 1, 1)) => {
    if (!list.length) return;
    const mesh = new THREE.InstancedMesh(geo, mat, list.length);
    list.forEach((b, i) => {
      mesh.setMatrixAt(i, b.m);
      mesh.setColorAt(i, b.c);
    });
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
  };
  boxes(trim, new THREE.MeshStandardMaterial({ roughness: 0.95 }));
  // What is left of houses that fell in.
  const ruins = buildRuins(map);
  boxes(ruins.stubs, new THREE.MeshStandardMaterial({ map: wallAtlas(), roughness: 0.95 }));
  boxes(ruins.debris, new THREE.MeshStandardMaterial({ roughness: 1, flatShading: true }), new THREE.DodecahedronGeometry(1, 0));
  boxes(ruins.beams, new THREE.MeshStandardMaterial({ roughness: 1 }));
  return { group, info };
}

/**
 * Roofing with its own surface: clay tiles in rows, nipa thatch laid in
 * shaggy courses with fibres running down the slope, or iron sheets ribbed
 * down the slope. Rows and courses follow the roof's contour lines, so they
 * wrap round hips and valleys of any shape of roof.
 */
function roofMaterial(groundTex: THREE.Texture): THREE.MeshStandardMaterial {
  const m = new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.9, metalness: 0.03, side: THREE.DoubleSide });
  const fibres = groundDetailTexture();
  m.onBeforeCompile = (shader) => {
    shader.uniforms.fibreMap = { value: fibres };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', '#include <common>\nattribute float roofKind;\nvarying float vKind;\nvarying vec3 vRoofW;\nvarying vec3 vRoofN;')
      .replace(
        '#include <begin_vertex>',
        '#include <begin_vertex>\nvKind = roofKind;\nvRoofW = (modelMatrix * vec4(transformed, 1.0)).xyz;\nvRoofN = normalize(mat3(modelMatrix) * objectNormal);',
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform sampler2D fibreMap;\nvarying float vKind;\nvarying vec3 vRoofW;\nvarying vec3 vRoofN;')
      .replace(
        '#include <map_fragment>',
        [
          '#include <map_fragment>',
          // Along the contour of this face, and height up the roof.
          'vec2 cd = vec2(-vRoofN.z, vRoofN.x);',
          'cd = length(cd) > 0.01 ? normalize(cd) : vec2(1.0, 0.0);',
          'float along = dot(vRoofW.xz, cd);',
          'float up = vRoofW.y;',
          'float shade = 1.0;',
          'if (vKind < 0.5) {',
          // Clay tiles: rows with a shadowed lower lip, staggered joints.
          '  float row = fract(up * 0.62);',
          '  float joint = fract(along * 0.42 + floor(up * 0.62) * 0.5);',
          '  shade = mix(0.7, 1.06, smoothstep(0.0, 0.3, row)) * (1.0 - 0.18 * smoothstep(0.86, 0.98, joint));',
          '  shade *= 0.88 + 0.24 * texture2D(fibreMap, vRoofW.xz * 0.05).b;',
          '} else if (vKind < 1.5) {',
          // Nipa thatch: shaggy courses, streaks of fibre, greyed in patches.
          '  float course = fract(up * 0.5 + texture2D(fibreMap, vec2(along * 0.03, 0.5)).r * 0.35);',
          '  float fib = texture2D(fibreMap, vec2(along * 0.55, up * 0.05)).r;',
          '  float fib2 = texture2D(fibreMap, vec2(along * 1.7 + 0.3, up * 0.12)).g;',
          '  shade = mix(0.72, 1.16, smoothstep(0.0, 0.6, course)) * (0.86 + fib * 0.24 + fib2 * 0.16);',
          '  float patchy = texture2D(fibreMap, vRoofW.xz * 0.012).b;',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(dot(diffuseColor.rgb, vec3(0.33))) * vec3(1.02, 0.98, 0.9), 0.35 * patchy);',
          '} else {',
          // Iron sheets: ribs down the slope, rust streaks.
          '  shade = 0.86 + 0.14 * sin(along * 3.3);',
          '  float rust = texture2D(fibreMap, vec2(along * 0.08, up * 0.02)).b;',
          '  diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.42, 0.24, 0.12), 0.35 * smoothstep(0.4, 0.8, rust));',
          '}',
          'diffuseColor.rgb *= shade;',
        ].join('\n'),
      );
  };
  return m;
}

/**
 * Rubble where houses fell in: broken stubs of wall along the old outline,
 * heaps of brick and plaster, and charred beams lying across them.
 */
function buildRuins(map: GameMap): Record<'stubs' | 'debris' | 'beams', { m: THREE.Matrix4; c: THREE.Color }[]> {
  const out: Record<'stubs' | 'debris' | 'beams', { m: THREE.Matrix4; c: THREE.Color }[]> = { stubs: [], debris: [], beams: [] };
  const isR = (tx: number, ty: number) => map.inBounds(tx, ty) && map.get(tx, ty) === T.Rubble;
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const put = (list: { m: THREE.Matrix4; c: THREE.Color }[], x: number, y: number, z: number, sx: number, sy: number, sz: number, rx: number, ry: number, rz: number, color: number, k: number) =>
    list.push({ m: new THREE.Matrix4().compose(new THREE.Vector3(x, y, z), q.setFromEuler(e.set(rx, ry, rz)).clone(), new THREE.Vector3(sx, sy, sz)), c: new THREE.Color(color).multiplyScalar(k) });
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      if (!isR(tx, ty)) continue;
      const h = (i: number) => hash2(tx, ty, 700 + i);
      const x0 = tx * TILE;
      const z0 = ty * TILE;
      // Stubs of wall along the edges that were outside walls, broken off at ragged heights.
      const edges: [boolean, number, number, boolean][] = [
        [!isR(tx, ty - 1), x0 + TILE / 2, z0 + INSET, true],
        [!isR(tx, ty + 1), x0 + TILE / 2, z0 + TILE - INSET, true],
        [!isR(tx - 1, ty), x0 + INSET, z0 + TILE / 2, false],
        [!isR(tx + 1, ty), x0 + TILE - INSET, z0 + TILE / 2, false],
      ];
      edges.forEach(([open, x, z, along], ei) => {
        if (!open) return;
        for (let s = 0; s < 3; s++) {
          if (h(ei * 10 + s) < 0.3) continue;
          const tall = 1.5 + Math.pow(h(ei * 10 + s + 4), 1.6) * 7.5;
          const off = (s - 1) * (TILE / 3);
          const k = 0.45 + h(ei * 10 + s + 7) * 0.5;
          put(out.stubs, along ? x + off : x, tall / 2, along ? z : z + off, along ? TILE / 3 - 0.4 : 1.1, tall, along ? 1.1 : TILE / 3 - 0.4, 0, 0, (h(ei + 40) - 0.5) * 0.12, 0xd8ccb4, k);
        }
      });
      // Heaps of brick, plaster and roof tile.
      for (let i = 0; i < 9; i++) {
        const r = 1.2 + h(i + 50) * 2.6;
        const tint = h(i + 60);
        const color = tint < 0.35 ? 0xa0583a : tint < 0.7 ? 0xb4aa98 : 0x4a443c;
        put(out.debris, x0 + 2 + h(i + 70) * (TILE - 4), r * 0.45, z0 + 2 + h(i + 80) * (TILE - 4), r * (1 + h(i + 90) * 0.6), r * 0.7, r, h(i + 100) * 3, h(i + 110) * 6, h(i + 120) * 3, color, 0.7 + h(i + 130) * 0.35);
      }
      // A charred beam or two across the heap.
      for (let i = 0; i < 2; i++) {
        if (h(i + 140) < 0.4) continue;
        put(out.beams, x0 + TILE / 2 + (h(i + 150) - 0.5) * 8, 1.4 + h(i + 160) * 1.6, z0 + TILE / 2 + (h(i + 170) - 0.5) * 8, 12 + h(i + 180) * 8, 1.1, 1.1, 0, h(i + 190) * Math.PI, (h(i + 200) - 0.5) * 0.5, 0x2e231a, 1);
      }
    }
  }
  return out;
}
