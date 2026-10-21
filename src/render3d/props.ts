import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE } from '../data/balance';
import { T } from '../data/terrain';
import { hash2 } from '../core/rng';
import type { GameMap } from '../sim/grid';
import type { BuildingInfo } from './buildings';
import { chunkedInstances } from './instancing';
import { burlapTexture, stoneTexture } from './textures';

const tmp = new THREE.Object3D();
function m4(x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number, rx = 0, rz = 0): THREE.Matrix4 {
  tmp.position.set(x, y, z);
  tmp.rotation.set(rx, ry, rz);
  tmp.scale.set(sx, sy, sz);
  tmp.updateMatrix();
  return tmp.matrix.clone();
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], shadow = true): THREE.Group | null {
  return list.length ? chunkedInstances(geo, mat, list, { castShadow: shadow }) : null;
}

/** A steel hedgehog: three beams crossing. */
function hedgehog(): THREE.BufferGeometry {
  const a = new THREE.BoxGeometry(1, 0.12, 0.12);
  const parts = [a.clone().rotateZ(0.6), a.clone().rotateY(Math.PI / 2).rotateX(0.6), a.clone().rotateZ(Math.PI / 2).rotateY(0.6)];
  return mergeGeometries(parts)!;
}

/**
 * The things engineers build and the litter of war, as solid objects:
 * stone walls and ramparts, sandbag lines, wire, tank traps, and rubble and
 * timber round the shell-damaged houses. Rebuilt whenever the ground changes.
 */
export function buildProps(map: GameMap, buildings: BuildingInfo): THREE.Group {
  const group = new THREE.Group();
  const walls: THREE.Matrix4[] = [];
  const ramparts: THREE.Matrix4[] = [];
  const bags: THREE.Matrix4[] = [];
  const traps: THREE.Matrix4[] = [];
  const posts: THREE.Matrix4[] = [];
  const coils: THREE.Matrix4[] = [];
  const rubble: THREE.Matrix4[] = [];
  const timber: THREE.Matrix4[] = [];
  const is = (tx: number, ty: number, t: number) => map.inBounds(tx, ty) && map.get(tx, ty) === t;
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const t = map.get(tx, ty);
      const cx = tx * TILE + TILE / 2;
      const cz = ty * TILE + TILE / 2;
      const h = (i: number) => hash2(tx, ty, 500 + i);
      if (t === T.Wall) {
        const e = is(tx + 1, ty, T.Wall);
        const s = is(tx, ty + 1, T.Wall);
        const lone = !e && !s && !is(tx - 1, ty, T.Wall) && !is(tx, ty - 1, T.Wall);
        if (lone) {
          // What is left of a wall: a heap of stones.
          for (let i = 0; i < 6; i++) rubble.push(m4(cx + (h(i) - 0.5) * 10, 0.8, cz + (h(i + 9) - 0.5) * 10, h(i + 3) * 6, 2 + h(i + 5) * 2, 1.4 + h(i + 6), 2 + h(i + 7) * 2));
          continue;
        }
        walls.push(m4(cx, 3.5, cz, 0, 4, 7, 4));
        if (e) walls.push(m4(cx + TILE / 2, 3.5 - h(1) * 0.8, cz, 0, TILE, 7 - h(1) * 1.6, 3.6));
        if (s) walls.push(m4(cx, 3.5 - h(2) * 0.8, cz + TILE / 2, 0, 3.6, 7 - h(2) * 1.6, TILE));
      } else if (t === T.Rampart) {
        ramparts.push(m4(cx, 8, cz, 0, TILE, 16, TILE));
      } else if (t === T.Sandbag) {
        const horiz = is(tx - 1, ty, T.Sandbag) || is(tx + 1, ty, T.Sandbag) || !(is(tx, ty - 1, T.Sandbag) || is(tx, ty + 1, T.Sandbag));
        for (let row = 0; row < 3; row++) {
          const n = row === 2 ? 2 : 3;
          for (let i = 0; i < n; i++) {
            const along = (i - (n - 1) / 2) * 5.4 + (row === 1 ? 1.4 : 0);
            const across = row === 2 ? 0 : row === 0 ? -1.6 : 1.6;
            const y = row === 2 ? 3 : 1.1;
            const jx = horiz ? along : across;
            const jz = horiz ? across : along;
            bags.push(m4(cx + jx, y, cz + jz, (horiz ? 0 : Math.PI / 2) + (h(row * 4 + i) - 0.5) * 0.25, 1, 1, 1));
          }
        }
      } else if (t === T.TankTrap) {
        for (const [ox, oz] of [[-3.5, -3], [3.5, 3]]) traps.push(m4(cx + ox, 3.4, cz + oz, h(1) * 3, 9, 9, 9));
      } else if (t === T.Wire) {
        const horiz = is(tx - 1, ty, T.Wire) || is(tx + 1, ty, T.Wire) || !(is(tx, ty - 1, T.Wire) || is(tx, ty + 1, T.Wire));
        for (const o of [-7, 7]) posts.push(m4(cx + (horiz ? o : 0), 2.5, cz + (horiz ? 0 : o), 0, 0.6, 5, 0.6));
        for (let i = 0; i < 9; i++) {
          const o = -7 + i * 1.75;
          coils.push(m4(cx + (horiz ? o : 0), 2.4, cz + (horiz ? 0 : o), horiz ? Math.PI / 2 : 0, 1, 1, 1, 0, (h(i) - 0.5) * 0.4));
        }
      }
    }
  }
  // Rubble and broken timber round the shelled houses.
  buildings.damaged.forEach((b, k) => {
    for (let i = 0; i < 14; i++) {
      const a = hash2(k, i, 600) * Math.PI * 2;
      const d = b.size * (0.2 + hash2(k, i, 601) * 1.1);
      rubble.push(m4(b.x + Math.cos(a) * d, 0.7, b.y + Math.sin(a) * d, hash2(k, i, 602) * 6, 1.6 + hash2(k, i, 603) * 2.4, 1 + hash2(k, i, 604), 1.6 + hash2(k, i, 605) * 2));
    }
    for (let i = 0; i < 6; i++) {
      const a = hash2(k, i, 610) * Math.PI * 2;
      const d = b.size * (0.1 + hash2(k, i, 611) * 0.9);
      timber.push(m4(b.x + Math.cos(a) * d, 1.2, b.y + Math.sin(a) * d, hash2(k, i, 612) * 6, 9 + hash2(k, i, 613) * 6, 0.9, 1, (hash2(k, i, 614) - 0.5) * 0.4, (hash2(k, i, 615) - 0.5) * 0.5));
    }
  });

  const stone = new THREE.MeshStandardMaterial({ map: stoneTexture(), roughness: 0.95 });
  const add = (m: THREE.Group | null) => m && group.add(m);
  add(instanced(new THREE.BoxGeometry(1, 1, 1), stone, walls));
  add(instanced(new THREE.BoxGeometry(1, 1, 1), stone, ramparts));
  const bag = new THREE.SphereGeometry(1, 12, 6);
  bag.scale(2.8, 1.25, 1.7);
  add(instanced(bag, new THREE.MeshStandardMaterial({ map: burlapTexture(), roughness: 1 }), bags));
  add(instanced(hedgehog(), new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.6, metalness: 0.5 }), traps));
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c2b28, roughness: 0.7, metalness: 0.4 });
  add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x5a4428, roughness: 1 }), posts));
  add(instanced(new THREE.TorusGeometry(2.2, 0.12, 4, 12), metal, coils, false));
  add(instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 1, flatShading: true }), rubble));
  add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4e3a24, roughness: 1 }), timber));
  return group;
}
