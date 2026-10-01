import { teamMult } from './doctrine';
import { RETREAT, TILE } from '../../data/balance';
import { ABILITIES } from '../../data/abilities';
import {
  add,
  angleDiff,
  angleTo,
  approach,
  dist,
  fromAngle,
  moveTowards,
  rotate,
  rotateTowards,
  scale,
  wrapAngle,
  type Vec2,
} from '../../core/vec';
import { aliveCount, crewOffset, formationOffset, maxRange, type Squad } from '../entities';
import { hasLineOfSight } from '../los';
import { finishOrder } from '../orders';
import { findPath, pathLength } from '../pathfinding';
import type { World } from '../world';
import { findCoverSpots } from './cover';
import { constructionOf, currentTile, WORK_RANGE, workSpot } from './engineering';
import { startSetup, startTeardown, updateSetupTimer } from './setup';
import { suppressionSpeed } from './suppression';

export function updateMovement(world: World, dt: number): void {
  for (const sq of world.squads) {
    if (sq.dead || sq.def.kind === 'structure') continue;
    updateSetupTimer(sq, dt);
    sq.repathTimer -= dt;
    const goal = movementGoal(world, sq);
    if (sq.def.vehicle) driveVehicle(world, sq, goal, dt);
    else moveInfantry(world, sq, goal, dt);
  }
}

/** Where the current order wants the squad to go this tick, or null to hold. */
function movementGoal(world: World, sq: Squad): Vec2 | null {
  const o = sq.order;
  switch (o.kind) {
    case 'move':
    case 'retreat':
      return o.dest ?? null;
    case 'attackMove': {
      // Stop to fight while something is in range; resume afterwards.
      const t = world.get(sq.targetId);
      if (t && !t.dead && dist(sq.pos, t.pos) - t.def.radius <= maxRange(sq) * 0.95) return null;
      return o.dest ?? null;
    }
    case 'attack': {
      const t = world.get(o.targetId);
      if (!t || t.dead || !world.canSee(sq.team, t)) {
        finishOrder(sq);
        return null;
      }
      const range = maxRange(sq);
      const indirect = sq.models.some((m) => m.alive && m.weapons.some((w) => w.def.indirect));
      const inRange = dist(sq.pos, t.pos) - t.def.radius <= range * 0.9;
      if (inRange && (indirect || hasLineOfSight(world.map, sq.pos, t.pos, t.def.radius, sq.def.radius))) return null;
      return t.pos;
    }
    case 'build': {
      const c = constructionOf(world, sq);
      const tile = c && currentTile(c);
      if (!c || !tile) return null;
      // Hold once within working distance of the tile; otherwise walk to a spot beside it.
      if (dist(sq.pos, world.map.tileCenter(tile.tx, tile.ty)) <= WORK_RANGE - 4) return null;
      return workSpot(world, sq, c);
    }
    case 'repair': {
      if (o.targetId === undefined && o.dest) {
        // A defense tile: work from beside it.
        return dist(sq.pos, o.dest) <= WORK_RANGE - 4 ? null : world.map.nearestPassable(o.dest, 'infantry');
      }
      const t = world.get(o.targetId);
      if (!t || t.dead) {
        finishOrder(sq);
        return null;
      }
      return dist(sq.pos, t.pos) <= t.def.radius + 30 ? null : t.pos;
    }
    case 'ability': {
      const ab = ABILITIES[o.abilityId ?? ''];
      if (!ab || !o.dest) return null;
      return dist(sq.pos, o.dest) <= ab.range * 0.95 ? null : o.dest;
    }
    default:
      return null;
  }
}

function ensurePath(world: World, sq: Squad, goal: Vec2): void {
  const stale = !sq.pathGoal || (dist(sq.pathGoal, goal) > 24 && sq.repathTimer <= 0);
  if (!stale) return;
  const mover = sq.def.vehicle ? 'vehicle' : 'infantry';
  sq.path = findPath(world.map, sq.pos, goal, mover);
  sq.pathGoal = { x: goal.x, y: goal.y };
  sq.repathTimer = 1;
  for (const m of sq.models) m.coverSlot = null;
  if (sq.def.vehicle) {
    // Back up for short moves behind the tank: keeps the front armour facing the enemy.
    const behind = Math.abs(angleDiff(sq.heading, angleTo(sq.pos, goal))) > 2.1;
    sq.reversing = behind && pathLength(sq.pos, sq.path) < 200;
  }
}

function onArrive(world: World, sq: Squad): void {
  sq.path = [];
  const k = sq.order.kind;
  if (k === 'retreat') {
    sq.retreating = false;
    finishOrder(sq);
  } else if (k === 'move' || k === 'attackMove') {
    const facing = sq.order.facing;
    finishOrder(sq);
    if (sq.order.kind !== 'idle') return;
    if (facing !== undefined && !sq.def.vehicle) sq.heading = facing;
    if (facing !== undefined && sq.def.kind === 'team') startSetup(sq, facing);
    if (sq.def.kind === 'infantry') assignCover(world, sq);
  } else if (k === 'attack' || k === 'ability' || k === 'build' || k === 'repair') {
    // Path ended without getting in range: the target is unreachable.
    const goal = movementGoal(world, sq);
    if (goal && dist(sq.pos, goal) > TILE * 2) finishOrder(sq);
    else sq.pathGoal = null;
  }
}

function assignCover(world: World, sq: Squad): void {
  const alive = sq.models.filter((m) => m.alive);
  const slots = alive.map((_, i) => add(sq.pos, rotate(formationOffset(i, alive.length), sq.heading)));
  const spots = findCoverSpots(world.map, sq.pos, sq.heading, slots);
  alive.forEach((m, i) => {
    m.coverSlot = spots[i]?.pos ?? null;
  });
}

function moveInfantry(world: World, sq: Squad, goal: Vec2 | null, dt: number): void {
  sq.moving = false;
  if (goal) {
    if (sq.def.kind === 'team' && sq.setup !== 'packed') {
      startTeardown(sq);
    } else if (sq.suppState !== 'pinned' || sq.retreating) {
      ensurePath(world, sq, goal);
      if (sq.path.length === 0) onArrive(world, sq);
      else advanceAlongPath(world, sq, dt);
    }
  }
  updateInfantryModels(world, sq, dt);
}

function advanceAlongPath(world: World, sq: Squad, dt: number): void {
  const speed =
    sq.def.speed * world.map.speedAt(sq.pos, 'infantry') * suppressionSpeed(sq) * (sq.retreating ? RETREAT.speed : 1) * teamMult(world, sq.team, 'speed');
  let step = speed * dt;
  while (step > 0 && sq.path.length > 0) {
    const wp = sq.path[0];
    const d = dist(sq.pos, wp);
    if (d > 0.5) sq.heading = rotateTowards(sq.heading, angleTo(sq.pos, wp), 8 * dt);
    if (d <= step) {
      sq.pos = { x: wp.x, y: wp.y };
      sq.path.shift();
      step -= d;
    } else {
      sq.pos = moveTowards(sq.pos, wp, step);
      step = 0;
    }
  }
  sq.moving = true;
  if (sq.path.length === 0) onArrive(world, sq);
}

function updateInfantryModels(world: World, sq: Squad, dt: number): void {
  const n = aliveCount(sq);
  const deployed = sq.def.kind === 'team' && sq.setup !== 'packed';
  const speed = sq.def.speed * 1.3 * (sq.retreating ? RETREAT.speed : 1) * Math.max(0.3, suppressionSpeed(sq)) * teamMult(world, sq.team, 'speed');
  let i = 0;
  for (const m of sq.models) {
    if (!m.alive) continue;
    let target: Vec2;
    if (!sq.moving && m.coverSlot) {
      target = m.coverSlot;
    } else if (deployed) {
      target = add(sq.pos, rotate(crewOffset(i), sq.setupFacing));
    } else {
      target = add(sq.pos, rotate(formationOffset(i, n), sq.heading));
    }
    if (!world.map.worldPassable(target, 'infantry')) target = sq.pos;
    i++;
    const d = dist(m.pos, target);
    if (d > 240) {
      m.pos = { x: sq.pos.x, y: sq.pos.y };
      continue;
    }
    if (d > 0.8) {
      m.pos = moveTowards(m.pos, target, speed * world.map.speedAt(m.pos, 'infantry') * dt);
      if (world.time - sq.lastFired > 1) m.facing = angleTo(m.pos, target);
    } else if (deployed && world.time - sq.lastFired > 1) {
      m.facing = sq.setupFacing;
    }
  }
}

function driveVehicle(world: World, sq: Squad, goal: Vec2 | null, dt: number): void {
  const vd = sq.def.vehicle!;
  const hull = sq.models[0];
  sq.moving = false;
  if (goal) ensurePath(world, sq, goal);

  if (goal && sq.path.length > 0) {
    let wp = sq.path[0];
    if (sq.path.length > 1 && dist(sq.pos, wp) < 12) {
      sq.path.shift();
      wp = sq.path[0];
    }
    const desired = angleTo(sq.pos, wp);
    const hullTarget = sq.reversing ? wrapAngle(desired + Math.PI) : desired;
    sq.heading = rotateTowards(sq.heading, hullTarget, vd.turnRate * dt);
    const misalign = Math.abs(angleDiff(sq.heading, hullTarget));
    const maxSpeed =
      sq.def.speed * world.map.speedAt(sq.pos, 'vehicle') * (sq.reversing ? vd.reverseFactor : 1) * (sq.retreating ? 1.15 : 1);
    let want = misalign > 0.6 ? maxSpeed * 0.1 : maxSpeed * (1 - (misalign / 0.6) * 0.7);
    if (sq.path.length === 1) want = Math.min(want, Math.max(10, dist(sq.pos, wp) * 1.5));
    sq.speedNow = approach(sq.speedNow, want, (want > sq.speedNow ? 30 : 90) * dt);
    const step = fromAngle(sq.heading, sq.speedNow * dt * (sq.reversing ? -1 : 1));
    const next = add(sq.pos, step);
    // Clipping the corner of a house or wall: slide along it instead of stopping dead.
    const slide = [next, { x: sq.pos.x + step.x, y: sq.pos.y }, { x: sq.pos.x, y: sq.pos.y + step.y }].find((p) =>
      world.map.worldPassable(p, 'vehicle'),
    );
    if (slide && (slide === next || Math.hypot(slide.x - sq.pos.x, slide.y - sq.pos.y) > 0.01)) {
      sq.pos = slide;
      sq.blockedTime = 0;
    } else {
      sq.speedNow = 0;
      sq.blockedTime += dt;
      if (sq.blockedTime > 1.5) {
        sq.pathGoal = null;
        sq.repathTimer = 0;
        sq.blockedTime = 0;
      }
    }
    sq.moving = sq.speedNow > 1;
    if (sq.path.length === 1 && dist(sq.pos, wp) < 10) onArrive(world, sq);
    else giveUpIfStuck(world, sq, dt);
    crush(world, sq);
  } else {
    sq.stuckTime = 0;
    sq.stuckFrom = null;
    if (goal) onArrive(world, sq);
    sq.speedNow = approach(sq.speedNow, 0, 90 * dt);
  }
  hull.pos = { x: sq.pos.x, y: sq.pos.y };
  hull.facing = sq.heading;
}

/** Seconds without real headway before a vehicle drops its order (a retreat is cancelled too). */
const STUCK_LIMIT = 6;

function giveUpIfStuck(world: World, sq: Squad, dt: number): void {
  if (!sq.stuckFrom || dist(sq.pos, sq.stuckFrom) > TILE) {
    sq.stuckFrom = { ...sq.pos };
    sq.stuckTime = 0;
    return;
  }
  sq.stuckTime += dt;
  if (sq.stuckTime < STUCK_LIMIT) return;
  const wasRetreating = sq.retreating;
  sq.retreating = false;
  sq.stuckTime = 0;
  sq.stuckFrom = null;
  sq.queue.length = 0;
  finishOrder(sq);
  world.emit({
    type: 'notify',
    team: sq.team,
    text: wasRetreating ? `${sq.def.name} is stuck: retreat cancelled` : `${sq.def.name} is stuck and cannot get there`,
    tone: 'bad',
    pos: { ...sq.pos },
  });
}

/** Tanks flatten hedgerows and sandbags they drive through. */
function crush(world: World, sq: Squad): void {
  const half = sq.def.vehicle!.length / 2;
  for (const offset of [0, sq.reversing ? -half : half]) {
    const p = add(sq.pos, scale(fromAngle(sq.heading), offset));
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    const into = world.map.def(tx, ty).crushInto;
    if (into !== null) world.map.set(tx, ty, into);
  }
}
