import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import type { HeadGear } from '../data/types';
import type { Squad } from '../sim/entities';

/** How a unit is dressed and painted (from its army, or its doctrine kit). */
export interface UnitLook {
  cloth: string;
  helmet: string;
  style: HeadGear;
  pack: string;
  hull: string;
  turret: string;
  camo?: string[];
  barrel: number;
  emblem: 'sun' | 'star';
  chiHa: boolean;
}

const MAX_SOLDIERS = 1200;
const MAX_CREW_WEAPONS = 120;
/** Soldiers stand a little taller than life against the map, so they read at battle zoom. */
const SOLDIER_SCALE = 1.2;

const box = (w: number, h: number, d: number, x = 0, y = 0, z = 0) => new THREE.BoxGeometry(w, h, d).translate(x, y, z);

/**
 * One instanced mesh per body part, coloured per soldier. A soldier faces +x
 * with his feet at the origin; all parts share his transform except the legs,
 * which step back and forth as he walks.
 */
class PartMesh {
  readonly mesh: THREE.InstancedMesh;
  n = 0;
  private readonly color = new THREE.Color();

  constructor(geo: THREE.BufferGeometry, mat: THREE.Material, max: number) {
    this.mesh = new THREE.InstancedMesh(geo, mat, max);
    this.mesh.count = 0;
    this.mesh.castShadow = false;
    this.mesh.receiveShadow = true;
    this.mesh.frustumCulled = false;
    this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
  }

  add(m: THREE.Matrix4, color?: string): void {
    if (this.n >= this.mesh.instanceMatrix.count) return;
    this.mesh.setMatrixAt(this.n, m);
    if (color) this.mesh.setColorAt(this.n, this.color.set(color));
    this.n++;
  }

  begin(): void {
    this.n = 0;
  }

  end(): void {
    this.mesh.count = this.n;
    this.mesh.instanceMatrix.needsUpdate = true;
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    this.mesh.dispose();
  }
}

/** Headgear shapes, sitting on a head at the origin's height of 7. */
function headgear(): Record<HeadGear, THREE.BufferGeometry> {
  const at = (g: THREE.BufferGeometry, y: number) => g.translate(0, y, 0);
  const dome = (r: number, flat: number) => new THREE.SphereGeometry(r, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2).scale(1, flat, 1);
  return {
    m1: mergeGeometries([at(dome(1.45, 0.9), 7.1), at(new THREE.CylinderGeometry(1.75, 1.75, 0.18, 12), 7.1)])!,
    type90: mergeGeometries([at(dome(1.3, 0.85), 7.15), box(0.4, 1.2, 2.0, -1.2, 6.5, 0)])!,
    straw: mergeGeometries([at(new THREE.CylinderGeometry(3.1, 3.1, 0.2, 16), 7.25), at(new THREE.CylinderGeometry(1.15, 1.25, 1.1, 12), 7.8)])!,
    salakot: at(new THREE.ConeGeometry(2.9, 1.7, 14), 7.9),
    pith: mergeGeometries([at(dome(1.35, 1.05), 7.25), at(new THREE.CylinderGeometry(2.05, 2.1, 0.16, 14), 7.2)])!,
    cap: mergeGeometries([at(new THREE.CylinderGeometry(1.2, 1.1, 0.8, 12), 7.6), box(1.0, 0.12, 1.4, 1.1, 7.25, 0)])!,
    bandana: at(new THREE.CylinderGeometry(1.08, 1.08, 0.45, 12), 7.2),
    none: at(dome(1.02, 0.6), 7.0),
  };
}

const HEADGEAR: HeadGear[] = ['m1', 'type90', 'straw', 'salakot', 'pith', 'cap', 'bandana', 'none'];

/**
 * Soldiers, crew weapons and tanks as 3D models, kept in step with the battle
 * every frame. They only read the simulation. Soldiers and crew weapons are
 * instanced (a draw call per part for the whole battlefield); each tank is
 * its own small model with a turret that turns and a gun that recoils.
 */
export class Units3D {
  readonly group = new THREE.Group();
  private readonly legs: PartMesh;
  private readonly torso: PartMesh;
  private readonly arms: PartMesh;
  private readonly pack: PartMesh;
  private readonly head: PartMesh;
  private readonly rifle: PartMesh;
  private readonly blade: PartMesh;
  private readonly hats = new Map<HeadGear, PartMesh>();
  private readonly mg: PartMesh;
  private readonly mortar: PartMesh;
  private readonly atGun: PartMesh;
  private readonly tanks = new Map<number, { obj: THREE.Group; turret: THREE.Group; barrel: THREE.Object3D }>();
  private readonly strides = new Map<number, { x: number; y: number; phase: number }>();
  private readonly tankMats = new Map<string, THREE.Material>();
  private readonly m = new THREE.Matrix4();
  private readonly t = new THREE.Matrix4();

  constructor() {
    const cloth = new THREE.MeshStandardMaterial({ roughness: 0.95 });
    const plain = (color: number, roughness = 0.9, metalness = 0) => new THREE.MeshStandardMaterial({ color, roughness, metalness });
    this.legs = new PartMesh(mergeGeometries([box(1.0, 2.8, 0.9, 0, 1.4, 0.6)])!, cloth, MAX_SOLDIERS * 2);
    this.torso = new PartMesh(box(1.9, 3.4, 2.6, 0, 4.5, 0), cloth, MAX_SOLDIERS);
    this.arms = new PartMesh(mergeGeometries([box(2.6, 0.8, 0.8, 1.0, 5.0, 1.0), box(2.6, 0.8, 0.8, 1.0, 5.0, -1.0)])!, cloth, MAX_SOLDIERS);
    this.pack = new PartMesh(box(1.2, 2.0, 2.0, -1.5, 4.7, 0), plain(0xffffff), MAX_SOLDIERS);
    this.head = new PartMesh(new THREE.SphereGeometry(1.0, 10, 8).translate(0, 7.0, 0), plain(0xa8754f, 0.8), MAX_SOLDIERS);
    this.rifle = new PartMesh(box(6.2, 0.45, 0.45, 2.6, 5.1, 0.4), plain(0x2b2118, 0.7), MAX_SOLDIERS);
    this.blade = new PartMesh(box(3.0, 0.25, 0.5, 2.0, 4.8, 0.6), plain(0xc9c6b8, 0.35, 0.6), MAX_SOLDIERS);
    const gear = headgear();
    const hatMat = new THREE.MeshStandardMaterial({ roughness: 0.85 });
    for (const style of HEADGEAR) this.hats.set(style, new PartMesh(gear[style], hatMat, MAX_SOLDIERS));
    const gun = plain(0x232320, 0.5, 0.6);
    // Machine gun on its tripod.
    this.mg = new PartMesh(
      mergeGeometries([box(7, 0.8, 0.8, 4.0, 2.3, 0), box(2.2, 1.4, 1.4, 1.0, 2.3, 0), box(0.4, 2.2, 0.4, 2.5, 1.1, 1.2).rotateX(0.2), box(0.4, 2.2, 0.4, 2.5, 1.1, -1.2).rotateX(-0.2)])!,
      gun,
      MAX_CREW_WEAPONS,
    );
    // Mortar: a tube leaning on its bipod over a base plate.
    this.mortar = new PartMesh(
      mergeGeometries([new THREE.CylinderGeometry(0.55, 0.6, 6, 8).translate(0, 3, 0).rotateZ(-0.75).translate(1, 0, 0), box(2.6, 0.4, 2.6, -0.6, 0.2, 0)])!,
      gun,
      MAX_CREW_WEAPONS,
    );
    // Anti-tank gun: shield, barrel and wheels.
    this.atGun = new PartMesh(
      mergeGeometries([
        box(0.4, 3.6, 6.4, 2.2, 2.6, 0),
        new THREE.CylinderGeometry(0.42, 0.5, 11, 8).rotateZ(-Math.PI / 2).translate(6.5, 2.8, 0),
        new THREE.CylinderGeometry(1.5, 1.5, 0.6, 12).rotateX(Math.PI / 2).translate(1.2, 1.5, 2.8),
        new THREE.CylinderGeometry(1.5, 1.5, 0.6, 12).rotateX(Math.PI / 2).translate(1.2, 1.5, -2.8),
        box(7, 0.6, 0.6, -2.5, 1.0, 1.2).rotateY(0.15),
        box(7, 0.6, 0.6, -2.5, 1.0, -1.2).rotateY(-0.15),
      ])!,
      plain(0x4a4d38, 0.6, 0.4),
      MAX_CREW_WEAPONS,
    );
    const parts = [this.legs, this.torso, this.arms, this.pack, this.head, this.rifle, this.blade, ...this.hats.values(), this.mg, this.mortar, this.atGun];
    for (const p of parts) {
      p.mesh.renderOrder = 1;
      this.group.add(p.mesh);
    }
  }

  /** Bring the models in line with this frame's visible squads. */
  sync(squads: readonly Squad[], time: number, lookOf: (sq: Squad) => UnitLook): void {
    const parts = [this.legs, this.torso, this.arms, this.pack, this.head, this.rifle, this.blade, ...this.hats.values(), this.mg, this.mortar, this.atGun];
    for (const p of parts) p.begin();
    const seenTanks = new Set<number>();
    const seenModels = new Set<number>();
    for (const sq of squads) {
      if (sq.def.kind === 'vehicle') {
        seenTanks.add(sq.id);
        this.syncTank(sq, time, lookOf(sq));
        continue;
      }
      if (sq.def.kind !== 'infantry' && sq.def.kind !== 'team') continue;
      const look = lookOf(sq);
      const prone = sq.suppState === 'pinned';
      let crewDrawn = false;
      for (const model of sq.models) {
        if (!model.alive) continue;
        seenModels.add(model.id);
        const last = this.strides.get(model.id);
        const moved = last ? Math.hypot(model.pos.x - last.x, model.pos.y - last.y) : 0;
        const phase = (last?.phase ?? Math.random() * 6) + moved * 0.55;
        this.strides.set(model.id, { x: model.pos.x, y: model.pos.y, phase });
        const w = model.weapons[0]?.def;
        // The soldier: standing (stepping if he moved) or flat on the ground when pinned.
        this.m.makeRotationY(-model.facing).setPosition(model.pos.x, 0, model.pos.y).multiply(this.t.makeScale(SOLDIER_SCALE, SOLDIER_SCALE, SOLDIER_SCALE));
        if (prone) this.m.multiply(this.t.makeTranslation(-3.6, 1.0, 0)).multiply(this.t.makeRotationZ(-Math.PI / 2));
        const step = moved > 0.02 ? Math.sin(phase) * 0.9 : 0;
        this.legs.add(this.t.copy(this.m).multiply(new THREE.Matrix4().makeTranslation(step, 0, 0)), look.cloth);
        this.legs.add(this.t.copy(this.m).multiply(new THREE.Matrix4().makeTranslation(-step, 0, -1.2)), look.cloth);
        this.torso.add(this.m, look.cloth);
        this.arms.add(this.m, look.cloth);
        this.pack.add(this.m, look.pack);
        this.head.add(this.m);
        this.hats.get(look.style)?.add(this.m, look.helmet);
        if (w && !w.crew) (w.range < 30 ? this.blade : this.rifle).add(this.m);
        // The crew weapon, once per team, where its gunner is.
        if (w?.crew && !crewDrawn) {
          crewDrawn = true;
          const facing = sq.setup === 'packed' ? model.facing : sq.setupFacing;
          const g = new THREE.Matrix4().makeRotationY(-facing).setPosition(model.pos.x, 0, model.pos.y);
          const target = w.indirect ? this.mortar : w.prefers === 'vehicle' ? this.atGun : this.mg;
          if (sq.setup !== 'packed' || w.prefers === 'vehicle') target.add(g);
        }
      }
    }
    for (const p of parts) p.end();
    for (const [id, tank] of this.tanks) {
      if (seenTanks.has(id)) continue;
      this.group.remove(tank.obj);
      tank.obj.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
      this.tanks.delete(id);
    }
    if (this.strides.size > seenModels.size + 400) for (const id of this.strides.keys()) if (!seenModels.has(id)) this.strides.delete(id);
  }

  private tankMat(color: string, metal = 0.35): THREE.Material {
    let m = this.tankMats.get(color);
    if (!m) this.tankMats.set(color, (m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: metal })));
    return m;
  }

  private buildTank(sq: Squad, look: UnitLook): { obj: THREE.Group; turret: THREE.Group; barrel: THREE.Object3D } {
    const vd = sq.def.vehicle!;
    const L = vd.length;
    const W = vd.width;
    const obj = new THREE.Group();
    const mesh = (g: THREE.BufferGeometry, mat: THREE.Material) => {
      const m = new THREE.Mesh(g, mat);
      m.receiveShadow = true;
      return m;
    };
    const track = this.tankMat('#23231f', 0.2);
    for (const side of [-1, 1]) obj.add(mesh(box(L, 3.0, 4.6, 0, 1.6, side * (W / 2 - 2.3)), track));
    const hull = this.tankMat(look.hull);
    obj.add(mesh(box(L - 3, 3.2, W - 6.5, -0.5, 4.1, 0), hull));
    // Track guards over the tracks.
    for (const side of [-1, 1]) obj.add(mesh(box(L - 1, 0.5, 5, 0, 3.4, side * (W / 2 - 2.5)), hull));
    if (look.chiHa) obj.add(mesh(box(5, 2.2, W - 7, L / 2 - 4, 4.4, 0).rotateZ(0.4), hull));
    // Camouflage blotches on the deck.
    (look.camo ?? []).forEach((c, i) => obj.add(mesh(box(6 + i * 2, 0.12, 4 + i, -4 + i * 6, 5.75, (i % 2 ? 1 : -1) * 2.5), this.tankMat(c))));
    // Engine deck grille.
    obj.add(mesh(box(6, 0.15, W - 9, -L / 2 + 5, 5.75, 0), this.tankMat('#1d1d19', 0.1)));
    const turret = new THREE.Group();
    turret.position.set(look.chiHa ? 1 : 0.5, 5.7, look.chiHa ? -1.2 : 0);
    const tr = W * 0.3;
    const tMat = this.tankMat(look.turret);
    turret.add(mesh(look.chiHa ? new THREE.CylinderGeometry(tr * 0.85, tr, 3.2, 14).translate(0, 1.6, 0) : box(tr * 2, 3, tr * 1.7, 0, 1.5, 0), tMat));
    // Hatch and the army's marking on the turret top.
    turret.add(mesh(new THREE.CylinderGeometry(tr * 0.32, tr * 0.32, 0.4, 10).translate(-tr * 0.35, 3.25, 0), this.tankMat('#2a2a24', 0.2)));
    turret.add(mesh(new THREE.CircleGeometry(tr * 0.3, look.emblem === 'star' ? 5 : 12).rotateX(-Math.PI / 2).translate(tr * 0.35, 3.08, 0), new THREE.MeshStandardMaterial({ color: 0xe8c547, roughness: 0.6 })));
    const barrel = new THREE.Group();
    barrel.add(mesh(new THREE.CylinderGeometry(0.55, 0.7, look.barrel, 10).rotateZ(-Math.PI / 2).translate(look.barrel / 2 + tr * 0.6, 1.6, 0), this.tankMat('#1b1b18', 0.5)));
    barrel.add(mesh(box(1.6, 1.4, 1.4, look.barrel + tr * 0.6, 1.6, 0), this.tankMat('#1b1b18', 0.5)));
    turret.add(barrel);
    if (look.chiHa) {
      // The hoop aerial round the turret.
      turret.add(mesh(new THREE.TorusGeometry(tr + 2, 0.18, 4, 24).rotateX(Math.PI / 2).translate(-1, 3.4, 0), this.tankMat('#1e1e1a', 0.4)));
    }
    obj.add(turret);
    return { obj, turret, barrel };
  }

  private syncTank(sq: Squad, time: number, look: UnitLook): void {
    let tank = this.tanks.get(sq.id);
    if (!tank) {
      tank = this.buildTank(sq, look);
      this.tanks.set(sq.id, tank);
      this.group.add(tank.obj);
    }
    tank.obj.position.set(sq.pos.x, 0, sq.pos.y);
    tank.obj.rotation.y = -sq.heading;
    tank.turret.rotation.y = -(sq.turret - sq.heading);
    // The gun jumps back when it fires.
    const since = time - sq.lastFired;
    tank.barrel.position.x = since < 0.18 ? -1.8 * (1 - since / 0.18) : 0;
  }

  dispose(): void {
    for (const p of [this.legs, this.torso, this.arms, this.pack, this.head, this.rifle, this.blade, ...this.hats.values(), this.mg, this.mortar, this.atGun]) p.dispose();
    for (const tank of this.tanks.values()) tank.obj.traverse((o) => o instanceof THREE.Mesh && o.geometry.dispose());
    for (const m of this.tankMats.values()) m.dispose();
  }
}
