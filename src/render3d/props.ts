import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { TILE } from '../data/balance';
import { T } from '../data/terrain';
import { hash2 } from '../core/rng';
import type { GameMap } from '../sim/grid';
import type { BuildingInfo } from './buildings';
import type { VisualLayout } from '../render/layout';
import { chunkedInstances } from './instancing';
import { model } from './models';
import { burlapTexture, plankTexture, stoneTexture } from './textures';

const tmp = new THREE.Object3D();
function m4(x: number, y: number, z: number, ry: number, sx: number, sy: number, sz: number, rx = 0, rz = 0): THREE.Matrix4 {
  tmp.position.set(x, y, z);
  tmp.rotation.set(rx, ry, rz);
  tmp.scale.set(sx, sy, sz);
  tmp.updateMatrix();
  return tmp.matrix.clone();
}

function instanced(geo: THREE.BufferGeometry, mat: THREE.Material, list: THREE.Matrix4[], shadow = true, colors?: THREE.Color[]): THREE.Group | null {
  return list.length ? chunkedInstances(geo, mat, list, { castShadow: shadow, colors }) : null;
}

/**
 * A filled sandbag: a pillow of burlap, full and round in the middle, pinched
 * flat at the tied and folded ends, sagging onto whatever it lies on.
 */
function sandbag(): THREE.BufferGeometry {
  const g = new THREE.BoxGeometry(2, 2, 2, 10, 4, 6);
  const p = g.attributes.position;
  for (let i = 0; i < p.count; i++) {
    const u = p.getX(i);
    const v = p.getY(i);
    const w = p.getZ(i);
    // Rounded in section, thinner towards the ends, flat underneath.
    const end = 1 - Math.pow(Math.abs(u), 6) * 0.45;
    const r = Math.hypot(v, w * 0.8) || 1;
    const k = Math.min(1, 1 / r) * 0.35 + 0.65;
    p.setXYZ(i, u * 2.8, (v < 0 ? v * 0.75 : v * k) * 1.25 * end, w * k * 1.7 * end);
  }
  g.computeVertexNormals();
  return g;
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
export function buildProps(map: GameMap, buildings: BuildingInfo, layout: VisualLayout | null): THREE.Group {
  const group = new THREE.Group();
  const walls: THREE.Matrix4[] = [];
  const ramparts: THREE.Matrix4[] = [];
  const bags: THREE.Matrix4[] = [];
  const traps: THREE.Matrix4[] = [];
  const posts: THREE.Matrix4[] = [];
  const coils: THREE.Matrix4[] = [];
  const rubble: THREE.Matrix4[] = [];
  const timber: THREE.Matrix4[] = [];
  const bagTint: THREE.Color[] = [];
  const barrels: THREE.Matrix4[] = [];
  const barrelTint: THREE.Color[] = [];
  const crates: THREE.Matrix4[] = [];
  /** Where a crate or a jerrycan stands (position and turn only), for the imported models. */
  const crateAt: THREE.Matrix4[] = [];
  const canAt: THREE.Matrix4[] = [];
  const fencePosts: THREE.Matrix4[] = [];
  const fenceRails: THREE.Matrix4[] = [];
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
            bags.push(m4(cx + jx, y, cz + jz, (horiz ? 0 : Math.PI / 2) + (h(row * 4 + i) - 0.5) * 0.25, 1, 1, 1, (h(row * 4 + i + 30) - 0.5) * 0.12, (h(row * 4 + i + 40) - 0.5) * 0.1));
            // Behind some positions, an ammunition crate and a can of water.
            if (row === 0 && i === 0 && h(90) < 0.4) {
              crateAt.push(m4(cx + (horiz ? 0 : 5), 0, cz + (horiz ? 5 : 0), (horiz ? 0 : Math.PI / 2) + (h(91) - 0.5) * 0.4, 1, 1, 1));
              if (h(92) < 0.6) canAt.push(m4(cx + (horiz ? 3.5 : 6), 0, cz + (horiz ? 6 : 3.5), h(93) * 6, 1, 1, 1));
            }
            // Bags from different batches: some paler, some darker and damp.
            const k = 0.78 + h(row * 4 + i + 50) * 0.4;
            bagTint.push(new THREE.Color(k, k * (0.97 + h(row * 4 + i + 60) * 0.05), k * 0.92));
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
  // Yards and field edges: oil drums and crates by the houses, and weathered
  // post-and-rail fences where the fields meet the paddies.
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      if (map.get(tx, ty) !== T.Open) continue;
      const h = (i: number) => hash2(tx, ty, 800 + i);
      const cx = tx * TILE + TILE / 2;
      const cz = ty * TILE + TILE / 2;
      const byHouse = [[1, 0], [-1, 0], [0, 1], [0, -1]].find(([dx, dy]) => is(tx + dx, ty + dy, T.Building));
      if (byHouse && h(0) < 0.16) {
        // Against the wall, a little in from the tile edge.
        const bx = cx + byHouse[0] * 4 + (h(1) - 0.5) * 6;
        const bz = cz + byHouse[1] * 4 + (h(2) - 0.5) * 6;
        const n = 1 + Math.floor(h(3) * 3);
        for (let i = 0; i < n; i++) {
          const ox = (i % 2) * 2.5 - 1.2;
          const oz = Math.floor(i / 2) * 2.5 - 1.2;
          barrels.push(m4(bx + ox, 1.6, bz + oz, h(10 + i) * 6, 1, 1, 1, (h(20 + i) - 0.5) * 0.06, (h(30 + i) - 0.5) * 0.06));
          const rust = h(40 + i);
          barrelTint.push(rust < 0.4 ? new THREE.Color(0x4a5236) : rust < 0.7 ? new THREE.Color(0x6a4a30) : new THREE.Color(0x3a3c3a));
        }
        if (h(4) < 0.6) {
          crates.push(m4(bx - byHouse[1] * 4 + (h(5) - 0.5) * 2, 1.2, bz + byHouse[0] * 4, h(6) * 0.6, 2.6, 2.4, 2.6));
          crateAt.push(m4(bx - byHouse[1] * 5 + (h(5) - 0.5) * 2, 0, bz + byHouse[0] * 5, h(6) * 6, 1, 1, 1));
        }
        if (h(7) < 0.3) crates.push(m4(bx - byHouse[1] * 4, 3.4, bz + byHouse[0] * 4, h(8), 2, 2, 2));
        if (h(9) < 0.5) canAt.push(m4(bx + byHouse[1] * 3, 0, bz - byHouse[0] * 3, h(11) * 6, 1, 1, 1));
      }
    }
  }
  // Fences round the paddies, along their smooth outline just outside the dike: a post
  // every seven units or so, two rails between, the odd rail fallen and the odd gap.
  for (const line of layout?.paddyEdges() ?? []) {
    let prev = line[0];
    let run = 0;
    let k = Math.floor(prev.x * 7 + prev.y * 13);
    const post = (x: number, z: number) => {
      const lean = (hash2(k, 1, 830) - 0.5) * 0.15;
      fencePosts.push(m4(x, 2.6, z, hash2(k, 2, 830) * 3, 0.7, 5.2, 0.7, lean, -lean));
    };
    post(prev.x, prev.y);
    let last = prev;
    for (let i = 1; i < line.length; i++) {
      const p = line[i];
      run += Math.hypot(p.x - prev.x, p.y - prev.y);
      prev = p;
      if (run < 7 && i < line.length - 1) continue;
      run = 0;
      k++;
      if (hash2(k, 3, 830) < 0.06) {
        // A gap where the fence has come down.
        last = p;
        continue;
      }
      post(p.x, p.y);
      const len = Math.hypot(p.x - last.x, p.y - last.y);
      const yaw = -Math.atan2(p.y - last.y, p.x - last.x);
      for (const [y, j] of [[2.2, 0], [4.2, 1]]) {
        if (hash2(k, 4 + j, 830) < 0.12) continue;
        const sag = (hash2(k, 6 + j, 830) - 0.5) * 0.08;
        fenceRails.push(m4((p.x + last.x) / 2, y, (p.y + last.y) / 2, yaw, len + 0.6, 0.45, 0.35, 0, sag));
      }
      last = p;
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
  add(instanced(sandbag(), new THREE.MeshStandardMaterial({ map: burlapTexture(), roughness: 1 }), bags, true, bagTint));
  // Oil drums: ribbed steel, painted or rusting.
  const drum = new THREE.CylinderGeometry(1.15, 1.15, 3.2, 14, 1);
  add(instanced(drum, new THREE.MeshStandardMaterial({ roughness: 0.7, metalness: 0.35 }), barrels, true, barrelTint));
  // Crates and jerrycans: the imported models when they have loaded, plank boxes until then.
  const crate = model('crate');
  const can = model('jerrycan');
  if (crate) add(instanced(crate.geometry, crate.material, crateAt));
  else add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ map: plankTexture(), roughness: 0.95 }), crates));
  if (can) add(instanced(can.geometry, can.material, canAt));
  add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x6e604c, roughness: 1 }), fencePosts));
  add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x8a7a62, roughness: 1 }), fenceRails));
  add(instanced(hedgehog(), new THREE.MeshStandardMaterial({ color: 0x3a3a36, roughness: 0.6, metalness: 0.5 }), traps));
  const metal = new THREE.MeshStandardMaterial({ color: 0x2c2b28, roughness: 0.7, metalness: 0.4 });
  add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x5a4428, roughness: 1 }), posts));
  add(instanced(new THREE.TorusGeometry(2.2, 0.12, 4, 12), metal, coils, false));
  add(instanced(new THREE.DodecahedronGeometry(1, 0), new THREE.MeshStandardMaterial({ color: 0x8a8070, roughness: 1, flatShading: true }), rubble));
  add(instanced(new THREE.BoxGeometry(1, 1, 1), new THREE.MeshStandardMaterial({ color: 0x4e3a24, roughness: 1 }), timber));
  return group;
}
