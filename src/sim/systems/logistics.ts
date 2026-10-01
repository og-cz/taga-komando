import { LOGISTICS } from '../../data/balance';
import type { UnitDef } from '../../data/types';
import { add, dist, rotate, type Vec2 } from '../../core/vec';
import { aliveCount, createModel, formationOffset, type Squad } from '../entities';
import type { World } from '../world';

export const reinforceCost = (def: UnitDef): number =>
  Math.round((def.cost.manpower / def.models) * LOGISTICS.reinforceCostMult);

/**
 * The base a squad can reinforce from: headquarters, a tier building or a
 * bunker close by (in an assault, also the forward rally point). Returns where
 * the new soldiers come out, or null when the squad is too far from any base.
 */
export function reinforceSource(world: World, sq: Squad): Vec2 | null {
  if (sq.def.kind === 'vehicle' || sq.def.kind === 'structure') return null;
  let best: Vec2 | null = null;
  let bestD = Infinity;
  const consider = (p: Vec2, reach: number) => {
    const d = dist(sq.pos, p);
    if (d <= reach && d < bestD) {
      best = p;
      bestD = d;
    }
  };
  const hq = world.hqOf(sq.team);
  if (hq && !hq.dead) consider(hq.pos, LOGISTICS.reinforceHqRadius);
  for (const s of world.squads) {
    if (!s.dead && s.team === sq.team && s.def.supplies && s.building === null) consider(s.pos, LOGISTICS.reinforceBaseRadius);
  }
  // Assaults: the reinforcement point moves forward with the front.
  if (world.objective.mode === 'offensive') consider(world.teams[sq.team].spawn, LOGISTICS.reinforcePointRadius);
  return best;
}

/** True when the squad is close enough to a base to reinforce or pick up an upgrade. */
export function canReinforceHere(world: World, sq: Squad): boolean {
  return reinforceSource(world, sq) !== null;
}

/** Which loadout slot a new recruit should fill (e.g. replace the lost bazooka first). */
function missingLoadout(sq: Squad): number {
  const have = sq.loadout.map(() => 0);
  for (const m of sq.models) if (m.alive) have[m.loadoutIndex]++;
  const i = sq.loadout.findIndex((e, idx) => have[idx] < e.count);
  return i < 0 ? sq.loadout.length - 1 : i;
}

/** A new soldier comes out of the base (`from`, or right beside the squad) and walks to his place. */
export function addRecruit(world: World, sq: Squad, from?: Vec2): void {
  const n = aliveCount(sq);
  const pos = from ?? add(sq.pos, rotate(formationOffset(n, n + 1), sq.heading));
  const m = createModel(world.nextId(), sq.loadout, missingLoadout(sq), sq.def.modelHp, world.map.nearestPassable(pos, 'infantry'));
  m.facing = sq.heading;
  sq.models.push(m);
}

/** Call off every soldier still waiting to join and give the manpower back. */
export function dropReinforcements(world: World, sq: Squad): void {
  if (sq.reinforceQueued > 0) world.teams[sq.team].resources.manpower += reinforceCost(sq.def) * sq.reinforceQueued;
  sq.reinforceQueued = 0;
  sq.reinforcing = false;
}

export function updateLogistics(world: World, dt: number): void {
  for (const sq of world.squads) {
    if (sq.dead || sq.def.kind === 'structure') continue;
    const hq = world.hqOf(sq.team);

    const calm = world.time - sq.lastHurt > LOGISTICS.combatCooldown;
    if (calm && hq && !hq.dead && dist(sq.pos, hq.pos) <= LOGISTICS.healRadius) {
      // Soldiers heal at headquarters; tanks are only repaired by engineers.
      const rate = sq.def.kind === 'vehicle' ? 0 : LOGISTICS.healRate;
      for (const m of sq.models) if (m.alive) m.hp = Math.min(m.maxHp, m.hp + rate * dt);
    } else if (calm && sq.def.kind !== 'vehicle') {
      // Aid tents patch up soldiers nearby.
      const tent = world.squads.find((s) => !s.dead && s.team === sq.team && s.def.healRate > 0 && s.building === null && dist(sq.pos, s.pos) <= s.def.healRadius);
      if (tent) for (const m of sq.models) if (m.alive) m.hp = Math.min(m.maxHp, m.hp + tent.def.healRate * dt);
    }

    if (!sq.reinforcing) continue;
    // Full up: anyone still waiting is called off and refunded.
    if (aliveCount(sq) >= sq.def.models) {
      dropReinforcements(world, sq);
      sq.reinforcePaused = false;
      continue;
    }
    // Too far from a base (or running back to one): the soldiers wait, nothing is lost.
    if (sq.retreating || !canReinforceHere(world, sq)) {
      if (!sq.reinforcePaused && !sq.retreating) {
        world.emit({ type: 'notify', team: sq.team, text: `${sq.def.name}: reinforcements paused until the squad is back near a base`, tone: 'info' });
      }
      sq.reinforcePaused = true;
      continue;
    }
    sq.reinforcePaused = false;
    sq.reinforceTimer -= dt;
    if (sq.reinforceTimer > 0) continue;
    addRecruit(world, sq, reinforceSource(world, sq) ?? undefined);
    sq.reinforceQueued--;
    sq.reinforcing = sq.reinforceQueued > 0;
    sq.reinforceTimer = LOGISTICS.reinforceTime;
  }
}
