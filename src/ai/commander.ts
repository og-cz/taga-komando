import { canGarrison, type House } from '../sim/systems/garrison';
import { ABILITIES } from '../data/abilities';
import { BUILDABLES } from '../data/buildables';
import { LOGISTICS, TILE } from '../data/balance';
import type { TeamId, UnitRole } from '../data/types';
import { UNITS } from '../data/units';
import { UPGRADES } from '../data/upgrades';
import { WEAPONS } from '../data/weapons';
import { angleDiff, dist, lerpVec, type Vec2 } from '../core/vec';
import {
  issueAbility,
  issueAttack,
  issueAttackMove,
  issueBuild,
  issueMove,
  issueReinforce,
  issueRepair,
  issueRetreat,
  issueSetup,
  issueUpgrade,
  queueProduction,
  issueGarrison,
} from '../sim/commands';
import { aliveCount, healthFraction, isSoft, type CapturePoint, type Squad } from '../sim/entities';
import { fortPriority } from '../sim/systems/combat';
import { callInBlock, chooseDoctrine, useCallIn } from '../sim/systems/doctrine';
import { DOCTRINES, doctrinesOf } from '../data/doctrines';
import { coverAt } from '../sim/systems/cover';
import { canAfford } from '../sim/systems/economy';
import { canReinforceHere, reinforceCost } from '../sim/systems/logistics';
import type { World } from '../sim/world';

/**
 * Skirmish opponent. It only knows what its own units can see and it issues
 * orders through the same command API as the player.
 */
export class AICommander {
  private timer = 0;
  private readonly objective = new Map<number, number>();
  private readonly seenVehicles = new Set<number>();

  constructor(readonly team: TeamId) {}

  update(world: World, dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = 0.8;
    const own = world.squads.filter((s) => s.team === this.team && !s.dead && s.def.kind !== 'structure');
    this.scout(world);
    this.commander(world, own);
    this.produce(world, own);
    for (const sq of own) this.control(world, sq, own);
    for (const id of this.objective.keys()) if (!world.get(id)) this.objective.delete(id);
  }

  private enemies(world: World): Squad[] {
    return world.squads.filter((s) => !s.dead && s.team !== this.team && world.canSee(this.team, s));
  }

  private scout(world: World): void {
    for (const e of this.enemies(world)) if (e.def.kind === 'vehicle') this.seenVehicles.add(e.id);
    for (const id of this.seenVehicles) if (!world.get(id)) this.seenVehicles.delete(id);
  }

  private produce(world: World, own: Squad[]): void {
    const hq = world.hqOf(this.team);
    if (!hq || hq.production.length > 0) return;
    const t = world.teams[this.team];
    const counts: Record<UnitRole, number> = { hq: 0, line: 0, mg: 0, mortar: 0, at: 0, tank: 0, engineer: 0, fort: 0, tech: 0 };
    for (const sq of own) counts[sq.def.role]++;
    const unitFor = (role: UnitRole) => t.faction.roster.find((id) => UNITS[id].role === role);
    const threats = this.seenVehicles.size;

    // Hold manpower back when a tier building is due and the engineers are waiting on it.
    const due = this.nextTech(world);
    if (due && counts.line >= 2 && !canAfford(t.resources, BUILDABLES[due].cost)) return;

    const plan: [boolean, UnitRole, boolean][] = [
      // [condition, role, skip if unaffordable]
      [counts.engineer < 1, 'engineer', false],
      [counts.line < 2, 'line', false],
      [threats > 0 && counts.at < Math.min(3, threats + 1), 'at', false],
      [counts.mg < 1, 'mg', false],
      [counts.tank < 1, 'tank', true],
      [counts.line < 4, 'line', false],
      [this.special(world, own) < 2, 'special' as UnitRole, true],
      [counts.mortar < 1, 'mortar', false],
      [counts.engineer < 1 && counts.tank > 0, 'engineer', false],
      [counts.tank < 2, 'tank', true],
      [counts.at < 1, 'at', false],
      [counts.line < 6, 'line', false],
    ];
    for (const [want, role, optional] of plan) {
      if (!want) continue;
      const id = role === ('special' as UnitRole) ? this.specialUnit(world) : unitFor(role);
      // Units whose tier building is not up yet are skipped.
      if (!id || !world.hasTech(this.team, UNITS[id].requires)) continue;
      if (!canAfford(t.resources, UNITS[id].cost)) {
        if (optional) continue;
        return;
      }
      const req = UNITS[id].requires;
      const producer = req ? world.squads.find((s) => !s.dead && s.team === this.team && s.def.id === req && s.building === null) : undefined;
      queueProduction(world, this.team, id, producer);
      return;
    }
  }

  private control(world: World, sq: Squad, own: Squad[]): void {
    if (sq.retreating) return;
    const hq = world.hqOf(this.team);
    const atBase = !!hq && dist(sq.pos, hq.pos) < LOGISTICS.healRadius;

    if (!atBase && this.shouldRetreat(sq)) {
      // Tanks cannot retreat: drive them home for the engineers instead.
      if (sq.def.kind === 'vehicle') {
        if (hq && sq.order.kind !== 'move') issueMove(world, sq, world.map.nearestPassable(hq.pos, 'vehicle'));
      } else {
        issueRetreat(world, sq);
      }
      this.objective.delete(sq.id);
      return;
    }
    const t = world.teams[this.team];
    // Queue every missing soldier the queue and the manpower allow.
    let queued = false;
    while (
      isSoft(sq) &&
      aliveCount(sq) + sq.reinforceQueued < sq.def.models &&
      canReinforceHere(world, sq) &&
      t.resources.manpower > reinforceCost(sq.def) + 60 &&
      world.time - sq.lastHurt > 3 &&
      issueReinforce(world, sq).ok
    ) {
      queued = true;
    }
    if (queued || sq.reinforcing) return;
    this.upgrade(world, sq);
    if (atBase && healthFraction(sq) < 0.8 && sq.order.kind === 'idle' && world.time - sq.lastHurt > 5) return;

    if (sq.def.builds.length > 0 && this.techUp(world, sq)) return;
    if (sq.def.canRepair && this.repair(world, sq, own)) return;
    if (sq.def.builds.length > 0 && this.fortify(world, sq)) return;
    this.useAbilities(world, sq);
    if (sq.order.kind === 'ability') return;
    if (this.holdHouse(world, sq, own)) return;
    if (this.hunt(world, sq)) return;

    if (sq.order.kind === 'idle' && sq.def.kind === 'team' && sq.setup === 'packed' && this.objective.has(sq.id)) {
      const enemyHq = world.hqOf(this.team === 0 ? 1 : 0);
      if (enemyHq) issueSetup(world, sq, enemyHq.pos);
      return;
    }
    if (sq.order.kind !== 'idle' && !this.stale(world, sq)) return;
    if (sq.def.kind === 'team' && sq.setup !== 'packed' && sq.order.kind === 'idle') {
      if (!this.stale(world, sq)) return;
    }
    this.assignObjective(world, sq, own);
  }

  /**
   * Hold a house by a point the army owns: one rifle squad per point goes
   * into the nearest free house and fights from the windows. It stays while
   * the point is ours, and comes out when it is lost.
   */
  private holdHouse(world: World, sq: Squad, own: Squad[]): boolean {
    if (!canGarrison(sq) || sq.def.role !== 'line') return false;
    const near = (p: { x: number; y: number }) => world.points.find((cp) => cp.owner === this.team && dist(cp.pos, p) < 150);
    if (sq.garrison !== null) return !!near(world.houses[sq.garrison].center);
    if (sq.order.kind !== 'idle') return false;
    const point = near(sq.pos);
    if (!point) return false;
    if (own.some((o) => o.garrison !== null && dist(world.houses[o.garrison].center, point.pos) < 150)) return false;
    let best: House | undefined;
    let bestD = 130;
    for (const h of world.houses) {
      if (h.occupant !== null) continue;
      const d = dist(h.center, point.pos);
      if (d < bestD) {
        bestD = d;
        best = h;
      }
    }
    return !!best && issueGarrison(world, sq, best).ok;
  }

  /** Buy a weapon upgrade when supplied and munitions allow: anti-tank once enemy armour has been seen, otherwise more firepower. */
  private upgrade(world: World, sq: Squad): void {
    if (sq.def.upgrades.length === 0 || sq.upgrades.length > 0 || sq.upgrading || !canReinforceHere(world, sq)) return;
    const antiTank = (id: string) => UPGRADES[id].weapons.some((w) => WEAPONS[w].prefers === 'vehicle');
    const wantAt = this.seenVehicles.size > 0;
    const open = sq.def.upgrades.filter((u) => world.hasTech(this.team, UPGRADES[u].requires));
    if (open.length === 0) return;
    const id = open.find((u) => antiTank(u) === wantAt) ?? open[0];
    // Keep some munitions back for grenades and barrages.
    if (world.teams[this.team].resources.munitions < UPGRADES[id].cost.munitions + 25) return;
    issueUpgrade(world, sq, id);
  }

  /** Engineers keep the armour and the HQ running: repair the most damaged one that is not under fire. */
  private repair(world: World, sq: Squad, own: Squad[]): boolean {
    if (sq.order.kind === 'repair') return true;
    const hq = world.hqOf(this.team);
    const candidates = [...own.filter((s) => s.def.kind === 'vehicle'), ...(hq ? [hq] : [])].filter((s) => {
      const hull = s.models.find((m) => m.alive);
      return hull && hull.hp < hull.maxHp * 0.75 && world.time - s.lastHurt > 5 && dist(s.pos, sq.pos) < 900;
    });
    if (candidates.length === 0) return false;
    candidates.sort((a, b) => healthFraction(a) - healthFraction(b));
    return issueRepair(world, sq, candidates[0]).ok;
  }

  /**
   * The next tier building that is due, if any: Tier 1 straight away, Tier 2
   * once the army has grown a little, Tier 3 later on.
   */
  private nextTech(world: World): string | null {
    if (world.techFree) return null;
    const engineer = world.squads.find((s) => !s.dead && s.team === this.team && s.def.builds.length > 0);
    if (!engineer) return null;
    const tiers = engineer.def.builds.filter((b) => BUILDABLES[b].page === 'base');
    const standing = (b: string) => world.squads.some((s) => !s.dead && s.team === this.team && s.def.id === BUILDABLES[b].unit);
    const next = tiers.find((b) => !standing(b));
    if (!next || world.constructions.some((c) => c.team === this.team && c.buildId === next)) return null;
    const pace = [15, 150, 270][tiers.indexOf(next)] ?? 0;
    return world.time >= pace ? next : null;
  }

  /** Engineers raise the next tier building beside headquarters when it is due and affordable. */
  private techUp(world: World, sq: Squad): boolean {
    if (sq.order.kind === 'build') return true;
    const next = this.nextTech(world);
    const hq = world.hqOf(this.team);
    if (!next || !hq || !canAfford(world.teams[this.team].resources, BUILDABLES[next].cost)) return false;
    const enemyBase = world.teams[this.team === 0 ? 1 : 0].base;
    const ahead = Math.atan2(enemyBase.y - hq.pos.y, enemyBase.x - hq.pos.x);
    for (const d of [6, 8, 10]) {
      for (const turn of [1.3, -1.3, 2, -2, 0.7, -0.7]) {
        const spot = { x: hq.pos.x + Math.cos(ahead + turn) * TILE * d, y: hq.pos.y + Math.sin(ahead + turn) * TILE * d };
        if (issueBuild(world, sq, next, spot, spot).ok) return true;
      }
    }
    return false;
  }

  /** Engineers dig in at a quiet point we hold: an MG nest first, a bunker once munitions are short. */
  private fortify(world: World, sq: Squad): boolean {
    if (sq.order.kind === 'build') return true;
    // Idle, or passing one of our quiet points on the way somewhere.
    if (sq.order.kind !== 'idle' && sq.order.kind !== 'attackMove') return false;
    const res = world.teams[this.team].resources;
    const enemyBase = world.teams[this.team === 0 ? 1 : 0].base;
    for (const p of world.points) {
      if (p.owner !== this.team || this.threatened(world, p) || dist(sq.pos, p.pos) > 240) continue;
      if (world.squads.some((s) => !s.dead && s.team === this.team && s.def.role === 'fort' && dist(s.pos, p.pos) < 200)) continue;
      const id = sq.def.builds.find((b) => b === 'mg_nest' && res.munitions >= 60) ?? sq.def.builds.find((b) => b === 'bunker');
      if (!id || !canAfford(res, BUILDABLES[id].cost)) return false;
      // In front of the point, facing the enemy's side of the map.
      const ahead = Math.atan2(enemyBase.y - p.pos.y, enemyBase.x - p.pos.x);
      for (const [d, turn] of [[3, 0], [3, 0.6], [3, -0.6], [2, 1.2], [2, -1.2]]) {
        const spot = { x: p.pos.x + Math.cos(ahead + turn) * TILE * d, y: p.pos.y + Math.sin(ahead + turn) * TILE * d };
        // Built facing the enemy's side of the map.
        const front = { x: spot.x + Math.cos(ahead) * TILE * 2, y: spot.y + Math.sin(ahead) * TILE * 2 };
        if (issueBuild(world, sq, id, spot, front).ok) return true;
      }
    }
    return false;
  }

  private shouldRetreat(sq: Squad): boolean {
    const hp = healthFraction(sq);
    if (sq.def.kind === 'vehicle') return hp < 0.3;
    const frac = aliveCount(sq) / sq.def.models;
    if (sq.def.kind === 'team') return frac < 0.5 || hp < 0.3;
    return frac <= 0.4 || hp < 0.3 || (sq.suppState === 'pinned' && hp < 0.55);
  }

  /** An objective is stale when the point is safely ours and there is nothing to fight. */
  private stale(world: World, sq: Squad): boolean {
    const idx = this.objective.get(sq.id);
    if (idx === undefined || idx < 0) return idx === undefined;
    const p = world.points[idx];
    if (p.owner !== this.team) return false;
    if (sq.def.kind === 'team') return false;
    return !this.threatened(world, p) && dist(sq.pos, p.pos) < 80;
  }

  private threatened(world: World, p: CapturePoint): boolean {
    if (p.contested) return true;
    return this.enemies(world).some((e) => dist(e.pos, p.pos) < 260);
  }

  private assignObjective(world: World, sq: Squad, own: Squad[]): void {
    const enemyTeam: TeamId = this.team === 0 ? 1 : 0;
    const ownedCount = world.points.filter((p) => p.owner === this.team).length;
    const armyPop = own.reduce((s, u) => s + u.def.pop, 0);
    const enemyHq = world.hqOf(enemyTeam);

    if (enemyHq && ownedCount >= world.points.length - 1 && armyPop >= 30 && sq.def.kind !== 'team') {
      this.objective.set(sq.id, -1);
      issueAttackMove(world, sq, enemyHq.pos);
      return;
    }

    let best = -1;
    let bestScore = -Infinity;
    const lowFuel = world.teams[this.team].resources.fuel < 40;
    for (const p of world.points) {
      let score: number;
      if (p.owner === this.team) score = this.threatened(world, p) ? 2.2 : sq.def.kind === 'team' ? 1.2 : 0.2;
      else if (p.owner === -1) score = 2;
      else score = 1.6;
      if (p.kind === 'victory') score += 0.5;
      if (p.kind === 'fuel' && lowFuel) score += 0.3;
      if (sq.def.kind === 'vehicle' && p.owner !== this.team) score += 0.3;
      score -= dist(sq.pos, p.pos) / 700;
      let assigned = 0;
      for (const [id, idx] of this.objective) if (idx === p.index && id !== sq.id) assigned++;
      score -= assigned * 0.6;
      score += (world.rng.next() - 0.5) * 0.2;
      if (score > bestScore) {
        bestScore = score;
        best = p.index;
      }
    }
    if (best < 0) return;
    this.objective.set(sq.id, best);
    let dest: Vec2 = world.points[best].pos;
    // Support weapons hang back behind the point, towards home.
    if (sq.def.kind === 'team') dest = lerpVec(dest, world.teams[this.team].base, sq.def.role === 'mortar' ? 0.25 : 0.1);
    issueAttackMove(world, sq, world.map.nearestPassable(dest, sq.def.vehicle ? 'vehicle' : 'infantry'));
  }

  /**
   * Go after an enemy nest, bunker or aid station in sight: they hold up the
   * advance or keep the enemy alive. Only squads that can really hurt one
   * (tanks, anti-tank teams) are sent; riflemen leave bunkers alone.
   */
  private hunt(world: World, sq: Squad): boolean {
    if (sq.def.kind === 'team') return false;
    if (sq.order.kind === 'attack') {
      const t = world.get(sq.order.targetId);
      if (t && !t.dead && (t.def.role === 'fort' || t.def.role === 'tech')) return true;
    }
    const near = this.enemies(world)
      .filter((e) => (e.def.role === 'fort' || e.def.role === 'tech') && dist(e.pos, sq.pos) < 450)
      .sort((a, b) => dist(a.pos, sq.pos) - dist(b.pos, sq.pos));
    if (near.length === 0) return false;
    // Tanks and anti-tank weapons can break it head on.
    const breakable = near.find((e) => fortPriority(sq, e) < 1);
    if (breakable) return issueAttack(world, sq, breakable).ok;
    // Riflemen do not walk into a machine gun's arc: they work round its flank,
    // close to grenade range, and throw (the grenade goes on emplacements first).
    const gun = near.find((e) => e.models[0]?.weapons.some((w) => w.def.arc < 360));
    if (!gun || !sq.def.abilities.length) return false;
    const arc = Math.max(...gun.models[0].weapons.map((w) => w.def.arc));
    const half = (arc * Math.PI) / 360;
    const from = Math.atan2(sq.pos.y - gun.pos.y, sq.pos.x - gun.pos.x);
    const off = angleDiff(gun.heading, from);
    if (Math.abs(off) > half + 0.25 && dist(sq.pos, gun.pos) < 105) return false;
    const side = off >= 0 ? 1 : -1;
    const flankA = gun.heading + side * (half + 0.6);
    const spot = world.map.nearestPassable({ x: gun.pos.x + Math.cos(flankA) * 95, y: gun.pos.y + Math.sin(flankA) * 95 }, 'infantry');
    if (sq.order.kind === 'move' && sq.order.dest && dist(sq.order.dest, spot) < 30) return true;
    return issueMove(world, sq, spot).ok;
  }

  // ─── Commander: doctrine, call-ins, special units ─────────────

  /** Pick a doctrine early on, then use its call-ins when they would help. */
  private commander(world: World, own: Squad[]): void {
    const t = world.teams[this.team];
    if (!t.doctrine && world.time > 40) {
      const options = doctrinesOf(t.faction.id);
      chooseDoctrine(world, this.team, options[Math.floor(world.rng.next() * options.length)].id);
    }
    if (!t.doctrine) return;
    const enemies = this.enemies(world);
    const engaged = own.filter((s) => s.targetId !== null && isSoft(s)).length;
    const hurting = own.filter((s) => world.time - s.lastHurt < 4).length;
    const shaken = own.filter((s) => s.suppState !== 'normal').length;
    for (const c of DOCTRINES[t.doctrine].callIns) {
      if (callInBlock(world, this.team, c.id)) continue;
      const e = c.effect;
      let target: Vec2 | undefined;
      let go = false;
      switch (e.kind) {
        case 'buff':
          go = e.rally ? shaken >= 2 : e.received ? hurting >= 2 : e.camo ? own.filter((s) => s.order.kind === 'idle').length >= 3 : engaged >= 2;
          break;
        case 'levy':
          go = t.resources.manpower > c.cost.manpower + 150;
          break;
        case 'barrage': {
          // Shell a dug-in emplacement first, else a cluster of enemies.
          const fort = enemies.find((x) => x.def.role === 'fort' || x.def.role === 'tech' || (x.def.kind === 'team' && x.setup === 'deployed'));
          const cluster = enemies.find((x) => enemies.filter((y) => dist(x.pos, y.pos) < 90).length >= 3);
          target = (fort ?? cluster)?.pos;
          go = !!target;
          break;
        }
        case 'recon': {
          const enemyHq = world.hqOf(this.team === 0 ? 1 : 0);
          target = enemyHq ? lerpVec(enemyHq.pos, t.base, 0.3) : undefined;
          go = !!target && world.time > 150;
          break;
        }
        case 'paradrop': {
          const p = world.points.find((pt) => pt.owner !== this.team && world.vision.isVisible(this.team, pt.pos));
          target = p ? lerpVec(p.pos, t.base, 0.15) : undefined;
          go = !!target;
          break;
        }
        case 'mines': {
          const p = world.points.find((pt) => pt.owner === this.team && this.threatened(world, pt));
          target = p ? lerpVec(p.pos, world.teams[this.team === 0 ? 1 : 0].base, 0.12) : undefined;
          go = !!target;
          break;
        }
      }
      if (go) useCallIn(world, this.team, c.id, target);
    }
  }

  /** The doctrine's special unit, if it can be recruited now. */
  private specialUnit(world: World): string | undefined {
    const t = world.teams[this.team];
    if (!t.doctrine) return undefined;
    const id = DOCTRINES[t.doctrine].unit;
    return world.hasTech(this.team, UNITS[id].requires) ? id : undefined;
  }

  private special(world: World, own: Squad[]): number {
    const id = this.specialUnit(world);
    return id ? own.filter((s) => s.def.id === id).length : 99;
  }

  private useAbilities(world: World, sq: Squad): void {
    const res = world.teams[this.team].resources;
    for (const id of sq.def.abilities) {
      const ab = ABILITIES[id];
      if ((sq.cooldowns[id] ?? 0) > 0 || !canAfford(res, ab.cost) || res.munitions < ab.cost.munitions + 10) continue;
      const range = ab.range * (ab.requiresSetup ? 1 : 0.95);
      // Grenades and barrages go on enemy nests, bunkers and aid stations first.
      const fort = this.enemies(world).find((e) => e.def.role === 'fort' && dist(e.pos, sq.pos) <= range);
      const target = fort ?? this.enemies(world).find((e) => {
        if (!isSoft(e) || dist(e.pos, sq.pos) > range) return false;
        if (e.def.kind === 'team' && e.setup === 'deployed') return true;
        if (ab.requiresSetup) return aliveCount(e) >= 3 && e.order.kind === 'idle';
        const cover = coverAt(world.map, e.pos, sq.pos);
        return (cover === 'heavy' || cover === 'light') && aliveCount(e) >= 3;
      });
      if (target && issueAbility(world, sq, id, target.pos).ok) return;
    }
  }
}
