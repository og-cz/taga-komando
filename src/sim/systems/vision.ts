import { MAX_SIGHT_DENSITY, TILE, VISION_INTERVAL } from '../../data/balance';
import { TERRAIN } from '../../data/terrain';
import type { TeamId } from '../../data/types';
import type { Vec2 } from '../../core/vec';
import type { GameMap } from '../grid';
import type { World } from '../world';

/**
 * Per-team fog of war on the tile grid. Rays are cast from each unit to the rim
 * of its sight circle; buildings stop a ray, foliage thins it out.
 */
export class Vision {
  readonly visible: [Uint8Array, Uint8Array];
  /** Bumped every recompute so renderers know when to refresh the fog texture. */
  version = 0;
  private timer = 0;

  constructor(private readonly map: GameMap) {
    const n = map.w * map.h;
    this.visible = [new Uint8Array(n), new Uint8Array(n)];
  }

  update(world: World, dt: number): void {
    this.timer -= dt;
    if (this.timer > 0) return;
    this.timer = VISION_INTERVAL;
    this.recompute(world);
  }

  recompute(world: World): void {
    for (const team of [0, 1] as const) {
      const vis = this.visible[team];
      vis.fill(0);
      for (const sq of world.squads) {
        if (sq.dead || sq.team !== team) continue;
        this.cast(vis, sq.pos, sq.def.sight, sq.def.radius);
      }
      // Spotter planes see everything around their target.
      for (const r of world.teams[team].reveals) {
        const rt = r.radius / TILE;
        const cx = r.pos.x / TILE;
        const cy = r.pos.y / TILE;
        for (let ty = Math.floor(cy - rt); ty <= Math.ceil(cy + rt); ty++) {
          for (let tx = Math.floor(cx - rt); tx <= Math.ceil(cx + rt); tx++) {
            if (this.map.inBounds(tx, ty) && Math.hypot(tx + 0.5 - cx, ty + 0.5 - cy) <= rt) vis[ty * this.map.w + tx] = 1;
          }
        }
      }
    }
    this.version++;
  }

  isVisible(team: TeamId, p: Vec2): boolean {
    const tx = Math.floor(p.x / TILE);
    const ty = Math.floor(p.y / TILE);
    if (!this.map.inBounds(tx, ty)) return false;
    return this.visible[team][ty * this.map.w + tx] === 1;
  }

  isTileVisible(team: TeamId, tx: number, ty: number): boolean {
    return this.map.inBounds(tx, ty) && this.visible[team][ty * this.map.w + tx] === 1;
  }

  private cast(vis: Uint8Array, origin: Vec2, sight: number, footprint: number): void {
    const map = this.map;
    const ox = origin.x / TILE;
    const oy = origin.y / TILE;
    const r = sight / TILE;
    const ignore = footprint / TILE + 0.5;
    const otx = Math.floor(ox);
    const oty = Math.floor(oy);
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (map.inBounds(otx + dx, oty + dy)) vis[(oty + dy) * map.w + otx + dx] = 1;
      }
    }
    const rays = Math.ceil(Math.PI * 2 * r * 1.6);
    for (let i = 0; i < rays; i++) {
      const a = (i / rays) * Math.PI * 2;
      const cx = Math.cos(a);
      const cy = Math.sin(a);
      let density = 0;
      let last = -1;
      for (let s = 0.5; s <= r; s += 0.5) {
        const tx = Math.floor(ox + cx * s);
        const ty = Math.floor(oy + cy * s);
        if (!map.inBounds(tx, ty)) break;
        const idx = ty * map.w + tx;
        if (idx === last) continue;
        last = idx;
        vis[idx] = 1;
        if (s < ignore) continue;
        const def = TERRAIN[map.tiles[idx]];
        if (def.blocksSight) break;
        density += def.sightDensity;
        if (density > MAX_SIGHT_DENSITY) break;
      }
    }
  }
}
