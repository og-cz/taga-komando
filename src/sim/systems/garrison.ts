import { HOUSE, TILE } from '../../data/balance';
import { T } from '../../data/terrain';
import type { WeaponDef } from '../../data/types';
import { clamp, dist, type Vec2 } from '../../core/vec';
import type { Squad } from '../entities';
import { hasLineOfSight } from '../los';
import { finishOrder, resetMovement } from '../orders';
import type { World } from '../world';
import { applyDamage } from './combat';

/** A house infantry can occupy: one connected block of building tiles. */
export interface House {
  id: number;
  tiles: number[];
  center: Vec2;
  /** Half its size, for sight cast from inside. */
  radius: number;
  /** Where the men stand: just inside the walls, one per outside tile edge. */
  windows: Vec2[];
  /** Ground next to the house a squad walks to before going in. */
  doors: Vec2[];
  occupant: number | null;
  hp: number;
  maxHp: number;
  /** 0 standing, 1 damaged (roof broken, smoking), 2 burning, 3 fallen in. */
  stage: HouseStage;
}

export type HouseStage = 0 | 1 | 2 | 3;

/** How badly a house is hit, from its health. */
export function stageFor(hp: number, maxHp: number): HouseStage {
  if (hp <= 0) return 3;
  const k = hp / maxHp;
  return k <= HOUSE.burning ? 2 : k <= HOUSE.damaged ? 1 : 0;
}

/** A fixed number in [0, 1) per house, so the same houses start damaged every time. */
function hash(n: number): number {
  return ((Math.imul(n + 1, 2654435761) >>> 8) % 10000) / 10000;
}

/** How close to a door a squad must come to go in. */
const DOOR_REACH = 22;

/** Houses are found once from the map; after that they only lose health and fall in. */
export function findHouses(world: World): House[] {
  const map = world.map;
  const seen = new Uint8Array(map.w * map.h);
  const houses: House[] = [];
  for (let start = 0; start < seen.length; start++) {
    const sx = start % map.w;
    const sy = Math.floor(start / map.w);
    if (seen[start] || map.get(sx, sy) !== T.Building) continue;
    const tiles: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      tiles.push(k);
      const kx = k % map.w;
      const ky = Math.floor(k / map.w);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = kx + dx;
        const ny = ky + dy;
        if (!map.inBounds(nx, ny)) continue;
        const j = ny * map.w + nx;
        if (!seen[j] && map.get(nx, ny) === T.Building) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    // Huge walled blocks (a cathedral, a fort) are not houses.
    if (tiles.length > 40) continue;
    let cx = 0;
    let cy = 0;
    for (const k of tiles) {
      cx += (k % map.w) + 0.5;
      cy += Math.floor(k / map.w) + 0.5;
    }
    const center = { x: (cx / tiles.length) * TILE, y: (cy / tiles.length) * TILE };
    const windows: Vec2[] = [];
    const doors: Vec2[] = [];
    let radius = 0;
    for (const k of tiles) {
      const tx = k % map.w;
      const ty = Math.floor(k / map.w);
      radius = Math.max(radius, Math.hypot((tx + 0.5) * TILE - center.x, (ty + 0.5) * TILE - center.y) + TILE * 0.5);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = tx + dx;
        const ny = ty + dy;
        if (map.get(nx, ny) === T.Building) continue;
        windows.push({ x: (tx + 0.5 + dx * 0.32) * TILE, y: (ty + 0.5 + dy * 0.32) * TILE });
        if (map.passable(nx, ny, 'infantry')) doors.push(map.tileCenter(nx, ny));
      }
    }
    if (!doors.length || !windows.length) continue;
    // The ground under a headquarters or other structure is not a house.
    if (world.squads.some((s) => s.def.kind === 'structure' && dist(s.pos, center) < s.def.radius + TILE)) continue;
    const maxHp = HOUSE.baseHp + HOUSE.hpPerTile * tiles.length;
    // Some houses have already been shelled before the battle starts.
    const r = hash(tiles[0]);
    const hp = r < HOUSE.startBurning ? maxHp * 0.3 : r < HOUSE.startBurning + HOUSE.startDamaged ? maxHp * 0.55 : maxHp;
    houses.push({ id: houses.length, tiles, center, radius, windows, doors, occupant: null, hp, maxHp, stage: stageFor(hp, maxHp) });
  }
  return houses;
}

/** The house at a world point, if any. */
export function houseAt(world: World, p: Vec2): House | undefined {
  const i = world.map.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
  return world.houses.find((h) => h.stage < 3 && h.tiles.includes(i));
}

/** The squad's house while it is inside one. */
export function houseOf(world: World, sq: Squad): House | undefined {
  return sq.garrison === null ? undefined : world.houses[sq.garrison];
}

/** Whether a house can be gone into: a ruin cannot. */
export function standing(house: House): boolean {
  return house.stage < 3;
}

/** Whether this squad may go into houses at all: foot soldiers, not weapon teams or tanks. */
export function canGarrison(sq: Squad): boolean {
  return sq.def.kind === 'infantry';
}

function nearest(points: readonly Vec2[], to: Vec2): Vec2 {
  let best = points[0];
  let bd = Infinity;
  for (const p of points) {
    const d = dist(p, to);
    if (d < bd) {
      bd = d;
      best = p;
    }
  }
  return best;
}

/** The door a squad coming from `from` would use. */
export function doorFor(house: House, from: Vec2): Vec2 {
  return nearest(house.doors, from);
}

/**
 * Can `a` put fire on `b` from where it stands? From inside a house the men
 * shoot out of their windows; a squad inside a house is hit at its windows,
 * so only the windows facing the shooter count.
 */
export function canHit(world: World, a: Squad, b: Squad): boolean {
  const from = a.garrison !== null ? a.models.filter((m) => m.alive).map((m) => m.pos) : [a.pos];
  const to = b.garrison !== null ? b.models.filter((m) => m.alive).map((m) => m.pos) : [b.pos];
  for (const p of from) {
    for (const q of to) {
      if (hasLineOfSight(world.map, p, q, b.garrison !== null ? 0 : b.def.radius, a.garrison !== null ? 0 : a.def.radius)) return true;
    }
  }
  return false;
}

function enter(world: World, sq: Squad, house: House): void {
  sq.garrison = house.id;
  house.occupant = sq.id;
  sq.pos = { ...house.center };
  sq.moving = false;
  sq.channel = null;
  resetMovement(sq);
  placeAtWindows(sq, house);
  world.emit({ type: 'notify', team: sq.team, text: `${sq.def.short} took a house`, tone: 'good', pos: { ...house.center } });
}

/** Out of the door nearest where the squad is going. */
export function leave(world: World, sq: Squad, toward: Vec2): void {
  const house = houseOf(world, sq);
  sq.garrison = null;
  if (!house) return;
  house.occupant = null;
  const door = doorFor(house, toward);
  sq.pos = { ...door };
  for (const m of sq.models) {
    if (!m.alive) continue;
    m.pos = world.map.nearestPassable({ x: door.x + (world.rng.next() - 0.5) * 10, y: door.y + (world.rng.next() - 0.5) * 10 }, 'infantry');
  }
  resetMovement(sq);
}

/** The men spread over the windows, facing out. */
function placeAtWindows(sq: Squad, house: House): void {
  const alive = sq.models.filter((m) => m.alive);
  const n = house.windows.length;
  alive.forEach((m, i) => {
    const w = house.windows[Math.floor(((i + 0.5) * n) / alive.length) % n];
    m.pos = { ...w };
    m.facing = Math.atan2(w.y - house.center.y, w.x - house.center.x);
    m.coverSlot = null;
  });
}

/**
 * A blast wears down the houses it reaches. Bullets never do: it takes
 * mortars, shells or satchels, and a lot of them, to bring a house down.
 */
export function damageHouses(world: World, pos: Vec2, w: WeaponDef): void {
  if (w.aoe <= 0) return;
  const map = world.map;
  for (const h of world.houses) {
    if (h.stage === 3 || dist(h.center, pos) > h.radius + w.aoe + TILE) continue;
    // Distance from the blast to the nearest wall.
    let gap = Infinity;
    for (const k of h.tiles) {
      const x0 = (k % map.w) * TILE;
      const y0 = Math.floor(k / map.w) * TILE;
      const dx = Math.max(x0 - pos.x, 0, pos.x - (x0 + TILE));
      const dy = Math.max(y0 - pos.y, 0, pos.y - (y0 + TILE));
      gap = Math.min(gap, Math.hypot(dx, dy));
    }
    if (gap > w.aoe) continue;
    const falloff = 1 - 0.65 * clamp(gap / Math.max(w.aoe, 1), 0, 1);
    hurtHouse(world, h, w.damage * falloff * (w.vs.structure ?? 1));
  }
}

/** Take hit points off a house; it shows each new stage, and falls in at zero. */
export function hurtHouse(world: World, h: House, dmg: number): void {
  if (h.stage === 3 || dmg <= 0) return;
  h.hp = Math.max(0, h.hp - dmg);
  const stage = stageFor(h.hp, h.maxHp);
  if (stage === h.stage) return;
  h.stage = stage;
  const occupant = h.occupant !== null ? world.get(h.occupant) : undefined;
  if (stage === 2) {
    world.emit({ type: 'float', pos: { ...h.center }, text: 'House on fire', tone: 'bad' });
    if (occupant) world.emit({ type: 'notify', team: occupant.team, text: `${occupant.def.short}'s house is burning`, tone: 'bad', pos: { ...h.center } });
  }
  if (stage === 3) collapse(world, h, occupant);
}

/** The house falls in: rubble where it stood, and whoever was inside is thrown out hurt. */
function collapse(world: World, h: House, occupant: Squad | undefined): void {
  const map = world.map;
  for (const k of h.tiles) map.set(k % map.w, Math.floor(k / map.w), T.Rubble);
  world.emit({ type: 'collapse', pos: { ...h.center }, radius: h.radius });
  world.emit({ type: 'float', pos: { ...h.center }, text: 'House destroyed', tone: 'bad' });
  if (!occupant) return;
  leave(world, occupant, occupant.order.dest ?? h.center);
  world.emit({ type: 'notify', team: occupant.team, text: `${occupant.def.short}'s house came down on them`, tone: 'bad', pos: { ...h.center } });
  for (const m of occupant.models) applyDamage(world, occupant, m, HOUSE.collapseDamage * (0.6 + world.rng.next() * 0.8), null);
}

export function updateGarrisons(world: World, dt: number): void {
  for (const sq of world.squads) {
    const house = houseOf(world, sq);
    if (sq.dead) {
      if (house && house.occupant === sq.id) house.occupant = null;
      if (house) sq.garrison = null;
      continue;
    }
    if (house) {
      const o = sq.order;
      // Any order to go somewhere takes them out of the house first.
      if (o.kind === 'move' || o.kind === 'attackMove' || o.kind === 'retreat' || (o.kind === 'garrison' && o.houseId !== house.id)) {
        leave(world, sq, o.dest ?? house.center);
        continue;
      }
      if (o.kind === 'garrison') finishOrder(sq);
      // Reinforcements and anyone out of place take a window.
      placeAtWindows(sq, house);
      // A burning house hurts the men inside until they get out.
      if (house.stage === 2) for (const m of sq.models) applyDamage(world, sq, m, HOUSE.fireDamage * dt, null);
      continue;
    }
    if (sq.order.kind !== 'garrison') continue;
    const target = world.houses[sq.order.houseId ?? -1];
    if (!target || !standing(target) || (target.occupant !== null && target.occupant !== sq.id) || !canGarrison(sq)) {
      finishOrder(sq);
      continue;
    }
    if (dist(sq.pos, doorFor(target, sq.pos)) <= DOOR_REACH) enter(world, sq, target);
  }
}
