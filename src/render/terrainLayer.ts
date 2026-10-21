import { TILE } from '../data/balance';
import { T } from '../data/terrain';
import { hash2 } from '../core/rng';
import type { GameMap } from '../sim/grid';
import { TERRAIN_BASE } from './palette';

const SCALE = 2;
const PX = TILE * SCALE;

function shade(hex: string, amount: number): string {
  const n = parseInt(hex.slice(1), 16);
  const f = (c: number) => Math.max(0, Math.min(255, Math.round(c + amount * 255)));
  return `rgb(${f((n >> 16) & 255)},${f((n >> 8) & 255)},${f(n & 255)})`;
}

/** How far past the map edge the land is drawn (world units). */
const SURROUND_MARGIN = 900;
/** Resolution of the surround, in canvas pixels per world unit: it is blurred anyway. */
const SURROUND_SCALE = 0.5;

/**
 * Pre-rendered terrain at 2px per world unit. Only tiles that change (craters,
 * crushed hedges) are redrawn, together with their neighbours for edge detail.
 */
export class TerrainLayer {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private surround: HTMLCanvasElement | null = null;

  constructor(private readonly map: GameMap) {
    this.canvas = document.createElement('canvas');
    this.canvas.width = map.w * PX;
    this.canvas.height = map.h * PX;
    this.ctx = this.canvas.getContext('2d')!;
    for (let ty = 0; ty < map.h; ty++) for (let tx = 0; tx < map.w; tx++) this.drawTile(tx, ty);
  }

  sync(): void {
    const changes = this.map.changes;
    if (changes.length === 0) return;
    const redo = new Set<number>();
    for (const i of changes) {
      const tx = i % this.map.w;
      const ty = Math.floor(i / this.map.w);
      for (let dy = -1; dy <= 1; dy++) {
        for (let dx = -1; dx <= 1; dx++) if (this.map.inBounds(tx + dx, ty + dy)) redo.add(this.map.idx(tx + dx, ty + dy));
      }
    }
    changes.length = 0;
    for (const i of redo) this.drawTile(i % this.map.w, Math.floor(i / this.map.w));
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

  private drawTile(tx: number, ty: number): void {
    const c = this.ctx;
    const t = this.map.get(tx, ty);
    const x = tx * PX;
    const y = ty * PX;
    const h = hash2(tx, ty);
    c.save();
    c.beginPath();
    c.rect(x, y, PX, PX);
    c.clip();

    c.fillStyle = shade(TERRAIN_BASE[t] ?? '#5f7b3c', (h - 0.5) * 0.05);
    c.fillRect(x, y, PX, PX);
    if (t !== T.Water && t !== T.Building && t !== T.Road && t !== T.Rampart) this.grassSpecks(x, y, tx, ty, t);

    const same = (dx: number, dy: number) => this.map.get(tx + dx, ty + dy) === t;
    switch (t) {
      case T.Road:
        c.fillStyle = 'rgba(0,0,0,0.08)';
        for (let i = 0; i < 4; i++) c.fillRect(x + hash2(tx, ty, i) * PX, y + hash2(ty, tx, i) * PX, 3, 2);
        break;
      case T.Paddy:
        c.fillStyle = 'rgba(120,170,190,0.35)';
        c.fillRect(x, y, PX, PX);
        c.strokeStyle = 'rgba(160,210,110,0.55)';
        c.lineWidth = 2;
        for (let i = 4; i < PX; i += 7) {
          c.beginPath();
          c.moveTo(x, y + i);
          c.lineTo(x + PX, y + i);
          c.stroke();
        }
        if (!same(0, -1)) this.edge(x, y, PX, 3, '#5a4a30');
        if (!same(0, 1)) this.edge(x, y + PX - 3, PX, 3, '#5a4a30');
        break;
      case T.Hedge:
        for (let i = 0; i < 4; i++) {
          c.fillStyle = shade('#2f5b24', (hash2(tx, ty, i + 9) - 0.5) * 0.12);
          c.beginPath();
          c.arc(x + 6 + hash2(tx, ty, i) * (PX - 12), y + 6 + hash2(ty, tx, i) * (PX - 12), 8 + hash2(tx, i, ty) * 4, 0, Math.PI * 2);
          c.fill();
        }
        break;
      case T.Crater:
        c.fillStyle = '#4a3b27';
        c.beginPath();
        c.ellipse(x + PX / 2, y + PX / 2, PX * 0.42, PX * 0.36, h * 3, 0, Math.PI * 2);
        c.fill();
        c.fillStyle = '#2f2518';
        c.beginPath();
        c.ellipse(x + PX / 2, y + PX / 2, PX * 0.25, PX * 0.2, h * 3, 0, Math.PI * 2);
        c.fill();
        break;
      case T.Sandbag: {
        const horizontal = same(-1, 0) || same(1, 0) || !(same(0, -1) || same(0, 1));
        c.fillStyle = '#b39c6c';
        c.strokeStyle = '#6f5f3e';
        c.lineWidth = 1.5;
        for (let i = 0; i < 3; i++) {
          const bx = horizontal ? x + i * (PX / 3) + 1 : x + PX / 2 - 7;
          const by = horizontal ? y + PX / 2 - 7 : y + i * (PX / 3) + 1;
          c.beginPath();
          c.roundRect(bx, by, horizontal ? PX / 3 - 2 : 14, horizontal ? 14 : PX / 3 - 2, 4);
          c.fill();
          c.stroke();
        }
        break;
      }
      case T.Wire: {
        // Coils of wire strung between posts.
        c.strokeStyle = 'rgba(60,60,60,0.9)';
        c.lineWidth = 1.2;
        for (let i = 0; i < 2; i++) {
          c.beginPath();
          for (let k = 0; k <= 8; k++) {
            const px = x + (k / 8) * PX;
            const py = y + PX / 2 + (k % 2 === 0 ? -5 : 5) + (i === 0 ? -2 : 2);
            if (k === 0) c.moveTo(px, py);
            else c.lineTo(px, py);
          }
          c.stroke();
        }
        c.fillStyle = '#4a3a24';
        c.fillRect(x + 2, y + PX / 2 - 8, 3, 16);
        c.fillRect(x + PX - 5, y + PX / 2 - 8, 3, 16);
        break;
      }
      case T.TankTrap: {
        // Steel hedgehogs.
        c.strokeStyle = '#3a3a3a';
        c.lineWidth = 3;
        for (const [ox, oy] of [[0.3, 0.35], [0.72, 0.68]]) {
          const cx = x + ox * PX;
          const cy = y + oy * PX;
          c.beginPath();
          c.moveTo(cx - 7, cy - 7);
          c.lineTo(cx + 7, cy + 7);
          c.moveTo(cx + 7, cy - 7);
          c.lineTo(cx - 7, cy + 7);
          c.moveTo(cx, cy - 8);
          c.lineTo(cx, cy + 8);
          c.stroke();
        }
        break;
      }
      case T.Wall:
        c.fillStyle = '#8d8a84';
        c.fillRect(x + 4, y + 4, PX - 8, PX - 8);
        if (same(-1, 0)) c.fillRect(x, y + 4, 6, PX - 8);
        if (same(1, 0)) c.fillRect(x + PX - 6, y + 4, 6, PX - 8);
        if (same(0, -1)) c.fillRect(x + 4, y, PX - 8, 6);
        if (same(0, 1)) c.fillRect(x + 4, y + PX - 6, PX - 8, 6);
        c.strokeStyle = 'rgba(40,40,40,0.35)';
        c.lineWidth = 1;
        c.strokeRect(x + 8, y + 8, PX - 16, PX - 16);
        break;
      case T.Building:
        // Thatched/tin roofs with a ridge; darker eaves on outer edges.
        c.fillStyle = shade('#7a5236', (hash2(Math.floor(tx / 3), Math.floor(ty / 3)) - 0.5) * 0.12);
        c.fillRect(x, y, PX, PX);
        c.strokeStyle = 'rgba(0,0,0,0.12)';
        c.lineWidth = 1;
        for (let i = 3; i < PX; i += 6) {
          c.beginPath();
          c.moveTo(x, y + i);
          c.lineTo(x + PX, y + i);
          c.stroke();
        }
        if (!same(-1, 0)) this.edge(x, y, 4, PX, '#3b2616');
        if (!same(1, 0)) this.edge(x + PX - 4, y, 4, PX, '#3b2616');
        if (!same(0, -1)) this.edge(x, y, PX, 4, '#3b2616');
        if (!same(0, 1)) this.edge(x, y + PX - 5, PX, 5, '#24170c');
        break;
      case T.Jungle:
        for (let i = 0; i < 5; i++) {
          c.fillStyle = shade('#2f5a23', (hash2(tx, ty, i + 3) - 0.5) * 0.18);
          c.beginPath();
          c.arc(x + hash2(tx, ty, i) * PX, y + hash2(ty, tx, i) * PX, 9 + hash2(i, tx, ty) * 7, 0, Math.PI * 2);
          c.fill();
        }
        break;
      case T.Rampart: {
        // Dressed stone blocks, with a shadowed parapet on outer faces.
        c.strokeStyle = 'rgba(40,36,30,0.45)';
        c.lineWidth = 1;
        for (let row = 0; row < 4; row++) {
          const by = y + row * (PX / 4);
          c.beginPath();
          c.moveTo(x, by);
          c.lineTo(x + PX, by);
          c.stroke();
          const shift = row % 2 === 0 ? 0 : PX / 4;
          for (let bx = x + shift; bx < x + PX; bx += PX / 2) {
            c.beginPath();
            c.moveTo(bx, by);
            c.lineTo(bx, by + PX / 4);
            c.stroke();
          }
        }
        if (!same(-1, 0)) this.edge(x, y, 4, PX, '#4a453c');
        if (!same(1, 0)) this.edge(x + PX - 4, y, 4, PX, '#4a453c');
        if (!same(0, -1)) this.edge(x, y, PX, 4, '#4a453c');
        if (!same(0, 1)) this.edge(x, y + PX - 5, PX, 5, '#2e2a24');
        break;
      }
      case T.Water:
        c.strokeStyle = 'rgba(200,230,255,0.18)';
        c.lineWidth = 1.5;
        for (let i = 0; i < 2; i++) {
          const wy = y + 8 + hash2(tx, ty, i) * (PX - 16);
          c.beginPath();
          c.moveTo(x + 4, wy);
          c.quadraticCurveTo(x + PX / 2, wy - 3, x + PX - 4, wy);
          c.stroke();
        }
        if (!same(0, -1)) this.edge(x, y, PX, 3, 'rgba(220,210,170,0.6)');
        if (!same(0, 1)) this.edge(x, y + PX - 3, PX, 3, 'rgba(220,210,170,0.6)');
        if (!same(-1, 0)) this.edge(x, y, 3, PX, 'rgba(220,210,170,0.6)');
        if (!same(1, 0)) this.edge(x + PX - 3, y, 3, PX, 'rgba(220,210,170,0.6)');
        break;
    }
    c.restore();
  }

  private grassSpecks(x: number, y: number, tx: number, ty: number, t: number): void {
    const c = this.ctx;
    c.fillStyle = t === T.Paddy ? 'rgba(40,70,40,0.25)' : 'rgba(30,50,20,0.22)';
    for (let i = 0; i < 5; i++) c.fillRect(x + hash2(tx, ty, i + 20) * PX, y + hash2(ty, tx, i + 20) * PX, 2, 2);
    c.fillStyle = 'rgba(160,190,90,0.18)';
    for (let i = 0; i < 3; i++) c.fillRect(x + hash2(tx, ty, i + 40) * PX, y + hash2(ty, tx, i + 40) * PX, 2, 2);
  }

  private edge(x: number, y: number, w: number, h: number, color: string): void {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }
}
