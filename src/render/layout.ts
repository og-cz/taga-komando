import { TILE } from '../data/balance';
import { T } from '../data/terrain';
import type { GameMap } from '../sim/grid';

/** World units per cell of the layout fields. */
export const LAYOUT_RES = 1;
/** Blur radius (cells) per feature: roads round off their tile corners, paddies a little less. */
const ROAD_BLUR = 6;
const FIELD_BLUR = 7;

export type Polyline = { x: number; y: number }[];

/**
 * How the battlefield looks, as opposed to how it plays: smooth shapes for
 * roads, paddies and water, worked out from the same tiles the simulation
 * uses, so what is drawn never disagrees with what is walkable. The tiles are
 * blurred at one world unit per cell, so a road made of a staircase of tiles
 * becomes a smooth band and a paddy made of squares a field with rounded
 * corners; their outlines are traced as smooth polylines for dikes and fences.
 * Nothing here is read by the simulation.
 */
export class VisualLayout {
  readonly w: number;
  readonly h: number;
  /** 0..1: how much of a road covers each cell (0.5 is its edge). */
  readonly road: Float32Array;
  /** 0..1: paddy. */
  readonly paddy: Float32Array;
  /** 0..1: river and pond water. */
  readonly water: Float32Array;
  /** How far inside the road each cell lies, from the nearest edge (world units; 0 off the road). */
  readonly roadDepth: Float32Array;
  /** Bumped whenever a paddy's shape changes (so its outline is traced again). */
  private paddyVersion = 0;
  private edgeCache: { version: number; lines: Polyline[] } | null = null;

  constructor(private readonly map: GameMap) {
    this.w = Math.ceil(map.pixelWidth / LAYOUT_RES);
    this.h = Math.ceil(map.pixelHeight / LAYOUT_RES);
    const n = this.w * this.h;
    this.road = new Float32Array(n);
    this.paddy = new Float32Array(n);
    this.water = new Float32Array(n);
    this.roadDepth = new Float32Array(n);
    this.update(0, 0, map.w - 1, map.h - 1);
  }

  /** Recompute the fields over tiles tx0..tx1 × ty0..ty1 (after the ground changed there). */
  update(tx0: number, ty0: number, tx1: number, ty1: number): void {
    const pad = Math.max(ROAD_BLUR, FIELD_BLUR) * 3 + 2;
    const x0 = Math.max(0, Math.floor((tx0 * TILE) / LAYOUT_RES) - pad);
    const y0 = Math.max(0, Math.floor((ty0 * TILE) / LAYOUT_RES) - pad);
    const x1 = Math.min(this.w - 1, Math.ceil(((tx1 + 1) * TILE) / LAYOUT_RES) + pad);
    const y1 = Math.min(this.h - 1, Math.ceil(((ty1 + 1) * TILE) / LAYOUT_RES) + pad);
    this.blurField(this.road, (t) => t === T.Road, ROAD_BLUR, x0, y0, x1, y1);
    if (this.blurField(this.paddy, (t) => t === T.Paddy, FIELD_BLUR, x0, y0, x1, y1)) this.paddyVersion++;
    this.blurField(this.water, (t) => t === T.Water, FIELD_BLUR, x0, y0, x1, y1);
    this.depthField(x0, y0, x1, y1);
  }

  /** Bilinear sample of a field at a world point. */
  sample(field: Float32Array, wx: number, wy: number): number {
    const fx = wx / LAYOUT_RES - 0.5;
    const fy = wy / LAYOUT_RES - 0.5;
    const ix = Math.max(0, Math.min(this.w - 2, Math.floor(fx)));
    const iy = Math.max(0, Math.min(this.h - 2, Math.floor(fy)));
    const ax = Math.max(0, Math.min(1, fx - ix));
    const ay = Math.max(0, Math.min(1, fy - iy));
    const i = iy * this.w + ix;
    const top = field[i] + (field[i + 1] - field[i]) * ax;
    const bot = field[i + this.w] + (field[i + this.w + 1] - field[i + this.w]) * ax;
    return top + (bot - top) * ay;
  }

  /**
   * The indicator of a terrain, box-blurred three times (close to a Gaussian),
   * over a region; the margin round the region is read but not written.
   */
  private blurField(out: Float32Array, is: (t: number) => boolean, r: number, x0: number, y0: number, x1: number, y1: number): boolean {
    const m = r * 3 + 1;
    const bx0 = Math.max(0, x0 - m);
    const by0 = Math.max(0, y0 - m);
    const bx1 = Math.min(this.w - 1, x1 + m);
    const by1 = Math.min(this.h - 1, y1 + m);
    const bw = bx1 - bx0 + 1;
    const bh = by1 - by0 + 1;
    let a = new Float32Array(bw * bh);
    let b = new Float32Array(bw * bh);
    for (let y = 0; y < bh; y++) {
      const ty = Math.floor(((by0 + y + 0.5) * LAYOUT_RES) / TILE);
      for (let x = 0; x < bw; x++) {
        const tx = Math.floor(((bx0 + x + 0.5) * LAYOUT_RES) / TILE);
        a[y * bw + x] = is(this.map.get(tx, ty)) ? 1 : 0;
      }
    }
    const span = 2 * r + 1;
    for (let pass = 0; pass < 3; pass++) {
      // Rows, then columns: running sums, edges clamped.
      for (let y = 0; y < bh; y++) {
        const row = y * bw;
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += a[row + Math.max(0, Math.min(bw - 1, k))];
        for (let x = 0; x < bw; x++) {
          b[row + x] = sum / span;
          sum += a[row + Math.min(bw - 1, x + r + 1)] - a[row + Math.max(0, x - r)];
        }
      }
      for (let x = 0; x < bw; x++) {
        let sum = 0;
        for (let k = -r; k <= r; k++) sum += b[Math.max(0, Math.min(bh - 1, k)) * bw + x];
        for (let y = 0; y < bh; y++) {
          a[y * bw + x] = sum / span;
          sum += b[Math.min(bh - 1, y + r + 1) * bw + x] - b[Math.max(0, y - r) * bw + x];
        }
      }
    }
    let changed = false;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const v = a[(y - by0) * bw + (x - bx0)];
        const i = y * this.w + x;
        if (Math.abs(out[i] - v) > 1e-3) changed = true;
        out[i] = v;
      }
    }
    return changed;
  }

  /** The line just outside every paddy's dike, where its fence runs (traced once per change). */
  paddyEdges(): Polyline[] {
    if (this.edgeCache?.version !== this.paddyVersion) this.edgeCache = { version: this.paddyVersion, lines: this.contours(this.paddy, 0.2, 3) };
    return this.edgeCache.lines;
  }

  /** Distance inside the (smoothed) road from its edge, by a two-pass chamfer over the region. */
  private depthField(x0: number, y0: number, x1: number, y1: number): void {
    const m = 40;
    const bx0 = Math.max(0, x0 - m);
    const by0 = Math.max(0, y0 - m);
    const bx1 = Math.min(this.w - 1, x1 + m);
    const by1 = Math.min(this.h - 1, y1 + m);
    const bw = bx1 - bx0 + 1;
    const bh = by1 - by0 + 1;
    const d = new Float32Array(bw * bh);
    const BIG = 1e6;
    for (let y = 0; y < bh; y++) for (let x = 0; x < bw; x++) d[y * bw + x] = this.road[(by0 + y) * this.w + bx0 + x] >= 0.5 ? BIG : 0;
    const D1 = LAYOUT_RES;
    const D2 = LAYOUT_RES * Math.SQRT2;
    for (let y = 0; y < bh; y++) {
      for (let x = 0; x < bw; x++) {
        const i = y * bw + x;
        if (d[i] === 0) continue;
        let v = d[i];
        if (x > 0) v = Math.min(v, d[i - 1] + D1);
        if (y > 0) {
          v = Math.min(v, d[i - bw] + D1);
          if (x > 0) v = Math.min(v, d[i - bw - 1] + D2);
          if (x < bw - 1) v = Math.min(v, d[i - bw + 1] + D2);
        }
        d[i] = v;
      }
    }
    for (let y = bh - 1; y >= 0; y--) {
      for (let x = bw - 1; x >= 0; x--) {
        const i = y * bw + x;
        if (d[i] === 0) continue;
        let v = d[i];
        if (x < bw - 1) v = Math.min(v, d[i + 1] + D1);
        if (y < bh - 1) {
          v = Math.min(v, d[i + bw] + D1);
          if (x < bw - 1) v = Math.min(v, d[i + bw + 1] + D2);
          if (x > 0) v = Math.min(v, d[i + bw - 1] + D2);
        }
        d[i] = v;
      }
    }
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) this.roadDepth[y * this.w + x] = Math.min(64, d[(y - by0) * bw + (x - bx0)]);
  }

  /**
   * The outlines of a field at a level (0.5 is its edge), traced by marching
   * squares, joined into polylines, thinned to a point every few units and
   * smoothed, so dikes and fences follow natural curves.
   */
  contours(field: Float32Array, level = 0.5, spacing = 3): Polyline[] {
    const { w, h } = this;
    const key = (x: number, y: number) => `${Math.round(x * 4)},${Math.round(y * 4)}`;
    const segs: [number, number, number, number][] = [];
    const lerp = (a: number, b: number) => (level - a) / (b - a);
    for (let y = 0; y < h - 1; y++) {
      for (let x = 0; x < w - 1; x++) {
        const v0 = field[y * w + x];
        const v1 = field[y * w + x + 1];
        const v2 = field[(y + 1) * w + x + 1];
        const v3 = field[(y + 1) * w + x];
        const c = (v0 >= level ? 1 : 0) | (v1 >= level ? 2 : 0) | (v2 >= level ? 4 : 0) | (v3 >= level ? 8 : 0);
        if (c === 0 || c === 15) continue;
        // Edge points: top, right, bottom, left (in cell coordinates, cell centres at +0.5).
        const top = [x + lerp(v0, v1), y];
        const right = [x + 1, y + lerp(v1, v2)];
        const bottom = [x + lerp(v3, v2), y + 1];
        const left = [x, y + lerp(v0, v3)];
        const add = (p: number[], q: number[]) => segs.push([p[0], p[1], q[0], q[1]]);
        switch (c) {
          case 1: case 14: add(left, top); break;
          case 2: case 13: add(top, right); break;
          case 3: case 12: add(left, right); break;
          case 4: case 11: add(right, bottom); break;
          case 6: case 9: add(top, bottom); break;
          case 7: case 8: add(left, bottom); break;
          case 5: add(left, top); add(right, bottom); break;
          case 10: add(top, right); add(left, bottom); break;
        }
      }
    }
    // Join segments end to end.
    const ends = new Map<string, number[]>();
    segs.forEach((s, i) => {
      for (const k of [key(s[0], s[1]), key(s[2], s[3])]) {
        let l = ends.get(k);
        if (!l) ends.set(k, (l = []));
        l.push(i);
      }
    });
    const used = new Uint8Array(segs.length);
    const lines: Polyline[] = [];
    for (let i = 0; i < segs.length; i++) {
      if (used[i]) continue;
      used[i] = 1;
      const pts: [number, number][] = [[segs[i][0], segs[i][1]], [segs[i][2], segs[i][3]]];
      // Grow from the tail, then from the head.
      for (const grow of [true, false]) {
        for (;;) {
          const [px, py] = grow ? pts[pts.length - 1] : pts[0];
          const next = (ends.get(key(px, py)) ?? []).find((j) => !used[j]);
          if (next === undefined) break;
          used[next] = 1;
          const s = segs[next];
          const far: [number, number] = key(s[0], s[1]) === key(px, py) ? [s[2], s[3]] : [s[0], s[1]];
          if (grow) pts.push(far);
          else pts.unshift(far);
        }
      }
      if (pts.length < 6) continue;
      // Thin to a point every `spacing` units, then round off with two Chaikin passes.
      let thin: [number, number][] = [pts[0]];
      let run = 0;
      for (let k = 1; k < pts.length; k++) {
        run += Math.hypot(pts[k][0] - pts[k - 1][0], pts[k][1] - pts[k - 1][1]) * LAYOUT_RES;
        if (run >= spacing) {
          thin.push(pts[k]);
          run = 0;
        }
      }
      const closed = Math.hypot(pts[0][0] - pts[pts.length - 1][0], pts[0][1] - pts[pts.length - 1][1]) < 1.5;
      for (let pass = 0; pass < 2; pass++) {
        const out: [number, number][] = closed ? [] : [thin[0]];
        const n = thin.length;
        for (let k = 0; k < (closed ? n : n - 1); k++) {
          const a = thin[k];
          const b = thin[(k + 1) % n];
          out.push([a[0] * 0.75 + b[0] * 0.25, a[1] * 0.75 + b[1] * 0.25], [a[0] * 0.25 + b[0] * 0.75, a[1] * 0.25 + b[1] * 0.75]);
        }
        if (!closed) out.push(thin[n - 1]);
        thin = out;
      }
      const line = thin.map(([x, y]) => ({ x: (x + 0.5) * LAYOUT_RES, y: (y + 0.5) * LAYOUT_RES }));
      if (closed) line.push({ ...line[0] });
      lines.push(line);
    }
    return lines;
  }
}
