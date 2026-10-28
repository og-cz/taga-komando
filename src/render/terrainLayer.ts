import { TILE } from '../data/balance';
import { T } from '../data/terrain';
import { hash2 } from '../core/rng';
import type { GameMap } from '../sim/grid';

const SCALE = 2;
const PX = TILE * SCALE;

/** How far past the map edge the land is drawn (world units). */
const SURROUND_MARGIN = 900;
/** Resolution of the surround, in canvas pixels per world unit: it is blurred anyway. */
const SURROUND_SCALE = 0.5;

/** Light falls from the top-left: shadows reach this far to the bottom-right per pixel of height. */
const SHADOW = 0.72;
const SHADOW_FILL = 'rgba(8,10,5,0.52)';

type RGB = [number, number, number];

/** Ground colours the terrain is blended from. */
const GRASS: RGB = [64, 82, 40];
const DRY: RGB = [102, 96, 56];
const JUNGLE_FLOOR: RGB = [32, 46, 24];
const DIRT: RGB = [146, 122, 86];
const MUD: RGB = [68, 54, 36];
const PADDY: RGB = [58, 80, 68];
const WATER: RGB = [28, 56, 68];
const STONE: RGB = [118, 112, 100];
const YARD: RGB = [86, 74, 52];

const GROUND: Record<number, RGB> = {
  [T.Open]: GRASS,
  [T.Road]: DIRT,
  [T.Paddy]: PADDY,
  [T.Hedge]: GRASS,
  [T.Crater]: MUD,
  [T.Sandbag]: MUD,
  [T.Wall]: GRASS,
  [T.Building]: YARD,
  [T.Jungle]: JUNGLE_FLOOR,
  [T.Water]: WATER,
  [T.Rampart]: STONE,
  [T.Wire]: GRASS,
  [T.TankTrap]: GRASS,
  [T.Emplacement]: YARD,
};

/** Smooth value noise in [0, 1]. */
function noise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const xf = x - xi;
  const yf = y - yi;
  const u = xf * xf * (3 - 2 * xf);
  const v = yf * yf * (3 - 2 * yf);
  const a = hash2(xi, yi, seed);
  const b = hash2(xi + 1, yi, seed);
  const c = hash2(xi, yi + 1, seed);
  const d = hash2(xi + 1, yi + 1, seed);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}

const smooth = (e0: number, e1: number, x: number) => {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
};

function rgb(c: RGB, k = 1, a = 1): string {
  return a === 1 ? `rgb(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)})` : `rgba(${Math.round(c[0] * k)},${Math.round(c[1] * k)},${Math.round(c[2] * k)},${a})`;
}

/** Roofing: Spanish tile, nipa thatch or rusted corrugated iron. */
const ROOFS: { base: RGB; wall: RGB }[] = [
  { base: [168, 84, 48], wall: [196, 182, 150] },
  { base: [150, 128, 78], wall: [128, 98, 60] },
  { base: [112, 100, 88], wall: [92, 76, 58] },
];

export interface Tree {
  x: number;
  y: number;
  r: number;
  kind: 'palm' | 'broad' | 'banana';
  turn: number;
  seed: number;
}

/**
 * The battlefield, pre-rendered at 2px per world unit with fake depth: ground
 * blended from noise, raised walls and roofs lit from the top-left, and every
 * tall thing casting a shadow to the bottom-right. Tree canopies sit on a layer
 * of their own, drawn above the soldiers. Tiles that change (craters, crushed
 * hedges, new defenses) are repainted together with their surroundings.
 */
export class TerrainLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  /** Tree crowns, drawn over the units. */
  readonly canopy: HTMLCanvasElement;
  private readonly cctx: CanvasRenderingContext2D;
  private surround: HTMLCanvasElement | null = null;
  /** How far past the map edge the surround reaches (world units). */
  static readonly SURROUND_MARGIN = SURROUND_MARGIN;

  /** The land beyond the battlefield, built on first use. */
  surroundCanvas(): HTMLCanvasElement {
    this.surround ??= this.buildSurround();
    return this.surround;
  }
  private roofLabel = new Int32Array(0);

  /**
   * `flat3d`: paint only what lies flat on the ground (soil, roads, paddies,
   * craters) plus roofing colour, for the 3D battlefield to lay over its terrain
   * and roofs; walls, props, trees, shadows and light come from the 3D scene.
   */
  constructor(
    private readonly map: GameMap,
    readonly flat3d = false,
  ) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = map.w * PX;
    this.canvas.height = map.h * PX;
    this.ctx = this.canvas.getContext('2d')!;
    this.canopy = document.createElement('canvas');
    this.canopy.width = flat3d ? 1 : map.w * PX;
    this.canopy.height = flat3d ? 1 : map.h * PX;
    this.cctx = this.canopy.getContext('2d')!;
    this.paint(0, 0, map.w - 1, map.h - 1);
  }

  sync(): void {
    const changes = this.map.changes;
    if (changes.length === 0) return;
    let x0 = Infinity;
    let y0 = Infinity;
    let x1 = -Infinity;
    let y1 = -Infinity;
    for (const i of changes) {
      const tx = i % this.map.w;
      const ty = Math.floor(i / this.map.w);
      x0 = Math.min(x0, tx);
      y0 = Math.min(y0, ty);
      x1 = Math.max(x1, tx);
      y1 = Math.max(y1, ty);
    }
    changes.length = 0;
    // Shadows and roofs reach a couple of tiles; repaint that much around the change.
    this.paint(Math.max(0, x0 - 2), Math.max(0, y0 - 2), Math.min(this.map.w - 1, x1 + 2), Math.min(this.map.h - 1, y1 + 2));
  }

  /**
   * The land beyond the edge of the battlefield: the map's own terrain carried
   * on past the edge (mirrored, so it joins without a seam), blurred, faded and
   * darkening with distance, so it reads as country you cannot enter. Fills the
   * visible world rectangle; call before draw().
   */
  drawSurround(ctx: CanvasRenderingContext2D, x0: number, y0: number, x1: number, y1: number): void {
    const w = this.map.pixelWidth;
    const h = this.map.pixelHeight;
    if (x0 >= 0 && y0 >= 0 && x1 <= w && y1 <= h) return;
    this.surround ??= this.buildSurround();
    ctx.fillStyle = '#0c0f0b';
    ctx.fillRect(x0, y0, x1 - x0, y1 - y0);
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.surround, -SURROUND_MARGIN, -SURROUND_MARGIN, w + SURROUND_MARGIN * 2, h + SURROUND_MARGIN * 2);
  }

  private buildSurround(): HTMLCanvasElement {
    const w = this.map.pixelWidth;
    const h = this.map.pixelHeight;
    const m = SURROUND_MARGIN;
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil((w + m * 2) * SURROUND_SCALE);
    canvas.height = Math.ceil((h + m * 2) * SURROUND_SCALE);
    const c = canvas.getContext('2d')!;
    const world = () => c.setTransform(SURROUND_SCALE, 0, 0, SURROUND_SCALE, m * SURROUND_SCALE, m * SURROUND_SCALE);
    c.filter = 'blur(3px) saturate(0.35) brightness(0.3) sepia(0.2)';
    for (const i of [-1, 0, 1]) {
      for (const j of [-1, 0, 1]) {
        if (i === 0 && j === 0) continue;
        world();
        // Mirror the map across the edge it borders.
        c.translate(i === 1 ? 2 * w : 0, j === 1 ? 2 * h : 0);
        c.scale(i === 0 ? 1 : -1, j === 0 ? 1 : -1);
        c.drawImage(this.canvas, 0, 0, w, h);
        c.drawImage(this.canopy, 0, 0, w, h);
      }
    }
    c.filter = 'none';
    world();
    // Darker the further from the battlefield, like haze over distant country.
    const fade = (gx0: number, gy0: number, gx1: number, gy1: number, rx: number, ry: number, rw: number, rh: number) => {
      const g = c.createLinearGradient(gx0, gy0, gx1, gy1);
      g.addColorStop(0, 'rgba(5,6,5,0.62)');
      g.addColorStop(0.2, 'rgba(5,6,5,0.85)');
      g.addColorStop(1, 'rgba(5,6,5,0.98)');
      c.fillStyle = g;
      c.fillRect(rx, ry, rw, rh);
    };
    fade(0, 0, -m, 0, -m, -m, m, h + 2 * m);
    fade(w, 0, w + m, 0, w, -m, m, h + 2 * m);
    fade(0, 0, 0, -m, 0, -m, w, m);
    fade(0, h, 0, h + m, 0, h, w, m);
    // A soft shadow line where the battlefield ends.
    c.strokeStyle = 'rgba(0,0,0,0.5)';
    c.lineWidth = 6;
    c.strokeRect(-3, -3, w + 6, h + 6);
    return canvas;
  }

  draw(ctx: CanvasRenderingContext2D): void {
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.canvas, 0, 0, this.map.pixelWidth, this.map.pixelHeight);
  }

  /** Tree crowns over everything on the ground, a little see-through so no one is lost beneath them. */
  drawCanopy(ctx: CanvasRenderingContext2D, alpha = 0.78): void {
    ctx.globalAlpha = alpha;
    ctx.drawImage(this.canopy, 0, 0, this.map.pixelWidth, this.map.pixelHeight);
    ctx.globalAlpha = 1;
  }

  // ─── Painting ──────────────────────────────────────────────────

  private t(tx: number, ty: number): number {
    const m = this.map;
    return m.get(Math.max(0, Math.min(m.w - 1, tx)), Math.max(0, Math.min(m.h - 1, ty)));
  }

  /** Repaint tiles tx0..tx1 × ty0..ty1 (inclusive) on both layers. */
  private paint(tx0: number, ty0: number, tx1: number, ty1: number): void {
    const c = this.ctx;
    const x = tx0 * PX;
    const y = ty0 * PX;
    const w = (tx1 - tx0 + 1) * PX;
    const h = (ty1 - ty0 + 1) * PX;
    this.labelRoofs();
    c.save();
    c.beginPath();
    c.rect(x, y, w, h);
    c.clip();
    this.paintGround(tx0, ty0, tx1, ty1);
    // Things drawn from tiles a little outside the region still reach into it.
    const ax0 = Math.max(0, tx0 - 2);
    const ay0 = Math.max(0, ty0 - 2);
    const ax1 = Math.min(this.map.w - 1, tx1 + 1);
    const ay1 = Math.min(this.map.h - 1, ty1 + 1);
    for (let ty = ay0; ty <= ay1; ty++) for (let tx = ax0; tx <= ax1; tx++) this.groundDetail(tx, ty);
    if (this.flat3d) this.paintContact(ax0, ay0, ax1, ay1);
    else {
      this.paintShadows(ax0, ay0, ax1, ay1);
      for (let ty = ay0; ty <= ay1; ty++) for (let tx = ax0; tx <= ax1; tx++) this.lowObject(tx, ty);
    }
    this.paintRoofs(tx0, ty0, tx1, ty1);
    c.restore();

    if (this.flat3d) return;
    const cc = this.cctx;
    cc.save();
    cc.clearRect(x, y, w, h);
    cc.beginPath();
    cc.rect(x, y, w, h);
    cc.clip();
    for (let ty = ay0; ty <= ay1; ty++) for (let tx = ax0; tx <= ax1; tx++) for (const tree of this.treesOf(tx, ty)) this.drawTree(cc, tree);
    cc.restore();
  }

  /** Ground colour per world unit: neighbouring terrain blended through warped noise, then mottled. */
  private paintGround(tx0: number, ty0: number, tx1: number, ty1: number): void {
    const gw = (tx1 - tx0 + 1) * TILE;
    const gh = (ty1 - ty0 + 1) * TILE;
    const img = new ImageData(gw, gh);
    const d = img.data;
    const ox = tx0 * TILE;
    const oy = ty0 * TILE;
    for (let j = 0; j < gh; j++) {
      const wy = oy + j + 0.5;
      for (let i = 0; i < gw; i++) {
        const wx = ox + i + 0.5;
        // Warp the lookup so edges between terrain wander instead of following the grid.
        const u = wx / TILE + (noise(wx / 13, wy / 13, 1) - 0.5) * 0.7 - 0.5;
        const v = wy / TILE + (noise(wx / 13, wy / 13, 2) - 0.5) * 0.7 - 0.5;
        const ix = Math.floor(u);
        const iy = Math.floor(v);
        const fx = smooth(0.15, 0.85, u - ix);
        const fy = smooth(0.15, 0.85, v - iy);
        // Roads are painted below as smooth bands, so here they count as the grass they run through.
        const ground = (x: number, y: number) => {
          const tt = this.t(x, y);
          return tt === T.Road ? GRASS : GROUND[tt];
        };
        const a = ground(ix, iy);
        const b = ground(ix + 1, iy);
        const cc = ground(ix, iy + 1);
        const dd = ground(ix + 1, iy + 1);
        const road = this.roadWeight(wx + (noise(wx / 9, wy / 9, 7) - 0.5) * 2.2, wy + (noise(wx / 9, wy / 9, 8) - 0.5) * 2.2);
        const fine = noise(wx / 2.6, wy / 2.6, 3) * 0.55 + noise(wx / 0.9, wy / 0.9, 4) * 0.45;
        const large = noise(wx / 46, wy / 46, 5);
        const k = 0.8 + fine * 0.38;
        const dry = smooth(0.52, 0.8, large) * 0.6;
        const dark = smooth(0.32, 0.08, large) * 0.22;
        // Wet, churned patches of mud.
        const wet = smooth(0.74, 0.92, noise(wx / 21, wy / 21, 6)) * 0.4;
        const p = (j * gw + i) * 4;
        for (let ch = 0; ch < 3; ch++) {
          const top = a[ch] + (b[ch] - a[ch]) * fx;
          const bot = cc[ch] + (dd[ch] - cc[ch]) * fx;
          let val = (top + (bot - top) * fy) * k;
          val = val + (DRY[ch] * k - val) * dry * (ch === 2 ? 0.6 : 1);
          val = val + (MUD[ch] * k - val) * wet;
          // Packed earth of the road, a little darker down the wheel ruts at its middle.
          val = val + (DIRT[ch] * k * (0.92 + 0.08 * fine) - val) * road;
          d[p + ch] = val * (1 - dark * (1 - road));
        }
        d[p + 3] = 255;
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = gw;
    tmp.height = gh;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    this.ctx.imageSmoothingEnabled = true;
    this.ctx.drawImage(tmp, tx0 * PX, ty0 * PX, gw * SCALE, gh * SCALE);
  }

  /**
   * How much of a road lies under a point, 0..1: the road runs as a smooth
   * band along the line joining neighbouring road tiles (diagonals included),
   * so a road drawn as a staircase of tiles becomes a clean diagonal track.
   */
  private roadWeight(wx: number, wy: number): number {
    const tx = Math.floor(wx / TILE);
    const ty = Math.floor(wy / TILE);
    let best = Infinity;
    const isRoad = (x: number, y: number) => this.t(x, y) === T.Road;
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        const ax = tx + dx;
        const ay = ty + dy;
        if (!isRoad(ax, ay)) continue;
        const cx = (ax + 0.5) * TILE;
        const cy = (ay + 0.5) * TILE;
        best = Math.min(best, Math.hypot(wx - cx, wy - cy));
        // Segments to the next road tile on (right, down and both diagonals).
        for (const [nx, ny] of [[1, 0], [0, 1], [1, 1], [1, -1]]) {
          if (!isRoad(ax + nx, ay + ny)) continue;
          // Skip a diagonal when the corner is already joined by a straight step.
          if (nx !== 0 && ny !== 0 && (isRoad(ax + nx, ay) || isRoad(ax, ay + ny))) continue;
          const bx = cx + nx * TILE;
          const by = cy + ny * TILE;
          const vx = bx - cx;
          const vy = by - cy;
          const l2 = vx * vx + vy * vy;
          const s = Math.max(0, Math.min(1, ((wx - cx) * vx + (wy - cy) * vy) / l2));
          best = Math.min(best, Math.hypot(wx - (cx + vx * s), wy - (cy + vy * s)));
        }
      }
    }
    return smooth(TILE * 0.78, TILE * 0.5, best);
  }

  /** Flat things in the ground: ruts and puddles, paddy rows, craters, ripples and banks. */
  private groundDetail(tx: number, ty: number): void {
    const c = this.ctx;
    const t = this.map.get(tx, ty);
    const x = tx * PX;
    const y = ty * PX;
    const hh = (i: number) => hash2(tx, ty, i);
    const same = (dx: number, dy: number) => this.t(tx + dx, ty + dy) === t;
    switch (t) {
      case T.Road: {
        const along = same(-1, 0) || same(1, 0) ? 'h' : 'v';
        c.strokeStyle = 'rgba(52,40,26,0.35)';
        c.lineWidth = 2.4;
        c.beginPath();
        for (const off of [-6, 6]) {
          if (along === 'h') {
            c.moveTo(x - 2, y + PX / 2 + off + (hh(1) - 0.5) * 2);
            c.lineTo(x + PX + 2, y + PX / 2 + off + (hh(2) - 0.5) * 2);
          } else {
            c.moveTo(x + PX / 2 + off + (hh(1) - 0.5) * 2, y - 2);
            c.lineTo(x + PX / 2 + off + (hh(2) - 0.5) * 2, y + PX + 2);
          }
        }
        c.stroke();
        c.fillStyle = 'rgba(70,56,36,0.25)';
        for (let i = 0; i < 6; i++) c.fillRect(x + hh(i + 10) * PX, y + hh(i + 20) * PX, 2, 2);
        if (hh(30) < 0.05) {
          // A puddle catching the sky.
          const px = x + 8 + hh(31) * 16;
          const py = y + 8 + hh(32) * 16;
          c.fillStyle = 'rgba(34,40,38,0.7)';
          c.beginPath();
          c.ellipse(px, py, 6 + hh(33) * 4, 3 + hh(34) * 2, hh(35) * 3, 0, Math.PI * 2);
          c.fill();
          c.fillStyle = 'rgba(190,200,190,0.18)';
          c.beginPath();
          c.ellipse(px - 2, py - 1, 3, 1, hh(35) * 3, 0, Math.PI * 2);
          c.fill();
        }
        break;
      }
      case T.Paddy: {
        c.fillStyle = 'rgba(120,150,150,0.16)';
        c.fillRect(x, y, PX, PX);
        // Rows of rice seedlings.
        c.fillStyle = 'rgba(126,168,74,0.75)';
        for (let ry = 4; ry < PX; ry += 6) {
          for (let rx = 2 + (ry % 12 === 4 ? 0 : 3); rx < PX; rx += 6) {
            c.fillRect(x + rx, y + ry, 1.6, 2.6);
            c.fillRect(x + rx + 1.6, y + ry + 0.6, 1.2, 1.8);
          }
        }
        // Raised dikes (pilapil) along the edges with dry land.
        c.fillStyle = '#6a5636';
        if (!same(0, -1)) c.fillRect(x, y, PX, 3);
        if (!same(-1, 0)) c.fillRect(x, y, 3, PX);
        c.fillStyle = '#4a3c25';
        if (!same(0, 1)) c.fillRect(x, y + PX - 3, PX, 3);
        if (!same(1, 0)) c.fillRect(x + PX - 3, y, 3, PX);
        break;
      }
      case T.Crater: {
        const cx = x + PX / 2;
        const cy = y + PX / 2;
        const r = PX * 0.44;
        const g = c.createRadialGradient(cx + 2, cy + 2, 1, cx, cy, r);
        g.addColorStop(0, 'rgba(26,20,14,0.9)');
        g.addColorStop(0.55, 'rgba(58,44,28,0.85)');
        g.addColorStop(1, 'rgba(58,44,28,0)');
        c.fillStyle = g;
        c.beginPath();
        c.arc(cx, cy, r, 0, Math.PI * 2);
        c.fill();
        // Lit far rim, thrown-up earth around it.
        c.strokeStyle = 'rgba(150,124,86,0.55)';
        c.lineWidth = 2;
        c.beginPath();
        c.arc(cx, cy, r * 0.62, -0.2, Math.PI * 0.75);
        c.stroke();
        c.fillStyle = 'rgba(70,54,34,0.7)';
        for (let i = 0; i < 8; i++) {
          const a = hh(i) * Math.PI * 2;
          const rr = r * (0.8 + hh(i + 9) * 0.35);
          c.fillRect(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr, 2 + hh(i + 3) * 2, 2);
        }
        break;
      }
      case T.Water: {
        c.strokeStyle = 'rgba(180,215,225,0.14)';
        c.lineWidth = 1.2;
        for (let i = 0; i < 2; i++) {
          const wy = y + 8 + hh(i) * (PX - 16);
          c.beginPath();
          c.moveTo(x + 3, wy);
          c.quadraticCurveTo(x + PX / 2, wy - 3, x + PX - 3, wy);
          c.stroke();
        }
        // Muddy banks and a line of foam where the water meets them.
        const bank = (bx: number, by: number, bw: number, bh: number) => {
          c.fillStyle = 'rgba(96,80,52,0.8)';
          c.fillRect(bx, by, bw, bh);
        };
        if (!same(0, -1)) bank(x, y, PX, 4);
        if (!same(0, 1)) bank(x, y + PX - 3, PX, 3);
        if (!same(-1, 0)) bank(x, y, 4, PX);
        if (!same(1, 0)) bank(x + PX - 3, y, 3, PX);
        c.strokeStyle = 'rgba(220,230,220,0.3)';
        c.lineWidth = 1;
        c.beginPath();
        if (!same(0, -1)) (c.moveTo(x, y + 5.5), c.lineTo(x + PX, y + 5.5));
        if (!same(-1, 0)) (c.moveTo(x + 5.5, y), c.lineTo(x + 5.5, y + PX));
        c.stroke();
        break;
      }
      case T.Jungle:
        // Undergrowth: ferns and fallen leaves on the dark floor.
        for (let i = 0; i < 6; i++) {
          c.fillStyle = i % 2 ? 'rgba(66,92,40,0.55)' : 'rgba(30,44,22,0.5)';
          c.beginPath();
          c.ellipse(x + hh(i) * PX, y + hh(i + 7) * PX, 3 + hh(i + 3) * 4, 2 + hh(i + 4) * 2, hh(i + 5) * 3, 0, Math.PI * 2);
          c.fill();
        }
        break;
      case T.Building:
      case T.Emplacement:
        c.fillStyle = 'rgba(60,50,34,0.25)';
        for (let i = 0; i < 4; i++) c.fillRect(x + hh(i) * PX, y + hh(i + 4) * PX, 2, 2);
        break;
      default:
        if (t === T.Open && hh(50) < 0.25) {
          // Tufts of grass.
          c.strokeStyle = 'rgba(132,150,72,0.5)';
          c.lineWidth = 1;
          c.beginPath();
          const gx = x + hh(51) * PX;
          const gy = y + hh(52) * PX;
          for (let k = -2; k <= 2; k++) {
            c.moveTo(gx + k * 1.2, gy + 3);
            c.lineTo(gx + k * 2.2, gy - 2);
          }
          c.stroke();
        }
    }
  }

  /** Height in canvas pixels of what stands on a tile, for its shadow. */
  private heightOf(t: number): number {
    switch (t) {
      case T.Building:
        return 22;
      case T.Rampart:
        return 16;
      case T.Wall:
        return 7;
      case T.Sandbag:
        return 6;
      case T.Hedge:
        return 7;
      case T.TankTrap:
        return 5;
      default:
        return 0;
    }
  }

  /** Every tall thing's shadow, cast to the bottom-right in one soft pass. */
  private paintShadows(tx0: number, ty0: number, tx1: number, ty1: number): void {
    const c = this.ctx;
    const path = new Path2D();
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.map.get(tx, ty);
        const h = this.heightOf(t);
        const x = tx * PX;
        const y = ty * PX;
        if (h > 0) {
          const s = h * SHADOW;
          const inset = t === T.Building || t === T.Rampart ? 0 : t === T.Hedge ? 4 : 7;
          path.rect(x + inset + s, y + inset + s, PX - inset * 2, PX - inset * 2);
        }
        for (const tree of this.treesOf(tx, ty)) {
          const s = (tree.kind === 'banana' ? 8 : 20) * SHADOW;
          path.moveTo(tree.x + s + tree.r * 0.85, tree.y + s);
          path.arc(tree.x + s, tree.y + s, tree.r * 0.85, 0, Math.PI * 2);
        }
      }
    }
    c.save();
    c.filter = 'blur(3px)';
    c.fillStyle = SHADOW_FILL;
    c.fill(path);
    c.restore();
  }

  /** Low things standing on the ground: hedges, sandbags, walls, wire, tank traps. */
  private lowObject(tx: number, ty: number): void {
    const c = this.ctx;
    const t = this.map.get(tx, ty);
    const x = tx * PX;
    const y = ty * PX;
    const hh = (i: number) => hash2(tx, ty, i);
    const same = (dx: number, dy: number) => this.t(tx + dx, ty + dy) === t;
    switch (t) {
      case T.Hedge:
        for (let i = 0; i < 7; i++) {
          const bx = x + 4 + hh(i) * (PX - 8);
          const by = y + 4 + hh(i + 5) * (PX - 8);
          const r = 5 + hh(i + 10) * 4;
          const g = c.createRadialGradient(bx - r * 0.4, by - r * 0.4, 0.5, bx, by, r);
          g.addColorStop(0, '#58783a');
          g.addColorStop(0.55, '#2f4b20');
          g.addColorStop(1, '#16260e');
          c.fillStyle = g;
          c.beginPath();
          c.arc(bx, by, r, 0, Math.PI * 2);
          c.fill();
        }
        // Leaves catching the light.
        c.fillStyle = 'rgba(140,170,90,0.35)';
        for (let i = 0; i < 10; i++) c.fillRect(x + 3 + hh(i + 20) * (PX - 6), y + 3 + hh(i + 30) * (PX - 6), 1.6, 1);
        break;
      case T.Sandbag: {
        const horizontal = same(-1, 0) || same(1, 0) || !(same(0, -1) || same(0, 1));
        for (let row = 0; row < 2; row++) {
          for (let i = 0; i < 3; i++) {
            const shift = row ? PX / 6 : 0;
            const bx = horizontal ? x + i * (PX / 3) + shift - (row ? 0 : 0) : x + PX / 2 - 8 + row * 7;
            const by = horizontal ? y + PX / 2 - 8 + row * 7 : y + i * (PX / 3) + shift;
            const bw = horizontal ? PX / 3 - 1 : 9;
            const bh = horizontal ? 9 : PX / 3 - 1;
            const g = c.createLinearGradient(bx, by, bx + bw, by + bh);
            g.addColorStop(0, '#d1bd8c');
            g.addColorStop(1, '#8a774e');
            c.fillStyle = g;
            c.strokeStyle = 'rgba(70,58,36,0.8)';
            c.lineWidth = 1;
            c.beginPath();
            c.roundRect(bx, by, bw, bh, 4);
            c.fill();
            c.stroke();
          }
        }
        break;
      }
      case T.Wall:
      case T.Rampart: {
        const big = t === T.Rampart;
        if (!big && !same(-1, 0) && !same(1, 0) && !same(0, -1) && !same(0, 1)) {
          // A wall on its own is what is left of one: a heap of stones.
          for (let i = 0; i < 9; i++) {
            const sx = x + 8 + hh(i) * 16;
            const sy = y + 8 + hh(i + 9) * 16;
            const sr = 2 + hh(i + 18) * 3;
            const g = c.createRadialGradient(sx - sr * 0.4, sy - sr * 0.4, 0.3, sx, sy, sr);
            g.addColorStop(0, '#b3ab9a');
            g.addColorStop(1, '#5a554b');
            c.fillStyle = g;
            c.beginPath();
            c.ellipse(sx, sy, sr * 1.2, sr, hh(i + 27) * 3, 0, Math.PI * 2);
            c.fill();
          }
          break;
        }
        const inset = big ? 0 : 7;
        const face = big ? 7 : 4;
        const left = same(-1, 0) ? 0 : inset;
        const right = same(1, 0) ? 0 : inset;
        const top = same(0, -1) ? 0 : inset;
        const bottom = same(0, 1) ? 0 : inset;
        const wx = x + left;
        const wy = y + top;
        const ww = PX - left - right;
        const wh = PX - top - bottom;
        // Lit top, masonry courses, a dark face to the south where we see the wall's height.
        c.fillStyle = big ? '#a29a88' : '#9a968c';
        c.fillRect(wx, wy, ww, wh);
        c.strokeStyle = 'rgba(50,46,40,0.4)';
        c.lineWidth = 1;
        const course = big ? 8 : 5;
        for (let by = wy; by < wy + wh; by += course) {
          c.beginPath();
          c.moveTo(wx, by);
          c.lineTo(wx + ww, by);
          c.stroke();
          const off = ((by / course) | 0) % 2 ? course : 0;
          for (let bx = wx + off; bx < wx + ww; bx += course * 2) {
            c.beginPath();
            c.moveTo(bx, by);
            c.lineTo(bx, by + course);
            c.stroke();
          }
        }
        c.fillStyle = 'rgba(255,250,235,0.18)';
        if (!same(0, -1)) c.fillRect(wx, wy, ww, 1.5);
        if (!same(-1, 0)) c.fillRect(wx, wy, 1.5, wh);
        if (!same(0, 1)) {
          c.fillStyle = big ? '#5a5448' : '#625e56';
          c.fillRect(wx, wy + wh - face, ww, face);
        }
        if (!same(1, 0)) {
          c.fillStyle = 'rgba(40,36,30,0.45)';
          c.fillRect(wx + ww - 2, wy, 2, wh);
        }
        break;
      }
      case T.Wire: {
        c.strokeStyle = 'rgba(40,40,38,0.9)';
        c.lineWidth = 1;
        for (let i = 0; i < 2; i++) {
          c.beginPath();
          for (let k = 0; k <= 10; k++) {
            const px = x + (k / 10) * PX;
            const py = y + PX / 2 + Math.sin(k * 1.9 + i) * 5 + (i ? 2 : -2);
            if (k === 0) c.moveTo(px, py);
            else c.lineTo(px, py);
          }
          c.stroke();
        }
        c.fillStyle = 'rgba(0,0,0,0.3)';
        c.fillRect(x + 4, y + PX / 2 - 4, 3, 12);
        c.fillStyle = '#5a4428';
        c.fillRect(x + 2, y + PX / 2 - 8, 3, 14);
        c.fillRect(x + PX - 5, y + PX / 2 - 8, 3, 14);
        break;
      }
      case T.TankTrap:
        for (const [ox, oy] of [[0.3, 0.35], [0.72, 0.68]]) {
          const cx = x + ox * PX;
          const cy = y + oy * PX;
          c.lineCap = 'round';
          c.strokeStyle = '#2a2a28';
          c.lineWidth = 3.2;
          c.beginPath();
          c.moveTo(cx - 7, cy - 7);
          c.lineTo(cx + 7, cy + 7);
          c.moveTo(cx + 7, cy - 7);
          c.lineTo(cx - 7, cy + 7);
          c.moveTo(cx, cy - 8);
          c.lineTo(cx, cy + 8);
          c.stroke();
          c.strokeStyle = 'rgba(170,170,160,0.45)';
          c.lineWidth = 1;
          c.beginPath();
          c.moveTo(cx - 7, cy - 7.8);
          c.lineTo(cx + 6, cy + 5.2);
          c.stroke();
        }
        break;
    }
  }

  /** Soft contact shading where walls, sandbags and buildings meet the ground (3D mode). */
  private paintContact(tx0: number, ty0: number, tx1: number, ty1: number): void {
    const c = this.ctx;
    const path = new Path2D();
    for (let ty = ty0; ty <= ty1; ty++) {
      for (let tx = tx0; tx <= tx1; tx++) {
        const t = this.map.get(tx, ty);
        if (t === T.Building || t === T.Rampart) path.rect(tx * PX - 3, ty * PX - 3, PX + 6, PX + 6);
        else if (t === T.Wall || t === T.Sandbag) path.rect(tx * PX + 4, ty * PX + 4, PX - 8, PX - 8);
        for (const tree of this.treesOf(tx, ty)) {
          path.moveTo(tree.x + tree.r * 0.45, tree.y);
          path.arc(tree.x, tree.y, tree.r * 0.45, 0, Math.PI * 2);
        }
      }
    }
    c.save();
    c.filter = 'blur(5px)';
    c.fillStyle = 'rgba(10,12,6,0.42)';
    c.fill(path);
    c.restore();
  }

  /** Which roofing a building tile has: 0 clay tile, 1 nipa thatch, 2 corrugated iron. */
  roofMaterial(tx: number, ty: number): number {
    return Math.floor(hash2(this.roofLabel[ty * this.map.w + tx], 7) * ROOFS.length);
  }

  /** Each building gets one roofing, chosen by its lowest tile so it never flickers when repainted. */
  private labelRoofs(): void {
    const { map } = this;
    const n = map.w * map.h;
    if (this.roofLabel.length !== n) this.roofLabel = new Int32Array(n);
    const label = this.roofLabel.fill(-1);
    for (let i = 0; i < n; i++) {
      if (label[i] !== -1 || map.get(i % map.w, Math.floor(i / map.w)) !== T.Building) continue;
      const stack = [i];
      label[i] = i;
      while (stack.length) {
        const k = stack.pop()!;
        const kx = k % map.w;
        const ky = Math.floor(k / map.w);
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = kx + dx;
          const ny = ky + dy;
          if (!map.inBounds(nx, ny)) continue;
          const j = ny * map.w + nx;
          if (label[j] === -1 && map.get(nx, ny) === T.Building) {
            label[j] = i;
            stack.push(j);
          }
        }
      }
    }
  }

  /**
   * Roofs from a distance field: every roof pixel's height is its distance to
   * the building's edge, so each slope runs down to the nearest eave and the
   * ridges and valleys of any shape of building fall out of it. Slopes facing
   * the top-left catch the light. The south and east walls show beneath.
   */
  private paintRoofs(tx0: number, ty0: number, tx1: number, ty1: number): void {
    const { map } = this;
    let any = false;
    for (let ty = ty0; ty <= ty1 && !any; ty++) for (let tx = tx0; tx <= tx1; tx++) if (map.get(tx, ty) === T.Building) any = true;
    if (!any) return;
    const isB = (tx: number, ty: number) => map.inBounds(tx, ty) && map.get(tx, ty) === T.Building;
    const WALL = 8;
    const CAP = 46;
    // Work over a padded area so buildings crossing the region's edge get the same roof.
    const P = 3;
    const ox = (tx0 - P) * PX;
    const oy = (ty0 - P) * PX;
    const PW = (tx1 - tx0 + 1 + 2 * P) * PX;
    const PH = (ty1 - ty0 + 1 + 2 * P) * PX;
    const kind = new Int8Array(PW * PH).fill(-1); // -1 ground, 0 roof, 1 south wall, 2 east wall
    const dist = new Float32Array(PW * PH);
    for (let ty = ty0 - P; ty <= ty1 + P; ty++) {
      for (let tx = tx0 - P; tx <= tx1 + P; tx++) {
        if (!isB(tx, ty)) continue;
        const below = !isB(tx, ty + 1);
        const right = !isB(tx + 1, ty);
        for (let py = 0; py < PX; py++) {
          for (let px = 0; px < PX; px++) {
            const i = (ty * PX + py - oy) * PW + (tx * PX + px - ox);
            kind[i] = this.flat3d ? 0 : below && py >= PX - WALL ? 1 : right && px >= PX - 3 ? 2 : 0;
            dist[i] = kind[i] === 0 ? 1e9 : 0;
          }
        }
      }
    }
    // Two-pass chamfer distance transform.
    const D = Math.SQRT2;
    for (let y = 0; y < PH; y++) {
      for (let x = 0; x < PW; x++) {
        const i = y * PW + x;
        if (kind[i] !== 0) continue;
        let v = dist[i];
        v = Math.min(v, x > 0 ? dist[i - 1] + 1 : 0, y > 0 ? dist[i - PW] + 1 : 0);
        v = Math.min(v, x > 0 && y > 0 ? dist[i - PW - 1] + D : 0, x < PW - 1 && y > 0 ? dist[i - PW + 1] + D : 0);
        dist[i] = v;
      }
    }
    for (let y = PH - 1; y >= 0; y--) {
      for (let x = PW - 1; x >= 0; x--) {
        const i = y * PW + x;
        if (kind[i] !== 0) continue;
        let v = dist[i];
        v = Math.min(v, x < PW - 1 ? dist[i + 1] + 1 : 0, y < PH - 1 ? dist[i + PW] + 1 : 0);
        v = Math.min(v, x < PW - 1 && y < PH - 1 ? dist[i + PW + 1] + D : 0, x > 0 && y < PH - 1 ? dist[i + PW - 1] + D : 0);
        dist[i] = v;
      }
    }
    const W = (tx1 - tx0 + 1) * PX;
    const H = (ty1 - ty0 + 1) * PX;
    const img = new ImageData(W, H);
    const d = img.data;
    const hAt = (i: number) => Math.min(CAP, dist[i]);
    for (let y = 0; y < H; y++) {
      const gy = ty0 * PX + y;
      const py = y + P * PX;
      for (let x = 0; x < W; x++) {
        const gx = tx0 * PX + x;
        const px = x + P * PX;
        const i = py * PW + px;
        const kd = kind[i];
        if (kd < 0) continue;
        const tx = Math.floor(gx / PX);
        const ty = Math.floor(gy / PX);
        const mat = Math.floor(hash2(this.roofLabel[ty * map.w + tx], 7) * ROOFS.length);
        const roof = ROOFS[mat];
        let col: RGB = roof.base;
        let k: number;
        if (kd === 1) {
          // The south wall: plaster, bamboo or planks, darkening to the ground, with the odd window.
          const dd = PX - (gy % PX);
          col = roof.wall;
          k = 0.8 - (1 - dd / WALL) * 0.28;
          if (mat === 1 && gx % 4 === 0) k *= 0.8;
          if (mat === 2 && gx % 6 === 0) k *= 0.82;
          const lx = gx % PX;
          if (hash2(tx, ty, 77) < 0.5 && lx > 10 && lx < 22 && dd > 2 && dd < 6) {
            col = [30, 26, 20];
            k = 1;
          }
        } else if (kd === 2) {
          col = roof.wall;
          k = 0.56;
        } else {
          const h = hAt(i);
          const gxd = hAt(i + 1) - hAt(i - 1);
          const gyd = hAt(i + PW) - hAt(i - PW);
          const len = Math.hypot(gxd, gyd);
          // Downhill direction: which way this bit of roof faces.
          const nx = len > 0 ? -gxd / len : 0;
          const ny = len > 0 ? -gyd / len : 0;
          // In 3D the scene lights the slopes itself; only the roofing pattern is painted.
          if (this.flat3d) k = mat === 2 ? 0.85 : 0.78;
          else if (h >= CAP - 0.5) k = 0.96;
          else {
            const lit = (nx + ny) * -0.7071;
            k = 0.88 + lit * 0.38;
            if (len < 1.2) k *= 0.8;
          }
          if (h < 2.2 && !this.flat3d) k *= 0.7;
          const along = gx * nx + gy * ny;
          const across = -gx * ny + gy * nx;
          const n = noise(gx / 3, gy / 3, 8);
          if (mat === 0) {
            // Rows of curved clay tiles.
            const row = Math.floor(along / 5);
            const wave = Math.sin(((across + (row % 2) * 3) / 6) * Math.PI * 2);
            const lip = ((along % 5) + 5) % 5 < 1 ? -0.12 : 0;
            k *= 0.9 + wave * 0.08 + lip + (n - 0.5) * 0.12;
            if (noise(gx / 9, gy / 9, 9) > 0.78) k *= 0.84;
          } else if (mat === 1) {
            // Nipa thatch: streaks running down the slope.
            k *= 0.86 + noise(across / 1.4, along / 9, 10) * 0.28;
          } else {
            // Corrugated iron, rusting in places.
            k *= 0.9 + Math.sin(across * 1.3) * 0.07 + (n - 0.5) * 0.06;
            const rust = smooth(0.62, 0.86, noise(gx / 12, gy / 12, 11)) * 0.6;
            col = [col[0] + (112 - col[0]) * rust, col[1] + (74 - col[1]) * rust, col[2] + (50 - col[2]) * rust];
          }
        }
        const o = (y * W + x) * 4;
        d[o] = Math.min(255, col[0] * k);
        d[o + 1] = Math.min(255, col[1] * k);
        d[o + 2] = Math.min(255, col[2] * k);
        d[o + 3] = 255;
      }
    }
    const tmp = document.createElement('canvas');
    tmp.width = W;
    tmp.height = H;
    tmp.getContext('2d')!.putImageData(img, 0, 0);
    this.ctx.drawImage(tmp, tx0 * PX, ty0 * PX);
  }

  // ─── Trees ─────────────────────────────────────────────────────

  /** The trees growing on a tile: thick in the jungle, a few palms and banana plants elsewhere. */
  treesOf(tx: number, ty: number): Tree[] {
    const t = this.map.get(tx, ty);
    const h = (i: number) => hash2(tx, ty, 100 + i);
    const out: Tree[] = [];
    const at = (kind: Tree['kind'], r: number, i: number) =>
      out.push({ x: tx * PX + 6 + h(i) * (PX - 12), y: ty * PX + 6 + h(i + 1) * (PX - 12), r, kind, turn: h(i + 2) * Math.PI * 2, seed: Math.floor(h(i + 3) * 1e6) });
    if (t === T.Jungle) {
      const n = h(0) < 0.45 ? 2 : 1;
      for (let i = 0; i < n; i++) {
        const palm = h(10 + i) < 0.45;
        at(palm ? 'palm' : 'broad', palm ? 22 + h(20 + i) * 8 : 19 + h(20 + i) * 9, 30 + i * 5);
      }
    } else if (t === T.Open) {
      let nearJungle = false;
      let nearBuilding = false;
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) {
          const n = this.t(tx + dx, ty + dy);
          if (n === T.Jungle) nearJungle = true;
          if (n === T.Building) nearBuilding = true;
        }
      }
      if ((nearJungle && h(0) < 0.16) || h(0) < 0.012) at('palm', 17 + h(4) * 7, 40);
      else if (nearBuilding && h(0) < 0.07) at('banana', 9 + h(4) * 3, 40);
    }
    return out;
  }

  private drawTree(c: CanvasRenderingContext2D, tree: Tree): void {
    const { x, y, r, turn, seed } = tree;
    const hs = (i: number) => hash2(seed, i, 200);
    c.save();
    c.translate(x, y);
    if (tree.kind === 'broad') {
      // A rounded crown of overlapping leaf masses, lit from the top-left.
      const blobs = 6;
      for (let i = 0; i < blobs; i++) {
        const a = turn + (i / blobs) * Math.PI * 2;
        const d = r * 0.42 * (0.6 + hs(i) * 0.5);
        const bx = Math.cos(a) * d;
        const by = Math.sin(a) * d;
        const br = r * (0.5 + hs(i + 10) * 0.18);
        const g = c.createRadialGradient(bx - br * 0.4, by - br * 0.45, 1, bx, by, br);
        g.addColorStop(0, hs(i + 30) < 0.5 ? '#5b8236' : '#4f7430');
        g.addColorStop(0.55, '#2f5120');
        g.addColorStop(1, '#14240d');
        c.fillStyle = g;
        c.beginPath();
        c.arc(bx, by, br, 0, Math.PI * 2);
        c.fill();
      }
      // Leaf texture across the crown.
      for (let i = 0; i < 26; i++) {
        const a = hs(i + 50) * Math.PI * 2;
        const d = Math.sqrt(hs(i + 80)) * r * 0.85;
        const lx = Math.cos(a) * d;
        const ly = Math.sin(a) * d;
        const lit = lx + ly < 0;
        c.fillStyle = lit ? 'rgba(150,185,96,0.4)' : 'rgba(10,20,6,0.35)';
        c.beginPath();
        c.ellipse(lx, ly, 2.4, 1.3, hs(i + 110) * 3, 0, Math.PI * 2);
        c.fill();
      }
    } else {
      // Palm and banana: fronds radiating from a crown.
      const banana = tree.kind === 'banana';
      const n = banana ? 6 : 10;
      for (let layer = 0; layer < 2; layer++) {
        for (let i = 0; i < n; i++) {
          const a = turn + ((i + layer * 0.5) / n) * Math.PI * 2;
          const len = r * (layer ? 0.82 : 1) * (0.85 + hs(i + layer * 20) * 0.25);
          const wide = banana ? len * 0.32 : len * 0.16;
          const bend = (hs(i + 40) - 0.5) * 0.5;
          c.save();
          c.rotate(a);
          const g = c.createLinearGradient(0, 0, len, 0);
          g.addColorStop(0, layer ? (banana ? '#7aa448' : '#5c8a34') : '#2f5221');
          g.addColorStop(1, layer ? (banana ? '#9cc25e' : '#86ad4c') : '#3d6629');
          c.fillStyle = g;
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(len * 0.5, -wide + bend * len, len, bend * len * 0.6);
          c.quadraticCurveTo(len * 0.5, wide + bend * len, 0, 0);
          c.fill();
          c.strokeStyle = layer ? 'rgba(210,225,150,0.35)' : 'rgba(20,35,14,0.4)';
          c.lineWidth = 0.7;
          c.beginPath();
          c.moveTo(0, 0);
          c.quadraticCurveTo(len * 0.5, bend * len, len, bend * len * 0.6);
          c.stroke();
          if (!banana) {
            // Leaflets along the frond.
            c.strokeStyle = layer ? 'rgba(40,70,24,0.45)' : 'rgba(16,28,10,0.4)';
            c.beginPath();
            for (let k = 0.25; k < 0.95; k += 0.12) {
              const px = len * k;
              const py = bend * len * k * 0.8;
              c.moveTo(px, py);
              c.lineTo(px + len * 0.05, py - wide * 0.9);
              c.moveTo(px, py);
              c.lineTo(px + len * 0.05, py + wide * 0.9);
            }
            c.stroke();
          }
          c.restore();
        }
      }
      if (!banana) {
        c.fillStyle = '#5a4026';
        c.beginPath();
        c.arc(0, 0, 2.6, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#7a6a3a';
        for (let i = 0; i < 3; i++) {
          c.beginPath();
          c.arc(Math.cos(i * 2.1 + turn) * 2, Math.sin(i * 2.1 + turn) * 2, 1.4, 0, Math.PI * 2);
          c.fill();
        }
      }
    }
    c.restore();
  }
}

/** Ground colour helper for other layers (minimap and so on). */
export function groundColor(t: number): string {
  return rgb(GROUND[t] ?? GRASS);
}
