import { HEDGE_PEEK, MAX_SIGHT_DENSITY, TILE } from '../data/balance';
import { T, TERRAIN } from '../data/terrain';
import type { Vec2 } from '../core/vec';
import type { GameMap } from './grid';

/**
 * Line of sight between two points. Buildings block outright; a hedgerow
 * blocks unless one end is right at it (lining it, looking over); foliage and
 * smoke add density and too much of it blocks. The start and end tiles are
 * ignored so a unit at the edge of a jungle can see and be seen.
 * `ignoreStart`/`ignoreEnd` skip samples within that radius of the endpoints
 * (for large footprints).
 */
export function hasLineOfSight(map: GameMap, a: Vec2, b: Vec2, ignoreEnd = 0, ignoreStart = 0): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const d = Math.hypot(dx, dy);
  const steps = Math.ceil(d / (TILE * 0.5));
  const startTile = map.idx(Math.floor(a.x / TILE), Math.floor(a.y / TILE));
  const endTile = map.idx(Math.floor(b.x / TILE), Math.floor(b.y / TILE));
  let density = 0;
  let last = -1;
  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    if (d * t < ignoreStart) continue;
    if (d * (1 - t) < ignoreEnd) break;
    const tx = Math.floor((a.x + dx * t) / TILE);
    const ty = Math.floor((a.y + dy * t) / TILE);
    if (!map.inBounds(tx, ty)) return false;
    const tile = ty * map.w + tx;
    if (tile === last || tile === startTile || tile === endTile) continue;
    last = tile;
    const def = TERRAIN[map.tiles[tile]];
    if (def.blocksSight) return false;
    if (map.tiles[tile] === T.Hedge && d * t > HEDGE_PEEK * TILE && d * (1 - t) > HEDGE_PEEK * TILE) return false;
    density += def.sightDensity + map.smoke[tile];
    if (density > MAX_SIGHT_DENSITY) return false;
  }
  return true;
}
