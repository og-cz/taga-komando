import { TILE } from '../../data/balance';
import { T } from '../../data/terrain';
import { dist, type Vec2 } from '../../core/vec';
import type { Squad } from '../entities';
import { hasLineOfSight } from '../los';
import { finishOrder, resetMovement } from '../orders';
import type { World } from '../world';

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
}

/** How close to a door a squad must come to go in. */
const DOOR_REACH = 22;

/** Houses are found once from the map: buildings are not torn down in battle. */
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
    houses.push({ id: houses.length, tiles, center, radius, windows, doors, occupant: null });
  }
  return houses;
}

/** The house at a world point, if any. */
export function houseAt(world: World, p: Vec2): House | undefined {
  const i = world.map.idx(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
  return world.houses.find((h) => h.tiles.includes(i));
}

/** The squad's house while it is inside one. */
export function houseOf(world: World, sq: Squad): House | undefined {
  return sq.garrison === null ? undefined : world.houses[sq.garrison];
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

export function updateGarrisons(world: World): void {
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
      continue;
    }
    if (sq.order.kind !== 'garrison') continue;
    const target = world.houses[sq.order.houseId ?? -1];
    if (!target || (target.occupant !== null && target.occupant !== sq.id) || !canGarrison(sq)) {
      finishOrder(sq);
      continue;
    }
    if (dist(sq.pos, doorFor(target, sq.pos)) <= DOOR_REACH) enter(world, sq, target);
  }
}
