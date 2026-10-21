import { CALL_INS, DOCTRINES } from '../../data/doctrines';
import type { TeamId } from '../../data/types';
import { UNITS } from '../../data/units';
import { WEAPONS } from '../../data/weapons';
import { dist, type Vec2 } from '../../core/vec';
import { isSoft } from '../entities';
import { setOrder } from '../orders';
import type { World } from '../world';
import { explode, scatterPoint } from './combat';
import { canAfford, pay } from './economy';

/** Experience dealt for one command point. */
const CP_XP = 1000;
/** Seconds of battle for one command point, earned anyway. */
const CP_PASSIVE = 150;

/** A doctrine buff on a whole army, for a while. */
export interface Buff {
  until: number;
  speed: number;
  accuracy: number;
  received: number;
  steady: boolean;
  camo: boolean;
}

/** An artillery strike in progress. */
export interface Strike {
  team: TeamId;
  weapon: string;
  pos: Vec2;
  left: number;
  interval: number;
  scatter: number;
  next: number;
}

/** Paratroopers on their way down. */
export interface Drop {
  team: TeamId;
  unit: string;
  pos: Vec2;
  at: number;
}

export type CallInResult = { ok: true } | { ok: false; reason: string };
const fail = (reason: string): CallInResult => ({ ok: false, reason });

/** Combat experience also earns the army command points. */
export function earnCp(world: World, team: TeamId, xp: number): void {
  world.teams[team].cp += xp / CP_XP;
}

/** Product of a multiplier over the army's active buffs. */
export function teamMult(world: World, team: TeamId, key: 'speed' | 'accuracy' | 'received'): number {
  let m = 1;
  for (const b of world.teams[team].buffs) if (b.until > world.time) m *= b[key];
  return m;
}

export function teamFlag(world: World, team: TeamId, key: 'steady' | 'camo'): boolean {
  return world.teams[team].buffs.some((b) => b.until > world.time && b[key]);
}

/** Pick the army's doctrine: once per battle. */
export function chooseDoctrine(world: World, team: TeamId, id: string): CallInResult {
  const t = world.teams[team];
  const d = DOCTRINES[id];
  if (!d || d.faction !== t.faction.id) return fail('Not a doctrine of this army');
  if (t.doctrine) return fail('A doctrine has already been chosen');
  t.doctrine = id;
  world.emit({ type: 'notify', team, text: `Doctrine: ${d.name}`, tone: 'good' });
  return { ok: true };
}

/** Why a call-in cannot be used right now, or null if it can. */
export function callInBlock(world: World, team: TeamId, id: string): string | null {
  const t = world.teams[team];
  const c = CALL_INS[id];
  if (!c || !t.doctrine || !DOCTRINES[t.doctrine].callIns.includes(c)) return 'Not part of your doctrine';
  if (t.cp < c.cp) return `Needs ${c.cp} command points`;
  const ready = t.callInReady[id] ?? 0;
  if (ready > world.time) return `Ready in ${Math.ceil(ready - world.time)}s`;
  if (!canAfford(t.resources, c.cost)) return c.cost.munitions > t.resources.munitions ? 'Not enough munitions' : 'Not enough manpower';
  return null;
}

/** Use a commander call-in, aimed at `target` if it needs one. */
export function useCallIn(world: World, team: TeamId, id: string, target?: Vec2): CallInResult {
  const block = callInBlock(world, team, id);
  if (block) return fail(block);
  const c = CALL_INS[id];
  const t = world.teams[team];
  if (c.targeted && !target) return fail('Choose a target');
  const at = target ? { x: target.x, y: target.y } : t.base;
  const e = c.effect;
  if (e.kind === 'paradrop' && !world.vision.isVisible(team, at)) return fail('Paratroopers can only drop where your army can see');
  pay(t.resources, c.cost);
  t.callInReady[id] = world.time + c.cooldown;
  switch (e.kind) {
    case 'buff':
      t.buffs.push({ until: world.time + e.duration, speed: e.speed ?? 1, accuracy: e.accuracy ?? 1, received: e.received ?? 1, steady: !!e.steady, camo: !!e.camo });
      if (e.rally) {
        for (const sq of world.squads) {
          if (sq.dead || sq.team !== team || !isSoft(sq)) continue;
          sq.suppression = 0;
          for (const m of sq.models) if (m.alive) m.hp = Math.min(m.maxHp, m.hp + m.maxHp * 0.25);
        }
      }
      break;
    case 'barrage':
      world.strikes.push({ team, weapon: e.weapon, pos: at, left: e.shots, interval: e.interval, scatter: e.scatter, next: world.time + e.delay });
      break;
    case 'recon':
      t.reveals.push({ pos: at, radius: e.radius, until: world.time + e.duration });
      world.vision.recompute(world);
      break;
    case 'paradrop':
      world.drops.push({ team, unit: e.unit, pos: at, at: world.time + 3 });
      break;
    case 'levy': {
      const hq = world.hqOf(team);
      const spawn = world.map.nearestPassable(t.spawn, 'infantry');
      const sq = world.spawn(team, e.unit, spawn);
      if (hq?.rally) setOrder(sq, { kind: 'move', dest: { ...hq.rally } });
      break;
    }
    case 'mines':
      for (let i = 0; i < e.count; i++) {
        const a = (i / e.count) * Math.PI * 2 + world.rng.next();
        const r = e.radius * (0.4 + 0.6 * world.rng.next());
        const p = world.map.nearestPassable({ x: at.x + Math.cos(a) * r, y: at.y + Math.sin(a) * r }, 'infantry');
        world.mines.push({ id: world.nextId(), team, pos: p });
      }
      break;
  }
  world.emit({ type: 'notify', team, text: c.name, tone: 'good', pos: target ? { ...at } : undefined });
  return { ok: true };
}

export function updateDoctrines(world: World, dt: number): void {
  for (const t of world.teams) {
    t.cp += dt / CP_PASSIVE;
    t.buffs = t.buffs.filter((b) => b.until > world.time);
    t.reveals = t.reveals.filter((r) => r.until > world.time);
  }
  // Artillery shells land one after another.
  world.strikes = world.strikes.filter((s) => {
    while (s.left > 0 && world.time >= s.next) {
      explode(world, scatterPoint(world, s.pos, s.scatter), WEAPONS[s.weapon], null);
      s.left--;
      s.next += s.interval;
    }
    return s.left > 0;
  });
  // Paratroopers land.
  world.drops = world.drops.filter((d) => {
    if (world.time < d.at) return true;
    world.spawn(d.team, d.unit, world.map.nearestPassable(d.pos, 'infantry'));
    world.emit({ type: 'notify', team: d.team, text: `${UNITS[d.unit].name} landed`, tone: 'good', pos: { ...d.pos } });
    return false;
  });
}

/**
 * Camouflaged infantry (guerrillas, or anyone under an ambush call-in) cannot be
 * seen while holding still and holding fire, unless an enemy is right on top of them.
 */
export function isHidden(world: World, viewer: TeamId, sq: { team: TeamId; def: { camo?: boolean; kind: string }; moving: boolean; lastFired: number; pos: Vec2 }): boolean {
  if (sq.team === viewer || (sq.def.kind !== 'infantry' && sq.def.kind !== 'team')) return false;
  if (!sq.def.camo && !teamFlag(world, sq.team, 'camo')) return false;
  if (sq.moving || world.time - sq.lastFired < 3) return false;
  return !world.squads.some((s) => !s.dead && s.team === viewer && s.def.kind !== 'structure' && dist(s.pos, sq.pos) < 64);
}
