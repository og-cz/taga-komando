import * as THREE from 'three';
import type { Squad } from '../sim/entities';
import { burlapTexture, stoneTexture, wallAtlas } from './textures';

/** A hipped roof over a w × d rectangle centred on the origin, rising `h`. */
function hipRoof(w: number, d: number, h: number): THREE.BufferGeometry {
  const long = w >= d;
  const half = (long ? d : w) / 2;
  const a = long ? w / 2 - half : 0;
  const b = long ? 0 : d / 2 - half;
  const x0 = -w / 2;
  const x1 = w / 2;
  const z0 = -d / 2;
  const z1 = d / 2;
  const r0 = long ? [-a, h, 0] : [0, h, -b];
  const r1 = long ? [a, h, 0] : [0, h, b];
  const tri = (p: number[], q: number[], r: number[]) => [...p, ...q, ...r];
  const pos = long
    ? [
        ...tri([x0, 0, z0], r0, [x1, 0, z0]), ...tri([x1, 0, z0], r0, r1),
        ...tri([x0, 0, z1], [x1, 0, z1], r0), ...tri([x1, 0, z1], r1, r0),
        ...tri([x0, 0, z0], [x0, 0, z1], r0), ...tri([x1, 0, z0], r1, [x1, 0, z1]),
      ]
    : [
        ...tri([x0, 0, z0], r0, [x0, 0, z1]), ...tri([x0, 0, z1], r0, r1),
        ...tri([x1, 0, z0], [x1, 0, z1], r0), ...tri([x1, 0, z1], r1, r0),
        ...tri([x0, 0, z0], [x1, 0, z0], r0), ...tri([x0, 0, z1], r1, [x1, 0, z1]),
      ];
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

const mats = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material): THREE.Material {
  let m = mats.get(key);
  if (!m) mats.set(key, (m = make()));
  return m;
}

function mesh(geo: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0): THREE.Mesh {
  const m = new THREE.Mesh(geo, material);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  return m;
}

/** A house: walls and a hipped roof, centred on the origin. */
function house(w: number, d: number, wallH: number, roofH: number, wall: THREE.Material, roof: THREE.Material): THREE.Group {
  const g = new THREE.Group();
  g.add(mesh(new THREE.BoxGeometry(w - 3, wallH, d - 3), wall, 0, wallH / 2, 0));
  g.add(mesh(hipRoof(w, d, roofH), roof, 0, wallH, 0));
  return g;
}

function plaster(): THREE.Material {
  return mat('plaster', () => {
    const t = wallAtlas().clone();
    t.repeat.set(1 / 3, 1 / 3);
    t.offset.set(1 / 3, 2 / 3);
    t.needsUpdate = true;
    return new THREE.MeshStandardMaterial({ map: t, roughness: 0.92 });
  });
}

/**
 * Headquarters, tier buildings and emplacements as solid buildings, kept in
 * step with the battle: they appear when built, rise while they go up, and
 * vanish when destroyed (the fire system marks the spot).
 */
export class Structures3D {
  readonly group = new THREE.Group();
  private readonly objects = new Map<number, { obj: THREE.Object3D; progress: number }>();

  /** Update to this frame's visible structures; true if shadows need redrawing. */
  sync(list: readonly Squad[], factionOf: (sq: Squad) => string): boolean {
    let changed = false;
    const seen = new Set<number>();
    for (const sq of list) {
      seen.add(sq.id);
      let entry = this.objects.get(sq.id);
      if (!entry) {
        const obj = this.build(sq, factionOf(sq));
        obj.position.set(sq.pos.x, 0, sq.pos.y);
        this.group.add(obj);
        entry = { obj, progress: -1 };
        this.objects.set(sq.id, entry);
        changed = true;
      }
      // Still going up: the building rises with the work.
      const progress = sq.building === null ? 1 : sq.building;
      if (Math.abs(progress - entry.progress) > 0.04 || (progress === 1 && entry.progress !== 1)) {
        entry.progress = progress;
        entry.obj.scale.y = 0.12 + 0.88 * progress;
        changed = true;
      }
    }
    for (const [id, entry] of this.objects) {
      if (seen.has(id)) continue;
      this.group.remove(entry.obj);
      this.objects.delete(id);
      changed = true;
    }
    return changed;
  }

  private build(sq: Squad, faction: string): THREE.Object3D {
    const filipino = faction !== 'ija';
    const r = sq.def.radius;
    const g = new THREE.Group();
    if (sq.def.role === 'hq') {
      // A walled compound with the house at the back.
      const wall = r + 7;
      const wallMat = filipino ? mat('adobe', () => new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0xd8c8a0, roughness: 0.95 })) : mat('timber', () => new THREE.MeshStandardMaterial({ color: 0x4a3a28, roughness: 0.9 }));
      const t = filipino ? 2.2 : 1.2;
      const hgt = filipino ? 5 : 6;
      g.add(mesh(new THREE.BoxGeometry(wall * 2, hgt, t), wallMat, 0, hgt / 2, -wall));
      g.add(mesh(new THREE.BoxGeometry(t, hgt, wall * 2), wallMat, -wall, hgt / 2, 0));
      g.add(mesh(new THREE.BoxGeometry(t, hgt, wall * 2), wallMat, wall, hgt / 2, 0));
      // The front wall, with the gate open in the middle.
      const seg = wall - 7;
      g.add(mesh(new THREE.BoxGeometry(seg, hgt, t), wallMat, -7 - seg / 2, hgt / 2, wall));
      g.add(mesh(new THREE.BoxGeometry(seg, hgt, t), wallMat, 7 + seg / 2, hgt / 2, wall));
      const roof = filipino ? mat('clay', () => new THREE.MeshStandardMaterial({ color: 0xa4552f, roughness: 0.85 })) : mat('kawara', () => new THREE.MeshStandardMaterial({ color: 0x4c535b, roughness: 0.7 }));
      const walls = filipino ? plaster() : mat('darkwood', () => new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
      const h = house(r * 2, r * 1.56, 13, r * 0.62, walls, roof);
      h.position.z = -3;
      g.add(h);
    } else if (sq.def.role === 'tech') {
      const tier = Number(sq.def.id.slice(-1));
      const w = r * 2.8;
      const d = r * 1.8;
      const roof =
        tier === 3
          ? mat('iron', () => new THREE.MeshStandardMaterial({ color: 0x80837f, roughness: 0.55, metalness: 0.45 }))
          : filipino
            ? mat('nipa', () => new THREE.MeshStandardMaterial({ color: 0x8f7a48, roughness: 1 }))
            : mat('kawara', () => new THREE.MeshStandardMaterial({ color: 0x4c535b, roughness: 0.7 }));
      const walls = filipino ? plaster() : mat('darkwood', () => new THREE.MeshStandardMaterial({ color: 0x5a4632, roughness: 0.9 }));
      g.add(house(w, d, 11, tier === 3 ? d * 0.18 : d * 0.4, walls, roof));
    } else if (sq.def.id === 'mg_nest') {
      // A ring of sandbags, open at the back, the gun over the front.
      const bag = new THREE.SphereGeometry(1, 10, 6);
      bag.scale(2.6, 1.2, 1.6);
      const bags = mat('burlap', () => new THREE.MeshStandardMaterial({ map: burlapTexture(), roughness: 1 }));
      for (let layer = 0; layer < 2; layer++) {
        for (let i = 0; i < 9; i++) {
          const a = -Math.PI * 0.75 + (i / 8) * Math.PI * 1.5 + (layer ? 0.09 : 0);
          const m = mesh(bag, bags, Math.cos(a) * r * 0.85, 1.1 + layer * 2, Math.sin(a) * r * 0.85);
          m.rotation.y = -a + Math.PI / 2;
          g.add(m);
        }
      }
      const gun = mesh(new THREE.BoxGeometry(9, 1, 1), mat('gunmetal', () => new THREE.MeshStandardMaterial({ color: 0x232320, roughness: 0.5, metalness: 0.6 })), 4, 4, 0);
      g.add(gun);
      g.rotation.y = -sq.heading;
    } else if (sq.def.id === 'bunker') {
      // A low concrete box, half dug in, with a firing slit at the front.
      const conc = mat('concrete', () => new THREE.MeshStandardMaterial({ map: stoneTexture(), color: 0xa09a8c, roughness: 0.95 }));
      g.add(mesh(new THREE.BoxGeometry(r * 2.2, 6, r * 2.2), conc, 0, 3, 0));
      g.add(mesh(new THREE.BoxGeometry(r * 2.5, 1.2, r * 2.5), conc, 0, 6.4, 0));
      g.add(mesh(new THREE.BoxGeometry(1, 1.4, r * 1.2), mat('slit', () => new THREE.MeshBasicMaterial({ color: 0x080806 })), r * 1.1, 4.2, 0));
      g.rotation.y = -sq.heading;
    } else {
      // A field hospital tent: a canvas ridge tent with a red cross on the roof.
      const shape = new THREE.Shape([new THREE.Vector2(-r * 0.8, 0), new THREE.Vector2(r * 0.8, 0), new THREE.Vector2(0, r * 0.75)]);
      const tent = new THREE.ExtrudeGeometry(shape, { depth: r * 1.9, bevelEnabled: false });
      tent.translate(0, 0, -r * 0.95);
      const canvas = mat('canvas', () => new THREE.MeshStandardMaterial({ color: 0xb5a77a, roughness: 1 }));
      const t = mesh(tent, canvas, 0, 0, 0);
      g.add(t);
      const red = mat('red', () => new THREE.MeshStandardMaterial({ color: 0xb3261e, roughness: 0.9 }));
      const cross1 = mesh(new THREE.BoxGeometry(6, 0.3, 2), red, 0, r * 0.75 + 0.2, 0);
      const cross2 = mesh(new THREE.BoxGeometry(2, 0.3, 6), red, 0, r * 0.75 + 0.2, 0);
      g.add(cross1, cross2);
    }
    return g;
  }

  dispose(): void {
    this.group.traverse((o) => {
      if (o instanceof THREE.Mesh) o.geometry.dispose();
    });
    for (const m of mats.values()) m.dispose();
    mats.clear();
  }
}
