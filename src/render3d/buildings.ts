import * as THREE from 'three';
import { TILE } from '../data/balance';
import { T } from '../data/terrain';
import { hash2 } from '../core/rng';
import type { GameMap } from '../sim/grid';
import type { TerrainLayer } from '../render/terrainLayer';
import { wallAtlas } from './textures';

/** Height of the walls up to the eaves (world units; a tile is 16). */
export const WALL_H = 11;
/** Roof rise per unit of distance in from the eaves. */
const SLOPE = 0.62;
/** Past this far in from the eaves a roof stays flat (only the biggest buildings). */
const RISE_CAP = 26;
/** Roof mesh resolution, world units between vertices. */
const STEP = 4;
/** How far walls sit back under the eaves. */
const INSET = 1.6;

export interface BuildingInfo {
  /** Centre of a shell-damaged building, where its ruins smoulder. */
  damaged: { x: number; y: number; size: number }[];
}

/**
 * Every building on the map as real geometry: walls with windows and doors,
 * and roofs whose height at each point is its distance in from the eaves, so
 * any shape of building gets proper hips, ridges and valleys. A few buildings
 * are shell-damaged, with their roofs broken open. The roofs take their colour
 * from the terrain painting (clay tile, nipa or rusted iron), and the scene's
 * light does the rest.
 */
export function buildBuildings(map: GameMap, terrain: TerrainLayer, groundTex: THREE.Texture): { group: THREE.Group; info: BuildingInfo } {
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
  const roofIdx: number[] = [];
  const wallPos: number[] = [];
  const wallUv: number[] = [];
  const wallNorm: number[] = [];
  const N = TILE / STEP;

  comps.forEach((comp, ci) => {
    const seed = comp.tiles[0];
    let sx = 0;
    let sy = 0;
    for (const k of comp.tiles) {
      sx += (k % map.w) + 0.5;
      sy += Math.floor(k / map.w) + 0.5;
    }
    const cx = (sx / comp.tiles.length) * TILE;
    const cz = (sy / comp.tiles.length) * TILE;
    // Some larger buildings have taken a shell through the roof.
    const damaged = comp.tiles.length >= 3 && hash2(seed, 3, 909) < 0.3;
    const holeR = damaged ? TILE * (0.7 + hash2(seed, 4, 909) * 0.6) : 0;
    const hx = cx + (hash2(seed, 5, 909) - 0.5) * TILE;
    const hz = cz + (hash2(seed, 6, 909) - 0.5) * TILE;
    if (damaged) info.damaged.push({ x: hx, y: hz, size: holeR });
    const inHole = (x: number, z: number) => {
      if (!damaged) return false;
      const a = Math.atan2(z - hz, x - hx);
      const ragged = holeR * (0.75 + 0.35 * Math.sin(a * 5 + seed) * Math.sin(a * 3 - seed * 0.7));
      return Math.hypot(x - hx, z - hz) < ragged;
    };

    // Roof: a shared grid of vertices over the whole building.
    const index = new Map<number, number>();
    const vert = (gx: number, gz: number): number => {
      const key = gz * 100000 + gx;
      const got = index.get(key);
      if (got !== undefined) return got;
      const x = gx * STEP;
      const z = gz * STEP;
      let y = WALL_H + Math.min(RISE_CAP, inward(x, z) * SLOPE);
      // Broken roofing sags round the edge of a shell hole.
      if (damaged) {
        const d = Math.hypot(x - hx, z - hz);
        if (d < holeR * 1.35) y -= (1 - d / (holeR * 1.35)) * 5;
      }
      const id = roofPos.length / 3;
      roofPos.push(x, y, z);
      roofUv.push(x / W, 1 - z / H);
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
    const mat = terrain.roofMaterial(Math.floor(cx / TILE), Math.floor(cz / TILE));
    for (const k of comp.tiles) {
      const tx = k % map.w;
      const ty = Math.floor(k / map.w);
      const x0 = tx * TILE;
      const z0 = ty * TILE;
      const sides: [boolean, number, number, number, number, number, number][] = [
        // open?, ax, az, bx, bz, nx, nz (wall from a to b, facing n)
        [!isB(tx, ty - 1), x0, z0 + INSET, x0 + TILE, z0 + INSET, 0, -1],
        [!isB(tx, ty + 1), x0 + TILE, z0 + TILE - INSET, x0, z0 + TILE - INSET, 0, 1],
        [!isB(tx - 1, ty), x0 + INSET, z0 + TILE, x0 + INSET, z0, -1, 0],
        [!isB(tx + 1, ty), x0 + TILE - INSET, z0, x0 + TILE - INSET, z0 + TILE, 1, 0],
      ];
      sides.forEach(([open, ax, az, bx, bz, nx, nz], si) => {
        if (!open) return;
        // Pull the ends in at outside corners so the walls meet.
        const along: [number, number] = [Math.sign(bx - ax), Math.sign(bz - az)];
        const beforeOpen = !isB(tx - along[0], ty - along[1]);
        const afterOpen = !isB(tx + along[0], ty + along[1]);
        const a0x = ax + (beforeOpen ? along[0] * INSET : 0);
        const a0z = az + (beforeOpen ? along[1] * INSET : 0);
        const b0x = bx - (afterOpen ? along[0] * INSET : 0);
        const b0z = bz - (afterOpen ? along[1] * INSET : 0);
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
        }
      });
    }
    void ci;
  });

  if (roofPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(roofPos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(roofUv, 2));
    g.setIndex(roofIdx);
    g.computeVertexNormals();
    const roof = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: groundTex, roughness: 0.88, metalness: 0.05, side: THREE.DoubleSide }));
    roof.castShadow = true;
    roof.receiveShadow = true;
    group.add(roof);
  }
  if (wallPos.length) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(wallPos, 3));
    g.setAttribute('uv', new THREE.Float32BufferAttribute(wallUv, 2));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(wallNorm, 3));
    const walls = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ map: wallAtlas(), roughness: 0.92, side: THREE.DoubleSide }));
    walls.castShadow = true;
    walls.receiveShadow = true;
    group.add(walls);
  }
  return { group, info };
}
