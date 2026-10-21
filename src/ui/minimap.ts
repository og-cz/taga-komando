import type { TeamId } from '../data/types';
import type { World } from '../sim/world';
import type { Camera } from '../render/camera';
import { T } from '../data/terrain';
import { hash2 } from '../core/rng';

/** Overview of the whole battlefield; click or drag to move the camera. */
export class Minimap {
  readonly canvas: HTMLCanvasElement;
  private readonly ctx: CanvasRenderingContext2D;
  private readonly base: HTMLCanvasElement;
  private baseVersion = -1;
  private readonly scale: number;
  private dragging = false;

  constructor(
    private readonly world: World,
    private readonly camera: Camera,
    private readonly player: TeamId,
    width = 210,
  ) {
    const { w, h } = world.map;
    this.scale = width / w;
    this.canvas = document.createElement('canvas');
    this.canvas.className = 'minimap';
    this.canvas.width = width;
    this.canvas.height = Math.round(h * this.scale);
    this.ctx = this.canvas.getContext('2d')!;
    this.base = document.createElement('canvas');
    this.base.width = w;
    this.base.height = h;

    const move = (e: MouseEvent) => {
      const r = this.canvas.getBoundingClientRect();
      const fx = (e.clientX - r.left) / r.width;
      const fy = (e.clientY - r.top) / r.height;
      this.camera.centerOn({ x: fx * world.map.pixelWidth, y: fy * world.map.pixelHeight });
    };
    this.canvas.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.dragging = true;
      move(e);
    });
    const onMove = (e: MouseEvent) => this.dragging && move(e);
    const onUp = () => (this.dragging = false);
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    this.dispose = () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    this.canvas.addEventListener('contextmenu', (e) => e.preventDefault());
  }

  readonly dispose: () => void;

  /** The battlefield as a recon map: inked on stained, folded paper. */
  private paintBase(): void {
    const { world } = this;
    const map = world.map;
    const W = this.canvas.width;
    const H = this.canvas.height;
    this.base.width = W;
    this.base.height = H;
    const c = this.base.getContext('2d')!;
    const s = this.scale;
    // Paper, stained in places.
    c.fillStyle = '#d6c7a0';
    c.fillRect(0, 0, W, H);
    for (let i = 0; i < 40; i++) {
      const x = hash2(i, 1, 31) * W;
      const y = hash2(i, 2, 31) * H;
      const r = 6 + hash2(i, 3, 31) * 26;
      const g = c.createRadialGradient(x, y, 0, x, y, r);
      g.addColorStop(0, `rgba(${hash2(i, 4, 31) < 0.5 ? '150,120,70' : '240,230,200'},0.18)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      c.fillStyle = g;
      c.fillRect(x - r, y - r, r * 2, r * 2);
    }
    const cell = (tx: number, ty: number, color: string, inset = 0) => {
      c.fillStyle = color;
      c.fillRect(tx * s + inset, ty * s + inset, s - inset * 2 + 0.4, s - inset * 2 + 0.4);
    };
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const t = map.get(tx, ty);
        if (t === T.Jungle) {
          cell(tx, ty, 'rgba(96,112,70,0.55)');
          if ((tx + ty) % 2 === 0) cell(tx, ty, 'rgba(60,74,44,0.45)', s * 0.3);
        } else if (t === T.Hedge) cell(tx, ty, 'rgba(96,112,70,0.4)', s * 0.15);
        else if (t === T.Paddy) {
          cell(tx, ty, 'rgba(140,160,130,0.45)');
          if (ty % 2 === 0) cell(tx, ty, 'rgba(90,110,90,0.35)', s * 0.35);
        } else if (t === T.Water) cell(tx, ty, 'rgba(92,120,128,0.85)');
        else if (t === T.Road) cell(tx, ty, 'rgba(128,96,60,0.75)', s * 0.12);
        else if (t === T.Building) cell(tx, ty, 'rgba(70,52,34,0.9)');
        else if (t === T.Wall || t === T.Rampart) cell(tx, ty, 'rgba(60,54,46,0.85)', s * 0.2);
        else if (t === T.Crater) cell(tx, ty, 'rgba(90,70,46,0.45)', s * 0.2);
      }
    }
    // Map grid and fold lines.
    c.strokeStyle = 'rgba(110,80,40,0.22)';
    c.lineWidth = 0.6;
    c.beginPath();
    for (let x = 0; x < W; x += W / 8) (c.moveTo(Math.round(x) + 0.5, 0), c.lineTo(Math.round(x) + 0.5, H));
    for (let y = 0; y < H; y += H / 6) (c.moveTo(0, Math.round(y) + 0.5), c.lineTo(W, Math.round(y) + 0.5));
    c.stroke();
    c.strokeStyle = 'rgba(255,250,230,0.35)';
    c.lineWidth = 1.4;
    c.beginPath();
    c.moveTo(W / 2, 0);
    c.lineTo(W / 2, H);
    c.moveTo(0, H / 2);
    c.lineTo(W, H / 2);
    c.stroke();
  }

  draw(): void {
    const { ctx, world } = this;
    const map = world.map;
    if (this.baseVersion !== map.version) {
      this.baseVersion = map.version;
      this.paintBase();
    }
    const s = this.scale;
    ctx.drawImage(this.base, 0, 0);

    const vis = world.vision.visible[this.player];
    ctx.fillStyle = 'rgba(60,44,22,0.38)';
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) if (!vis[ty * map.w + tx]) ctx.fillRect(tx * s, ty * s, s + 0.5, s + 0.5);
    }

    const k = s / 16;
    for (const p of world.points) {
      ctx.fillStyle = p.owner === -1 ? '#e8dcb8' : p.owner === 0 ? '#2f5f9e' : '#9e2f26';
      ctx.strokeStyle = '#2a2014';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.pos.x * k, p.pos.y * k, p.kind === 'victory' ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    for (const sq of world.squads) {
      if (sq.dead || !world.canSee(this.player, sq)) continue;
      ctx.fillStyle = sq.team === 0 ? '#1f4f8e' : '#8e1f16';
      const size = sq.def.kind === 'structure' ? 7 : sq.def.kind === 'vehicle' ? 4 : 3;
      ctx.fillRect(sq.pos.x * k - size / 2, sq.pos.y * k - size / 2, size, size);
    }

    const b = this.camera.visibleBounds();
    ctx.strokeStyle = 'rgba(30,22,12,0.9)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(b.x0 * k + 0.5, b.y0 * k + 0.5, (b.x1 - b.x0) * k, (b.y1 - b.y0) * k);
  }
}
