import { SMOKE, TILE } from '../../data/balance';
import { clamp, type Vec2 } from '../../core/vec';
import type { World } from '../world';

/** A smoke screen: a cloud that blocks sight and fire through it until it thins away. */
export interface Smoke {
  pos: Vec2;
  radius: number;
  born: number;
  until: number;
}

/** Lay a smoke screen: it thickens over a moment, hangs, then thins out. */
export function addSmoke(world: World, pos: Vec2, radius: number, seconds: number): void {
  world.smokes.push({ pos: { ...pos }, radius, born: world.time, until: world.time + seconds });
  world.emit({ type: 'smoke', pos: { ...pos }, radius });
}

/** How thick a cloud is now, 0..1. */
export function smokeStrength(s: Smoke, time: number): number {
  return clamp((time - s.born) / SMOKE.buildUp, 0, 1) * clamp((s.until - time) / SMOKE.thinOut, 0, 1);
}

/**
 * Stamp the clouds onto the map's smoke layer, which sight and line of fire
 * read: thick in the middle of a cloud, thinner towards its edge.
 */
export function updateSmoke(world: World): void {
  const map = world.map;
  if (world.smokes.length === 0 && !world.smokeOnMap) return;
  world.smokes = world.smokes.filter((s) => s.until > world.time);
  map.smoke.fill(0);
  for (const s of world.smokes) {
    const k = smokeStrength(s, world.time);
    if (k <= 0) continue;
    const rt = s.radius / TILE;
    const cx = s.pos.x / TILE;
    const cy = s.pos.y / TILE;
    for (let ty = Math.floor(cy - rt); ty <= Math.ceil(cy + rt); ty++) {
      for (let tx = Math.floor(cx - rt); tx <= Math.ceil(cx + rt); tx++) {
        if (!map.inBounds(tx, ty)) continue;
        const d = Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) / rt;
        if (d > 1) continue;
        const i = ty * map.w + tx;
        map.smoke[i] = Math.min(SMOKE.density * 1.5, map.smoke[i] + SMOKE.density * k * (d < 0.6 ? 1 : 1 - (d - 0.6) / 0.6));
      }
    }
  }
  world.smokeOnMap = world.smokes.length > 0;
}
