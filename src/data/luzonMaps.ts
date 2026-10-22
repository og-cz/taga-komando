import { Rng } from '../core/rng';
import { decodeGridRow, encodeGridRow } from './gridCodec';
import { CALUMPIT_ROWS } from './luzon/calumpit';
import { ABUCAY_ROWS } from './luzon/abucay';
import { BALIUAG_ROWS } from './luzon/baliuag';
import { DINALUPIHAN_ROWS } from './luzon/dinalupihan';
import { GUAGUA_ROWS } from './luzon/guagua';
import { HERMOSA_ROWS } from './luzon/hermosa';
import { LINGAYEN_ROWS } from './luzon/lingayen';
import { LUBAO_ROWS } from './luzon/lubao';
import { ORANI_ROWS } from './luzon/orani';
import { PILAR_ROWS } from './luzon/pilar';
import { PLARIDEL_ROWS } from './luzon/plaridel';
import { PORAC_ROWS } from './luzon/porac';
import { SAN_FERNANDO_ROWS } from './luzon/san-fernando';
import type { MapDef, MapFeature, MapPointDef, PointKind } from './types';

/**
 * Battlefields built from Watabou village maps (converted with
 * tools/watabou-to-grid.js) and named after real towns on Luzon. The maps are
 * not symmetrical, so bases and capture points are placed by driving distance:
 * victory points sit where both sides are equally far away, and each side gets
 * its own munitions and fuel at the same distance from home.
 */
interface LuzonMapSource {
  id: string;
  name: string;
  description: string;
  rows: readonly string[];
  /** Name for a victory point on a bridge, used when a bridge is fair to both sides. */
  bridge?: string;
  names: { victory: readonly [string, string, string]; munitions: readonly [string, string]; fuel: readonly [string, string] };
}

/** Tiles tanks cannot cross: water, buildings, jungle, walls. */
const UNDRIVABLE = new Set(['~', '#', 'j', 'w', 'r']);
/** Half-size of the open ground cleared around each HQ. */
const BASE_CLEAR = 4;

type Cell = { x: number; y: number };

/**
 * Buildings traced from the town plans come out as staircases wherever a house
 * stood at an angle to the grid. Rebuild each block of houses from its largest
 * clean rectangles (at least 2 × 2 tiles); the leftover steps and slivers become
 * open yard. A small house that would vanish keeps its biggest block.
 */
function tidyHouses(grid: string[][]): void {
  const H = grid.length;
  const W = grid[0].length;
  const seen = new Uint8Array(W * H);
  for (let start = 0; start < W * H; start++) {
    const sx = start % W;
    const sy = Math.floor(start / W);
    if (seen[start] || grid[sy][sx] !== '#') continue;
    // One block of touching houses.
    const tiles: number[] = [];
    const stack = [start];
    seen[start] = 1;
    while (stack.length) {
      const k = stack.pop()!;
      tiles.push(k);
      const kx = k % W;
      const ky = Math.floor(k / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = kx + dx;
        const ny = ky + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H) continue;
        const j = ny * W + nx;
        if (!seen[j] && grid[ny][nx] === '#') {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    const left = new Set(tiles);
    const keep = new Set<number>();
    let first = true;
    for (;;) {
      const r = largestRect(left, W);
      if (!r) break;
      const big = r.w >= 2 && r.h >= 2;
      if (!big && !(first && r.w * r.h >= 2)) break;
      for (let y = r.y; y < r.y + r.h; y++) {
        for (let x = r.x; x < r.x + r.w; x++) {
          left.delete(y * W + x);
          keep.add(y * W + x);
        }
      }
      first = false;
      if (!big) break;
    }
    for (const k of tiles) if (!keep.has(k)) grid[Math.floor(k / W)][k % W] = '.';
  }
}

/** The largest axis-aligned rectangle made only of the given tiles. */
function largestRect(tiles: Set<number>, W: number): { x: number; y: number; w: number; h: number } | null {
  if (tiles.size === 0) return null;
  let x0 = Infinity;
  let x1 = -Infinity;
  let y0 = Infinity;
  let y1 = -Infinity;
  for (const k of tiles) {
    const x = k % W;
    const y = Math.floor(k / W);
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, y);
    y1 = Math.max(y1, y);
  }
  const bw = x1 - x0 + 1;
  const heights = new Array<number>(bw).fill(0);
  let best: { x: number; y: number; w: number; h: number } | null = null;
  let bestArea = 0;
  for (let y = y0; y <= y1; y++) {
    for (let i = 0; i < bw; i++) heights[i] = tiles.has(y * W + x0 + i) ? heights[i] + 1 : 0;
    // Largest rectangle in the histogram of heights ending on this row.
    const stack: number[] = [];
    for (let i = 0; i <= bw; i++) {
      const h = i < bw ? heights[i] : 0;
      while (stack.length && heights[stack[stack.length - 1]] >= h) {
        const top = stack.pop()!;
        const height = heights[top];
        const start = stack.length ? stack[stack.length - 1] + 1 : 0;
        const width = i - start;
        // Prefer squarer houses: a long sliver of a row is not much of a house.
        const area = height * width - (Math.min(height, width) < 2 ? 0.5 : 0);
        if (height > 0 && area > bestArea) {
          bestArea = area;
          best = { x: x0 + start, y: y - height + 1, w: width, h: height };
        }
      }
      stack.push(i);
    }
  }
  return best;
}

/** Decodes a grid and widens roads that only touch corner to corner (see below). */
function prepareGrid(rows: readonly string[]): string[][] {
  const grid = rows.map(decodeGridRow);
  const H = grid.length;
  const W = grid[0].length;
  const drivable = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !UNDRIVABLE.has(grid[y][x]);
  // Units never squeeze diagonally between two blocked tiles, so a road (or bridge) that only
  // touches corner to corner would be a dead end. Widen it at every such step.
  for (let y = 0; y < H - 1; y++) {
    for (let x = 0; x < W; x++) {
      if (grid[y][x] !== '=') continue;
      for (const dx of [-1, 1]) {
        const nx = x + dx;
        if (nx < 0 || nx >= W || grid[y + 1][nx] !== '=') continue;
        if (!drivable(nx, y) && !drivable(x, y + 1)) grid[y + 1][x] = '=';
      }
    }
  }
  return grid;
}

/** Ground where shells and field works can go. */
const SOFT_GROUND = new Set(['.', ',', 'h']);

/**
 * Turns a peaceful village into a battlefield: hedgerows between the paddies,
 * ruined houses, shell craters thickest along the front between the two bases,
 * and short sandbag lines dug in on the approaches to every capture point.
 * Seeded by the map id, so a map always looks the same.
 */
function dressBattlefield(grid: string[][], id: string, bases: readonly Cell[], points: readonly Cell[]): void {
  const H = grid.length;
  const W = grid[0].length;
  let seed = 7;
  for (const ch of id) seed = (seed * 31 + ch.charCodeAt(0)) >>> 0;
  const rng = new Rng(seed);
  const at = (x: number, y: number) => (x >= 0 && y >= 0 && x < W && y < H ? grid[y][x] : '');
  const nearBase = (x: number, y: number, r: number) => bases.some((b) => Math.abs(b.x - x) <= r && Math.abs(b.y - y) <= r);

  // Hedgerows on the open strips between paddies.
  const hedges: Cell[] = [];
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (at(x, y) !== '.') continue;
      const between = (at(x - 1, y) === ',' && at(x + 1, y) === ',') || (at(x, y - 1) === ',' && at(x, y + 1) === ',');
      if (between && rng.next() < 0.75) hedges.push({ x, y });
    }
  }
  for (const c of hedges) grid[c.y][c.x] = 'h';

  // Ruins: some house edges are only broken walls now.
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      if (at(x, y) !== '#') continue;
      const inner = ['#', 'w'].filter((k) => k === at(x - 1, y)).length + ['#', 'w'].filter((k) => k === at(x + 1, y)).length + ['#', 'w'].filter((k) => k === at(x, y - 1)).length + ['#', 'w'].filter((k) => k === at(x, y + 1)).length;
      if (inner <= 2 && rng.next() < 0.14) grid[y][x] = 'w';
    }
  }

  // Shell craters in barrages: clusters of hits, thickest halfway between the bases.
  const mid = { x: (bases[0].x + bases[1].x) / 2, y: (bases[0].y + bases[1].y) / 2 };
  const span = Math.max(12, Math.hypot(bases[0].x - bases[1].x, bases[0].y - bases[1].y) * 0.3);
  const barrages = Math.round((W * H) / 520);
  for (let n = 0, tries = 0; n < barrages && tries < barrages * 40; tries++) {
    const x = Math.floor(rng.next() * W);
    const y = Math.floor(rng.next() * H);
    if (nearBase(x, y, 8)) continue;
    const d = Math.hypot(x - mid.x, y - mid.y) / span;
    if (rng.next() > 0.15 + 0.85 * Math.exp(-d * d)) continue;
    n++;
    const hits = 4 + Math.floor(rng.next() * 5);
    for (let h = 0; h < hits; h++) {
      const a = rng.next() * Math.PI * 2;
      const r = rng.next() * 3.5;
      const cx = Math.round(x + Math.cos(a) * r);
      const cy = Math.round(y + Math.sin(a) * r);
      if (SOFT_GROUND.has(at(cx, cy)) && !nearBase(cx, cy, 6)) grid[cy][cx] = 'c';
    }
  }

  // Sandbags: a short line facing each base, three tiles out from every point.
  for (const p of points) {
    for (const b of bases) {
      const dx = b.x - p.x;
      const dy = b.y - p.y;
      const len = Math.hypot(dx, dy) || 1;
      const ux = dx / len;
      const uy = dy / len;
      const cx = p.x + ux * 3;
      const cy = p.y + uy * 3;
      for (let k = -1; k <= 1; k++) {
        const x = Math.round(cx - uy * k);
        const y = Math.round(cy + ux * k);
        if (SOFT_GROUND.has(at(x, y)) || at(x, y) === 'c') grid[y][x] = 's';
      }
    }
  }
}

/** Open ground for an HQ. */
function clearBase(grid: string[][], c: Cell): void {
  for (let y = c.y - BASE_CLEAR; y <= c.y + BASE_CLEAR; y++) {
    for (let x = c.x - BASE_CLEAR; x <= c.x + BASE_CLEAR; x++) if (y >= 0 && y < grid.length && x >= 0 && x < grid[0].length) grid[y][x] = '.';
  }
}

/**
 * Make a battlefield fair: the western half is copied onto the eastern half,
 * turned half a circle, so both armies fight over the same ground. A road is
 * laid across the middle so the two halves always join up.
 */
function mirrorGrid(grid: string[][]): void {
  const H = grid.length;
  const W = grid[0].length;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const mx = W - 1 - x;
      const my = H - 1 - y;
      // Copy from the western half (and the top half of a middle column).
      if (x < mx || (x === mx && y < my)) grid[my][mx] = grid[y][x];
    }
  }
  const cy = Math.floor(H / 2);
  for (let x = Math.floor(W / 2) - 4; x <= Math.ceil(W / 2) + 3; x++) {
    for (const y of [cy - 1, cy]) if (x >= 0 && x < W) grid[y][x] = '=';
  }
}

/**
 * Make sure the middle of the map is part of the main drivable area: if it is
 * cut off, lay a road from it to the nearest ground that is, and the same road
 * mirrored on the other side so the map stays fair.
 */
function joinMiddle(grid: string[][]): void {
  const H = grid.length;
  const W = grid[0].length;
  const drivable = (x: number, y: number) => !UNDRIVABLE.has(grid[y][x]);
  // Label the largest drivable area.
  const region = new Int32Array(W * H).fill(-1);
  let biggest = -1;
  let biggestSize = 0;
  for (let s = 0; s < W * H; s++) {
    if (region[s] !== -1 || !drivable(s % W, Math.floor(s / W))) continue;
    const stack = [s];
    region[s] = s;
    let size = 0;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (nx < 0 || ny < 0 || nx >= W || ny >= H || region[ny * W + nx] !== -1 || !drivable(nx, ny)) continue;
        region[ny * W + nx] = s;
        stack.push(ny * W + nx);
      }
    }
    if (size > biggestSize) {
      biggestSize = size;
      biggest = s;
    }
  }
  const cx = Math.floor(W / 2);
  const cy = Math.floor(H / 2);
  if (region[cy * W + cx] === biggest) return;
  // Walk out from the middle over any ground to the nearest tile of the main area.
  const prev = new Int32Array(W * H).fill(-1);
  const queue = [cy * W + cx];
  prev[cy * W + cx] = cy * W + cx;
  let found = -1;
  for (let head = 0; head < queue.length && found < 0; head++) {
    const i = queue[head];
    const x = i % W;
    const y = Math.floor(i / W);
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (nx < 0 || ny < 0 || nx >= W || ny >= H || prev[ny * W + nx] !== -1) continue;
      prev[ny * W + nx] = i;
      if (region[ny * W + nx] === biggest) {
        found = ny * W + nx;
        break;
      }
      queue.push(ny * W + nx);
    }
  }
  for (let i = found; i >= 0 && i !== cy * W + cx; i = prev[i]) {
    const x = i % W;
    const y = Math.floor(i / W);
    grid[y][x] = '=';
    grid[H - 1 - y][W - 1 - x] = '=';
  }
  grid[cy][cx] = '=';
}

function build(src: LuzonMapSource): MapDef {
  const grid = prepareGrid(src.rows);
  tidyHouses(grid);
  mirrorGrid(grid);
  joinMiddle(grid);
  const H = grid.length;
  const W = grid[0].length;
  const mirror = (c: Cell): Cell => ({ x: W - 1 - c.x, y: H - 1 - c.y });
  const drivable = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !UNDRIVABLE.has(grid[y][x]);

  const around = (c: Cell, r: number, test: (ch: string) => boolean) => {
    let n = 0;
    for (let y = c.y - r; y <= c.y + r; y++) for (let x = c.x - r; x <= c.x + r; x++) if (y >= 0 && y < H && x >= 0 && x < W && test(grid[y][x])) n++;
    return n;
  };

  // Bases: one near the west edge and one near the east edge, on solid land, preferring where a road
  // comes in near the middle. The ground around each HQ is cleared so it has room.
  const landAround = (x: number, y: number) => {
    let n = 0;
    for (let yy = y - BASE_CLEAR; yy <= y + BASE_CLEAR; yy++) {
      for (let xx = x - BASE_CLEAR; xx <= x + BASE_CLEAR; xx++) if (yy >= 0 && yy < H && xx >= 0 && xx < W && grid[yy][xx] !== '~') n++;
    }
    return n;
  };
  // Only the largest drivable area counts, so both HQs can reach each other and every point.
  const region = new Int32Array(W * H).fill(-1);
  let biggest = -1;
  let biggestSize = 0;
  for (let start = 0; start < W * H; start++) {
    if (region[start] !== -1 || !drivable(start % W, Math.floor(start / W))) continue;
    const id = start;
    const stack = [start];
    region[start] = id;
    let size = 0;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const x = i % W;
      const y = Math.floor(i / W);
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!drivable(nx, ny) || region[ny * W + nx] !== -1) continue;
        region[ny * W + nx] = id;
        stack.push(ny * W + nx);
      }
    }
    if (size > biggestSize) {
      biggestSize = size;
      biggest = id;
    }
  }
  const westBase = (() => {
    const side = 0;
    let best: Cell = { x: BASE_CLEAR + 2, y: Math.floor(H / 2) };
    let bestScore = Infinity;
    for (let inset = BASE_CLEAR + 2; inset < W / 2 - 12; inset++) {
      const x = side === 0 ? inset : W - 1 - inset;
      for (let y = BASE_CLEAR + 1; y < H - BASE_CLEAR - 1; y++) {
        if (region[y * W + x] !== biggest || landAround(x, y) < (BASE_CLEAR * 2 + 1) ** 2 - 3) continue;
        const road = around({ x, y }, 2, (ch) => ch === '=') > 0;
        const score = inset * 3 + Math.abs(y - H / 2) * 0.6 + (road ? 0 : 12);
        if (score < bestScore) {
          bestScore = score;
          best = { x, y };
        }
      }
    }
    return best;
  })();
  const bases = [westBase, mirror(westBase)];
  for (const b of bases) clearBase(grid, b);

  // Driving distance (in tiles) from each base.
  const distanceFrom = (from: Cell): Float32Array => {
    const d = new Float32Array(W * H).fill(Infinity);
    const queue = [from];
    d[from.y * W + from.x] = 0;
    for (let head = 0; head < queue.length; head++) {
      const { x, y } = queue[head];
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx;
        const ny = y + dy;
        if (!drivable(nx, ny) || d[ny * W + nx] !== Infinity) continue;
        d[ny * W + nx] = d[y * W + x] + 1;
        queue.push({ x: nx, y: ny });
      }
    }
    return d;
  };
  const dA = distanceFrom(bases[0]);
  const dB = distanceFrom(bases[1]);

  const houses = (c: Cell) => around(c, 6, (ch) => ch === '#');
  const bridge = (c: Cell) => (grid[c.y][c.x] === '=' && around(c, 1, (ch) => ch === '~') > 0 ? 1 : 0);
  const chosen: Cell[] = [...bases];
  const spacing = (c: Cell, min: number) => chosen.every((p) => Math.hypot(p.x - c.x, p.y - c.y) >= min);

  // Room to fight around a point: most of the 5×5 block around it must be drivable (no islands or slivers).
  const roomy = (c: Cell) => around(c, 2, (ch) => !UNDRIVABLE.has(ch)) >= 17;

  const pick = (ok: (c: Cell, a: number, b: number) => boolean, score: (c: Cell) => number, min = 13): Cell | null => {
    let best: Cell | null = null;
    let bestScore = -Infinity;
    for (let y = 4; y < H - 4; y++) {
      for (let x = 4; x < W - 4; x++) {
        const a = dA[y * W + x];
        const b = dB[y * W + x];
        if (!Number.isFinite(a) || !Number.isFinite(b)) continue;
        const c = { x, y };
        if (!ok(c, a, b) || !spacing(c, min) || !roomy(c)) continue;
        const s = score(c);
        if (s > bestScore) {
          bestScore = s;
          best = c;
        }
      }
    }
    if (best) chosen.push(best);
    return best;
  };

  const points: MapPointDef[] = [];
  const add = (c: Cell | null, kind: PointKind, name: string) => {
    if (c) points.push({ x: c.x + 0.5, y: c.y + 0.5, kind, name });
  };

  // Victory points. The heart of the village is the same distance from both bases;
  // the other two are a mirrored pair, one on each side of it.
  // The very middle of a mirrored map is exactly as far from both bases.
  const heart: Cell = { x: Math.floor(W / 2), y: Math.floor(H / 2) };
  chosen.push(heart);
  points.push({ x: W / 2, y: H / 2, kind: 'victory', name: src.names.victory[0] });
  const pair = (score: (c: Cell) => number, share: [number, number], min: number): [Cell, Cell] | null => {
    for (const tol of [0.05, 0.1, 0.18]) {
      const c = pick((p, a, b) => Math.abs(a / (a + b) - share[0]) < tol && Math.hypot(mirror(p).x - p.x, mirror(p).y - p.y) >= min, score, min);
      if (!c) continue;
      const m = mirror(c);
      chosen.push(m);
      return [c, m];
    }
    return null;
  };
  const crossingScore = (p: Cell) => bridge(p) * 20 + houses(p);
  const vpPair = pair(src.bridge ? crossingScore : houses, [0.47, 0.53], 16) ?? pair(houses, [0.4, 0.6], 12);
  if (vpPair) {
    add(vpPair[0], 'victory', src.bridge && bridge(vpPair[0]) ? src.bridge : src.names.victory[1]);
    add(vpPair[1], 'victory', src.names.victory[2]);
  }

  // Resources: each side gets munitions and fuel at exactly mirrored places.
  (['munitions', 'fuel'] as const).forEach((kind) => {
    const score = kind === 'munitions' ? houses : (p: Cell) => around(p, 3, (ch) => ch === '=') - houses(p) * 0.2;
    const res = pair(score, [0.3, 0.7], 12) ?? pair(score, [0.36, 0.64], 9);
    if (!res) return;
    add(res[0], kind, src.names[kind][0]);
    add(res[1], kind, src.names[kind][1]);
  });

  dressBattlefield(grid, src.id, bases, points.map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) })));
  // Dress both halves alike, so cover and craters are fair too.
  mirrorGrid(grid);
  joinMiddle(grid);
  for (const b of bases) clearBase(grid, b);
  const features: MapFeature[] = [{ kind: 'grid', rows: grid.map(encodeGridRow) }];
  return { id: src.id, name: src.name, description: src.description, width: W, height: H, bases: [bases[0], bases[1]], points, features };
}

const SOURCES: LuzonMapSource[] = [
  {
    id: 'calumpit',
    name: 'Calumpit',
    description: 'A river town on the Pampanga, two bridges over a winding river, paddies all around. Whoever holds the crossings holds the road to Bataan.',
    rows: CALUMPIT_ROWS,
    bridge: 'Calumpit Bridge',
    names: {
      victory: ['Poblacion', 'Barrio San Jose', 'Sitio Longos'],
      munitions: ['Bodega', 'Rice Mill'],
      fuel: ['Motor Pool', 'Gasolinahan'],
    },
  },
  {
    id: 'plaridel',
    name: 'Plaridel',
    description: 'A market town at a crossroads on the road north of Manila, ringed by rice paddies. The plaza and the church are the prize.',
    rows: PLARIDEL_ROWS,
    names: {
      victory: ['Plaza', 'Simbahan', 'Barrio Agnaya'],
      munitions: ['Bodega', 'Rice Mill'],
      fuel: ['Motor Pool', 'Gasolinahan'],
    },
  },
  {
    id: 'pilar',
    name: 'Pilar',
    description: 'A quiet barrio on the Bataan line: groves along the river and a single bridge across it.',
    rows: PILAR_ROWS,
    bridge: 'Pilar Bridge',
    names: {
      victory: ['Poblacion', 'Kapilya', 'Sitio Wawa'],
      munitions: ['Kamalig', 'Bodega'],
      fuel: ['Garahe', 'Motor Pool'],
    },
  },
  {
    id: 'orani',
    name: 'Orani',
    description: 'A fishing town where a river meets Manila Bay. The coastal highway runs straight through the market.',
    rows: ORANI_ROWS,
    bridge: 'Orani Bridge',
    names: {
      victory: ['Palengke', 'Munisipyo', 'Pantalan'],
      munitions: ['Bodega', 'Camarin'],
      fuel: ['Gasolinahan', 'Bus Depot'],
    },
  },
  {
    id: 'porac',
    name: 'Porac',
    description: 'A village at the foot of the Zambales mountains, hemmed in by jungle. Few roads, and every tree line hides an ambush.',
    rows: PORAC_ROWS,
    names: {
      victory: ['Poblacion', 'Kapilya', 'Sitio Manibaug'],
      munitions: ['Kamalig', 'Bodega'],
      fuel: ['Motor Pool', 'Garahe'],
    },
  },
  {
    id: 'abucay',
    name: 'Abucay',
    description: 'Houses strung along the Bataan shore, paddies inland and the sea at their backs.',
    rows: ABUCAY_ROWS,
    names: {
      victory: ['Simbahan', 'Poblacion', 'Sitio Bangkal'],
      munitions: ['Bodega', 'Kamalig'],
      fuel: ['Pantalan', 'Gasolinahan'],
    },
  },
  {
    id: 'san-fernando',
    name: 'San Fernando',
    description: 'The capital of Pampanga: a big town of streets, yards and stone houses, taken block by block.',
    rows: SAN_FERNANDO_ROWS,
    names: {
      victory: ['Plaza', 'Munisipyo', 'Estacion'],
      munitions: ['Sugar Central', 'Bodega'],
      fuel: ['Motor Pool', 'Bus Depot'],
    },
  },
  {
    id: 'dinalupihan',
    name: 'Dinalupihan',
    description: 'The gateway to Bataan: a clearing cut into thick jungle at the end of the road.',
    rows: DINALUPIHAN_ROWS,
    names: {
      victory: ['Poblacion', 'Kapilya', 'Sitio Pita'],
      munitions: ['Kamalig', 'Bodega'],
      fuel: ['Garahe', 'Motor Pool'],
    },
  },
  {
    id: 'hermosa',
    name: 'Hermosa',
    description: 'A small barrio on a jungle river. One crossing, heavy cover and little room to manoeuvre.',
    rows: HERMOSA_ROWS,
    bridge: 'Hermosa Bridge',
    names: {
      victory: ['Poblacion', 'Kapilya', 'Sitio Mabiga'],
      munitions: ['Bodega', 'Kamalig'],
      fuel: ['Motor Pool', 'Garahe'],
    },
  },
  {
    id: 'guagua',
    name: 'Guagua',
    description: 'Two rivers meet among the rice fields and the highway crosses both. Hold the crossings.',
    rows: GUAGUA_ROWS,
    bridge: 'Guagua Bridge',
    names: {
      victory: ['Poblacion', 'Simbahan', 'Barrio San Roque'],
      munitions: ['Rice Mill', 'Bodega'],
      fuel: ['Gasolinahan', 'Motor Pool'],
    },
  },
  {
    id: 'lingayen',
    name: 'Lingayen',
    description: 'The gulf town where the landings came ashore: close-packed streets between the beach and the highway.',
    rows: LINGAYEN_ROWS,
    names: {
      victory: ['Plaza', 'Capitolio', 'Barrio Libsong'],
      munitions: ['Bodega', 'Camarin'],
      fuel: ['Pantalan', 'Gasolinahan'],
    },
  },
  {
    id: 'baliuag',
    name: 'Baliuag',
    description: 'A crowded river town at a crossroads, the Angat flowing through its heart.',
    rows: BALIUAG_ROWS,
    bridge: 'Baliuag Bridge',
    names: {
      victory: ['Palengke', 'Simbahan', 'Barrio Santa Cruz'],
      munitions: ['Bodega', 'Rice Mill'],
      fuel: ['Bus Depot', 'Gasolinahan'],
    },
  },
  {
    id: 'lubao',
    name: 'Lubao',
    description: 'Open sugar and rice country along the highway. Long sight lines and very little cover.',
    rows: LUBAO_ROWS,
    names: {
      victory: ['Hacienda', 'Kapilya', 'Sitio Santa Maria'],
      munitions: ['Sugar Central', 'Kamalig'],
      fuel: ['Motor Pool', 'Gasolinahan'],
    },
  },
];

export const LUZON_MAPS: readonly MapDef[] = SOURCES.map(build);

/** A mission map: a converted grid with hand-placed bases and points (tile coordinates). */
export interface MissionMapSource {
  id: string;
  name: string;
  description: string;
  rows: readonly string[];
  bases: readonly [Cell, Cell];
  points: readonly MapPointDef[];
  /** Ground cut into the grid, such as a gate through a wall. */
  carve?: readonly { x: number; y: number; w: number; h: number; tile: string }[];
}

/**
 * Builds a mission map. Bases are cleared for their HQs, and each point is moved
 * to the nearest spot tanks can reach from the first base, so none ends up inside
 * a house or on the wrong side of a wall.
 */
export function missionMap(src: MissionMapSource): MapDef {
  const grid = prepareGrid(src.rows);
  const H = grid.length;
  const W = grid[0].length;
  for (const c of src.carve ?? []) {
    for (let y = c.y; y < c.y + c.h; y++) for (let x = c.x; x < c.x + c.w; x++) if (y >= 0 && y < H && x >= 0 && x < W) grid[y][x] = c.tile;
  }
  for (const b of src.bases) clearBase(grid, b);
  const drivable = (x: number, y: number) => x >= 0 && y >= 0 && x < W && y < H && !UNDRIVABLE.has(grid[y][x]);
  const reach = new Uint8Array(W * H);
  const queue: Cell[] = [src.bases[0]];
  reach[src.bases[0].y * W + src.bases[0].x] = 1;
  for (let head = 0; head < queue.length; head++) {
    const { x, y } = queue[head];
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx;
      const ny = y + dy;
      if (!drivable(nx, ny) || reach[ny * W + nx]) continue;
      reach[ny * W + nx] = 1;
      queue.push({ x: nx, y: ny });
    }
  }
  const snap = (p: MapPointDef): MapPointDef => {
    let best = { x: Math.floor(p.x), y: Math.floor(p.y) };
    let bestD = Infinity;
    for (let y = 0; y < H; y++) {
      for (let x = 0; x < W; x++) {
        if (!reach[y * W + x]) continue;
        const d = Math.hypot(x + 0.5 - p.x, y + 0.5 - p.y);
        if (d < bestD) {
          bestD = d;
          best = { x, y };
        }
      }
    }
    return { ...p, x: best.x + 0.5, y: best.y + 0.5 };
  };
  const points = src.points.map(snap);
  dressBattlefield(grid, src.id, src.bases, points.map((p) => ({ x: Math.floor(p.x), y: Math.floor(p.y) })));
  return {
    id: src.id,
    name: src.name,
    description: src.description,
    width: W,
    height: H,
    bases: [src.bases[0], src.bases[1]],
    points,
    features: [{ kind: 'grid', rows: grid.map(encodeGridRow) }],
  };
}
