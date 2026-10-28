import { TILE } from '../data/balance';
import { decodeGridRow, GRID_LEGEND } from '../data/gridCodec';
import { T, TERRAIN } from '../data/terrain';
import type { MapDef, MapFeature, Mover, TerrainDef } from '../data/types';
import { Rng } from '../core/rng';
import type { Vec2 } from '../core/vec';

/** Tile grid of terrain. Knows nothing about units; purely spatial queries. */
export class GameMap {
  readonly tiles: Uint8Array;
  /** Smoke over each tile, as sight density (see systems/smoke.ts); 0 where the air is clear. */
  readonly smoke: Float32Array;
  /** Bumped on every terrain change so caches (render, paths) can invalidate. */
  version = 0;
  /** Indices of tiles changed since the renderer last consumed them. */
  readonly changes: number[] = [];

  constructor(
    readonly w: number,
    readonly h: number,
  ) {
    this.tiles = new Uint8Array(w * h);
    this.smoke = new Float32Array(w * h);
  }

  static fromDef(def: MapDef): GameMap {
    const m = new GameMap(def.width, def.height);
    for (const f of def.features) m.applyFeature(f);
    for (const b of def.bases) m.clearAround(b.x, b.y, 7.5);
    m.changes.length = 0;
    m.version = 0;
    return m;
  }

  get pixelWidth(): number {
    return this.w * TILE;
  }

  get pixelHeight(): number {
    return this.h * TILE;
  }

  inBounds(tx: number, ty: number): boolean {
    return tx >= 0 && ty >= 0 && tx < this.w && ty < this.h;
  }

  idx(tx: number, ty: number): number {
    return ty * this.w + tx;
  }

  get(tx: number, ty: number): number {
    return this.inBounds(tx, ty) ? this.tiles[ty * this.w + tx] : T.Water;
  }

  def(tx: number, ty: number): TerrainDef {
    return TERRAIN[this.get(tx, ty)];
  }

  set(tx: number, ty: number, terrain: number): void {
    if (!this.inBounds(tx, ty)) return;
    const i = ty * this.w + tx;
    if (this.tiles[i] === terrain) return;
    this.tiles[i] = terrain;
    this.changes.push(i);
    this.version++;
  }

  static tileOf(x: number): number {
    return Math.floor(x / TILE);
  }

  terrainAt(p: Vec2): TerrainDef {
    return this.def(Math.floor(p.x / TILE), Math.floor(p.y / TILE));
  }

  tileCenter(tx: number, ty: number): Vec2 {
    return { x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE };
  }

  cost(tx: number, ty: number, mover: Mover): number {
    const d = this.def(tx, ty);
    return mover === 'vehicle' ? d.vehicleCost : d.infantryCost;
  }

  passable(tx: number, ty: number, mover: Mover): boolean {
    return this.inBounds(tx, ty) && Number.isFinite(this.cost(tx, ty, mover));
  }

  worldPassable(p: Vec2, mover: Mover): boolean {
    return this.passable(Math.floor(p.x / TILE), Math.floor(p.y / TILE), mover);
  }

  /** Speed multiplier for a unit standing at `p`. */
  speedAt(p: Vec2, mover: Mover): number {
    const c = this.cost(Math.floor(p.x / TILE), Math.floor(p.y / TILE), mover);
    return Number.isFinite(c) ? 1 / c : 1;
  }

  /** True if a unit can walk the straight segment a→b without leaving passable ground. */
  lineWalkable(a: Vec2, b: Vec2, mover: Mover): boolean {
    const dx = b.x - a.x;
    const dy = b.y - a.y;
    const steps = Math.max(1, Math.ceil(Math.hypot(dx, dy) / 4));
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      if (!this.worldPassable({ x: a.x + dx * t, y: a.y + dy * t }, mover)) return false;
    }
    return true;
  }

  /** Spiral outwards from a tile to the closest passable one. */
  nearestPassableTile(tx: number, ty: number, mover: Mover, maxR = 12): [number, number] | null {
    if (this.passable(tx, ty, mover)) return [tx, ty];
    for (let r = 1; r <= maxR; r++) {
      let best: [number, number] | null = null;
      let bestD = Infinity;
      for (let dy = -r; dy <= r; dy++) {
        for (let dx = -r; dx <= r; dx++) {
          if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue;
          if (!this.passable(tx + dx, ty + dy, mover)) continue;
          const d = dx * dx + dy * dy;
          if (d < bestD) {
            bestD = d;
            best = [tx + dx, ty + dy];
          }
        }
      }
      if (best) return best;
    }
    return null;
  }

  nearestPassable(p: Vec2, mover: Mover): Vec2 {
    if (this.worldPassable(p, mover)) return { x: p.x, y: p.y };
    const t = this.nearestPassableTile(Math.floor(p.x / TILE), Math.floor(p.y / TILE), mover);
    return t ? this.tileCenter(t[0], t[1]) : { x: p.x, y: p.y };
  }

  private applyFeature(f: MapFeature): void {
    switch (f.kind) {
      case 'rect':
        for (let y = Math.floor(f.y); y < Math.ceil(f.y + f.h); y++) {
          for (let x = Math.floor(f.x); x < Math.ceil(f.x + f.w); x++) this.set(x, y, f.terrain);
        }
        break;
      case 'circle':
        this.fillDisc(f.x, f.y, f.r, f.terrain);
        break;
      case 'line': {
        // Radius padded so single-width diagonal lines stay 8-connected.
        const r = f.width / 2 + 0.21;
        for (let i = 0; i < f.points.length - 1; i++) {
          const [x1, y1] = f.points[i];
          const [x2, y2] = f.points[i + 1];
          const steps = Math.max(1, Math.ceil(Math.hypot(x2 - x1, y2 - y1) * 4));
          for (let s = 0; s <= steps; s++) {
            const t = s / steps;
            this.fillDisc(x1 + (x2 - x1) * t, y1 + (y2 - y1) * t, r, f.terrain);
          }
        }
        break;
      }
      case 'grid':
        f.rows.forEach((row, y) => {
          decodeGridRow(row).forEach((c, x) => {
            const terrain = GRID_LEGEND[c];
            if (terrain !== undefined) this.set(x, y, terrain);
          });
        });
        break;
      case 'scatter': {
        const rng = new Rng(f.seed);
        for (let i = 0; i < f.count; i++) {
          const x = Math.floor(f.x + rng.next() * f.w);
          const y = Math.floor(f.y + rng.next() * f.h);
          if (this.get(x, y) === T.Open || this.get(x, y) === T.Paddy) this.set(x, y, f.terrain);
        }
        break;
      }
    }
  }

  private fillDisc(cx: number, cy: number, r: number, terrain: number): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r) this.set(x, y, terrain);
      }
    }
  }

  /** Base areas are cleared to open ground, but roads through them are kept. */
  private clearAround(cx: number, cy: number, r: number): void {
    for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
      for (let x = Math.floor(cx - r); x <= Math.ceil(cx + r); x++) {
        const dx = x + 0.5 - cx;
        const dy = y + 0.5 - cy;
        if (dx * dx + dy * dy <= r * r && this.get(x, y) !== T.Road) this.set(x, y, T.Open);
      }
    }
  }
}
