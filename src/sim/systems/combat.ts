import { COVER, RETREAT, TILE, VETERANCY } from '../../data/balance';
import { T } from '../../data/terrain';
import type { WeaponDef } from '../../data/types';
import { angleDiff, angleTo, clamp, dist, lerp, rotateTowards, type Vec2 } from '../../core/vec';
import {
  aliveCount,
  createWeaponStates,
  isSoft,
  maxRange,
  preference,
  type Model,
  type Squad,
  type WeaponState,
} from '../entities';
import { hasLineOfSight } from '../los';
import { canHit, damageHouses } from './garrison';
import { addSmoke } from './smoke';
import type { World } from '../world';
import { earnCp, teamMult } from './doctrine';
import { coverAt } from './cover';
import { startSetup } from './setup';
import { damageDefenses } from './defenses';
import { applySuppression, suppressionAccuracy } from './suppression';

export function updateCombat(world: World, dt: number): void {
  for (const sq of world.squads) {
    if (sq.dead) continue;
    tickWeapons(sq, dt);
    // Retreating squads run without looking back; engineers busy repairing or building
    // and structures still going up do not fight.
    if (sq.retreating || sq.order.kind === 'repair' || sq.order.kind === 'build' || sq.building !== null) {
      sq.targetId = null;
      if (sq.def.vehicle) aimTurret(sq, null, dt);
      continue;
    }
    const target = acquireTarget(world, sq, dt);
    if (sq.def.vehicle) aimTurret(sq, target, dt);
    if (!target) continue;
    autoSetup(sq, target);
    for (const m of sq.models) {
      if (!m.alive) continue;
      for (const ws of m.weapons) tryFire(world, sq, m, ws, target);
      if (target.dead) break;
    }
  }
}

function tickWeapons(sq: Squad, dt: number): void {
  for (const m of sq.models) {
    for (const w of m.weapons) {
      if (w.cooldown > 0) w.cooldown -= dt;
      if (w.reloading > 0) w.reloading -= dt;
    }
  }
}

function validTarget(world: World, sq: Squad, t: Squad | undefined): t is Squad {
  return !!t && !t.dead && t.team !== sq.team && world.canSee(sq.team, t);
}

/** Whether this squad's main weapon fires over obstacles (mortars). */
function firesIndirect(sq: Squad): boolean {
  return sq.models.some((m) => m.alive && m.weapons.some((w) => w.def.indirect));
}

/** Can the squad actually put fire on `e` from where it stands? Not through a house. */
function canEngage(world: World, sq: Squad, e: Squad, indirect: boolean): boolean {
  if (indirect) return true;
  return canHit(world, sq, e);
}

/** Half the firing cone of a deployed crew weapon, or null if it can fire all round. */
function crewHalfArc(sq: Squad): number | null {
  if (sq.def.kind !== 'team' || sq.setup !== 'deployed') return null;
  for (const m of sq.models) {
    if (!m.alive) continue;
    for (const ws of m.weapons) if (ws.def.crew && ws.def.arc < 360) return (ws.def.arc * Math.PI) / 360;
  }
  return null;
}

function acquireTarget(world: World, sq: Squad, dt: number): Squad | null {
  if (sq.order.kind === 'attack') {
    const t = world.get(sq.order.targetId);
    if (validTarget(world, sq, t)) {
      sq.targetId = t.id;
      return t;
    }
  }
  const range = maxRange(sq) + 16;
  const indirect = firesIndirect(sq);
  let cur = world.get(sq.targetId);
  if (cur && (!validTarget(world, sq, cur) || dist(sq.pos, cur.pos) - cur.def.radius > range)) {
    cur = undefined;
    sq.targetId = null;
  }
  sq.scanTimer -= dt;
  if (sq.scanTimer > 0) return cur ?? null;
  sq.scanTimer = 0.35 + world.rng.next() * 0.2;
  // A target that has gone behind a house is let go, so the crew finds another.
  if (cur && !canEngage(world, sq, cur, indirect)) {
    cur = undefined;
    sq.targetId = null;
  }

  // Score every enemy the squad can really engage: lower is better.
  // Distance, then what the weapon is for, how dangerous the enemy is to us,
  // whether a deployed gun has to traverse to it, and a bonus for staying on target.
  const prefers = preference(sq.def);
  const halfArc = crewHalfArc(sq);
  let best: Squad | null = null;
  let bestScore = Infinity;
  for (const e of world.squads) {
    if (e.dead || e.team === sq.team) continue;
    const d = dist(sq.pos, e.pos) - e.def.radius;
    if (d > range || !world.canSee(sq.team, e)) continue;
    if (sq.def.kind === 'structure' && !structureCovers(sq, e.pos)) continue;
    if (!canEngage(world, sq, e, indirect)) continue;
    const armored = e.def.armor !== null;
    let score = Math.max(d, 1);
    if (prefers === 'vehicle') score *= armored ? 0.4 : 1.6;
    else if (prefers === 'infantry' && armored) score *= 1.6;
    // Nests, bunkers and aid stations are worth killing: squads that can hurt
    // one go for it first; those that cannot leave it alone. The HQ is a last resort.
    if (e.def.role === 'fort') score *= fortPriority(sq, e);
    else if (e.def.kind === 'structure') score *= 2.5;
    // Threat: whoever is shooting at us comes first.
    if (e.targetId === sq.id) score *= 0.7;
    // A deployed gun keeps the facing it was set up with: only what is in its cone counts.
    if (halfArc !== null && Math.abs(angleDiff(sq.setupFacing, angleTo(sq.pos, e.pos))) > halfArc) continue;
    // Stay on target unless something is clearly better.
    if (e === cur) score *= 0.75;
    if (score < bestScore) {
      bestScore = score;
      best = e;
    }
  }
  sq.targetId = best?.id ?? null;
  return best;
}

/** How eager a squad is to shoot at an emplacement: low (eager) when its weapons can really hurt it. */
/** True if `p` lies inside the weapon's arc around the structure's facing. */
export function inArc(sq: Squad, w: WeaponDef, p: Vec2): boolean {
  if (w.arc >= 360) return true;
  return Math.abs(angleDiff(sq.heading, angleTo(sq.pos, p))) <= (w.arc * Math.PI) / 360;
}

/** A structure can only engage what is in front of at least one of its guns. */
function structureCovers(sq: Squad, p: Vec2): boolean {
  const weapons = sq.models.flatMap((m) => (m.alive ? m.weapons : []));
  return weapons.length === 0 || weapons.some((ws) => inArc(sq, ws.def, p));
}

export function fortPriority(sq: Squad, fort: Squad): number {
  const armor = fort.def.armor?.front ?? 0;
  let best = 0;
  for (const m of sq.models) {
    if (!m.alive) continue;
    for (const ws of m.weapons) {
      const w = ws.def;
      const pen = Math.max(w.penetration[0], w.penetration[1]);
      const hurt = damageVs(w, fort) * penetrationChance(pen, armor) * (w.aoe > 0 ? 1.5 : 1);
      best = Math.max(best, hurt);
    }
  }
  if (best >= 1) return 0.45;
  if (best >= 0.15) return 1;
  return 4;
}

function aimTurret(sq: Squad, target: Squad | null, dt: number): void {
  const want = target ? angleTo(sq.pos, target.pos) : sq.heading;
  sq.turret = rotateTowards(sq.turret, want, sq.def.vehicle!.turretRate * dt);
}

/** Idle crew weapons deploy on their own when an enemy walks into range. */
function autoSetup(sq: Squad, target: Squad): void {
  if (sq.def.kind !== 'team' || sq.setup !== 'packed' || sq.moving) return;
  const k = sq.order.kind;
  if (k !== 'idle' && k !== 'attack' && k !== 'attackMove') return;
  if (dist(sq.pos, target.pos) > maxRange(sq) + target.def.radius) return;
  startSetup(sq, angleTo(sq.pos, target.pos));
}

function pickTargetModel(world: World, target: Squad): Model | null {
  const n = aliveCount(target);
  if (n === 0) return null;
  let k = Math.floor(world.rng.next() * n);
  for (const m of target.models) {
    if (!m.alive) continue;
    if (k-- === 0) return m;
  }
  return null;
}

function tryFire(world: World, sq: Squad, m: Model, ws: WeaponState, target: Squad): void {
  const w = ws.def;
  if (ws.cooldown > 0 || ws.reloading > 0 || sq.channel) return;
  if (w.crew && sq.setup !== 'deployed') return;
  if (sq.moving && w.moveAccuracy <= 0) return;
  const tm = pickTargetModel(world, target);
  if (!tm) return;
  const d = dist(m.pos, tm.pos);
  if (d > w.range + target.def.radius || d < w.minRange) return;
  const ang = angleTo(m.pos, tm.pos);
  if (w.turret && Math.abs(angleDiff(sq.turret, ang)) > 0.08) return;
  if (w.crew && w.arc < 360) {
    // Set up, the gun never turns: it fires on whatever enters its cone, nothing else.
    if (Math.abs(angleDiff(sq.setupFacing, ang)) > (w.arc * Math.PI) / 360) return;
  } else if (sq.def.kind === 'structure' && w.arc < 360 && !inArc(sq, w, tm.pos)) {
    // Emplaced guns cannot turn: they only cover the way they were built facing.
    return;
  }
  if (w.indirect) {
    if (!world.vision.isVisible(sq.team, tm.pos)) return;
  } else if (!hasLineOfSight(world.map, m.pos, tm.pos, target.def.radius, sq.def.radius)) {
    return;
  }

  ws.cooldown = w.cooldown * (0.85 + world.rng.next() * 0.3);
  if (w.clip > 0 && --ws.clip <= 0) {
    ws.reloading = w.reload;
    ws.clip = w.clip;
  }
  if (!w.turret && sq.def.kind !== 'structure') m.facing = ang;
  sq.lastFired = world.time;

  if (w.indirect) {
    const scatter = w.scatter * (0.35 + 0.65 * (d / w.range)) * (1 - 0.1 * sq.vet);
    launch(world, sq, m.pos, scatterPoint(world, tm.pos, scatter), w, 1 + d / 300, true);
    return;
  }

  const hit = world.rng.chance(hitChance(world, sq, w, d, target, tm, m.pos));
  if (w.aoe > 0) {
    const impact = hit ? { ...tm.pos } : scatterPoint(world, tm.pos, 20 + d * 0.15);
    launch(world, sq, m.pos, impact, w, d / 700 + 0.05, false);
    return;
  }

  world.emit({
    type: 'shot',
    from: { ...m.pos },
    to: hit ? { ...tm.pos } : scatterPoint(world, tm.pos, 14),
    projectile: w.projectile,
    hit,
    team: sq.team,
    weapon: w.id,
  });
  if (isSoft(target)) {
    applySuppression(world, target, w.suppression * COVER[coverAt(world.map, tm.pos, m.pos)].suppression);
  }
  if (!hit) return;
  const damage = w.damage * damageVs(w, target);
  if (target.def.armor) resolveArmorHit(world, sq, w, d, target, tm, m.pos, damage);
  else applyDamage(world, target, tm, damage, sq);
}

export function hitChance(world: World, sq: Squad, w: WeaponDef, d: number, target: Squad, tm: Model, from: Vec2): number {
  let acc = lerp(w.accuracy[0], w.accuracy[1], clamp(d / w.range, 0, 1));
  if (sq.moving) acc *= w.moveAccuracy;
  acc *= suppressionAccuracy(sq);
  acc *= VETERANCY.accuracy[sq.vet] ?? 1;
  acc *= target.def.receivedAccuracy * (VETERANCY.receivedAccuracy[target.vet] ?? 1);
  acc *= teamMult(world, sq.team, 'accuracy') * teamMult(world, target.team, 'received');
  if (target.retreating) acc *= RETREAT.receivedAccuracy;
  if (isSoft(target)) acc *= w.infantryAccuracy * COVER[coverAt(world.map, tm.pos, from)].accuracy;
  return clamp(acc, 0.02, 0.97);
}

/** How hard a weapon hits this kind of target (see WeaponDef.vs). */
export function damageVs(w: WeaponDef, target: Squad): number {
  // Engineer structures have their own column; otherwise they count as structures.
  if (target.def.role === 'fort') return w.vs.fort ?? w.vs.structure ?? 1;
  return w.vs[target.def.kind] ?? 1;
}

/** Penetration: guaranteed if pen >= armour, otherwise pen/armour. */
export function penetrationChance(pen: number, armor: number): number {
  return armor <= 0 ? 1 : Math.min(1, pen / armor);
}

/** A hit is on the rear plate when it comes from more than 110° off the hull's nose. */
export function isRearHit(target: Squad, from: Vec2): boolean {
  if (!target.def.vehicle) return false;
  return Math.abs(angleDiff(target.heading, angleTo(target.pos, from))) > (110 * Math.PI) / 180;
}

function resolveArmorHit(world: World, source: Squad | null, w: WeaponDef, d: number, target: Squad, tm: Model, from: Vec2, damage: number): void {
  const armor = target.def.armor!;
  const rear = isRearHit(target, from);
  const pen = lerp(w.penetration[0], w.penetration[1], clamp(d / Math.max(w.range, 1), 0, 1));
  const penetrated = world.rng.chance(penetrationChance(pen, rear ? armor.rear : armor.front));
  const notable = w.damage >= 40;
  if (!penetrated) {
    if (notable) world.emit({ type: 'float', pos: { ...tm.pos }, text: 'Deflected', tone: 'info' });
    return;
  }
  if (notable) world.emit({ type: 'float', pos: { ...tm.pos }, text: rear ? 'Rear penetration!' : 'Penetrated', tone: 'bad' });
  applyDamage(world, target, tm, damage, source);
}

export function scatterPoint(world: World, p: Vec2, radius: number): Vec2 {
  const a = world.rng.next() * Math.PI * 2;
  const r = Math.sqrt(world.rng.next()) * radius;
  const q = { x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r };
  q.x = clamp(q.x, 1, world.map.pixelWidth - 1);
  q.y = clamp(q.y, 1, world.map.pixelHeight - 1);
  return q;
}

export function launch(world: World, source: Squad, from: Vec2, to: Vec2, w: WeaponDef, flight: number, arc: boolean): void {
  world.projectiles.push({
    id: world.nextId(),
    team: source.team,
    sourceId: source.id,
    weapon: w,
    from: { ...from },
    to,
    t: 0,
    flight,
    arc,
  });
  world.emit({ type: 'launch', from: { ...from }, team: source.team, weapon: w.id });
}

export function updateProjectiles(world: World, dt: number): void {
  if (world.projectiles.length === 0) return;
  const landed = [];
  for (const p of world.projectiles) {
    p.t += dt;
    if (p.t >= p.flight) landed.push(p);
  }
  if (landed.length === 0) return;
  world.projectiles = world.projectiles.filter((p) => p.t < p.flight);
  for (const p of landed) explode(world, p.to, p.weapon, world.get(p.sourceId) ?? null);
}

/** Area damage with falloff. Explosives ignore allegiance: friendly fire is real. */
export function explode(world: World, pos: Vec2, w: WeaponDef, source: Squad | null): void {
  // Smoke rounds burst into a cloud and hurt nobody.
  if (w.smoke) {
    addSmoke(world, pos, w.aoe, w.smoke);
    return;
  }
  world.emit({ type: 'explosion', pos: { ...pos }, radius: w.aoe, weapon: w.id });
  for (const sq of world.squads) {
    if (sq.dead) continue;
    let touched = false;
    for (const m of sq.models) {
      if (!m.alive) continue;
      const d = dist(m.pos, pos);
      if (d > w.aoe + sq.def.radius) continue;
      touched = true;
      const falloff = 1 - 0.65 * clamp(d / Math.max(w.aoe, 1), 0, 1);
      if (sq.def.armor) {
        resolveArmorHit(world, source, w, 0, sq, m, pos, w.damage * falloff * damageVs(w, sq));
      } else {
        const c = coverAt(world.map, m.pos, pos);
        applyDamage(world, sq, m, w.damage * falloff * COVER[c].explosive * damageVs(w, sq), source);
      }
    }
    if (isSoft(sq) && (touched || dist(sq.pos, pos) < w.aoe * 2)) {
      applySuppression(world, sq, w.suppression * COVER[coverAt(world.map, sq.pos, pos)].suppression);
    }
  }
  // Defenses have hit points; they only break when those run out.
  damageDefenses(world, pos, w);
  damageHouses(world, pos, w);
  if (w.craterChance > 0 && world.rng.chance(w.craterChance)) {
    const tx = Math.floor(pos.x / TILE);
    const ty = Math.floor(pos.y / TILE);
    const t = world.map.get(tx, ty);
    if (t === T.Open || t === T.Road || t === T.Paddy || t === T.Hedge) world.map.set(tx, ty, T.Crater);
  }
}

export function applyDamage(world: World, target: Squad, m: Model, dmg: number, source: Squad | null): void {
  if (!m.alive || target.dead || dmg <= 0) return;
  // Retreating troops are running for cover: hits do less.
  if (target.retreating) dmg *= RETREAT.damage;
  const dealt = Math.min(m.hp, dmg);
  m.hp -= dmg;
  target.lastHurt = world.time;
  if (source && source.team !== target.team) addXp(world, source, dealt);
  if (m.hp > 0) return;
  m.alive = false;
  m.hp = 0;
  world.emit({ type: 'death', pos: { ...m.pos }, team: target.team, vehicle: target.def.kind === 'vehicle', heading: target.heading });
  handOverCrewWeapon(target, m);
  if (aliveCount(target) > 0) return;

  target.dead = true;
  world.teams[target.team].stats.lost++;
  if (source && source.team !== target.team) {
    source.kills++;
    world.teams[source.team].stats.killed++;
    addXp(world, source, VETERANCY.killBonus);
  }
  world.emit({ type: 'notify', team: target.team, text: `${target.def.name} lost`, tone: 'bad', pos: { ...target.pos } });
  world.emit({ type: 'notify', team: target.team === 0 ? 1 : 0, text: `Enemy ${target.def.name} destroyed`, tone: 'good', pos: { ...target.pos } });
}

/** When a crew weapon's operator falls, another squad member picks it up. */
function handOverCrewWeapon(sq: Squad, fallen: Model): void {
  if (!fallen.weapons.some((w) => w.def.crew)) return;
  let heir: Model | null = null;
  for (const m of sq.models) {
    if (m.alive && m.loadoutIndex !== fallen.loadoutIndex && (!heir || m.loadoutIndex > heir.loadoutIndex)) heir = m;
  }
  if (!heir) return;
  heir.loadoutIndex = fallen.loadoutIndex;
  heir.weapons = createWeaponStates(sq.loadout[fallen.loadoutIndex].weapons);
  heir.pos = { ...fallen.pos };
}

export function addXp(world: World, sq: Squad, amount: number): void {
  sq.xp += amount;
  earnCp(world, sq.team, amount);
  let vet = 0;
  for (const t of sq.def.vetXp) if (sq.xp >= t) vet++;
  if (vet > sq.vet) {
    sq.vet = vet;
    world.emit({ type: 'float', pos: { ...sq.pos }, text: `Veterancy ${'★'.repeat(vet)}`, tone: 'good' });
  }
}
