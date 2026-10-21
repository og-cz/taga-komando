import type { TeamId } from '../data/types';
import type { World } from '../sim/world';
import type { Camera } from '../render/camera';
import { drawReconMap, INK } from './recon';

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

  /** The battlefield as a recon map, drawn once per change of terrain. */
  private paintBase(): void {
    this.base.width = this.canvas.width;
    this.base.height = this.canvas.height;
    drawReconMap(this.base.getContext('2d')!, this.world.map, this.canvas.width, this.canvas.height);
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
      ctx.fillStyle = p.owner === -1 ? INK.neutral : p.owner === 0 ? INK.blue : INK.red;
      ctx.strokeStyle = INK.line;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(p.pos.x * k, p.pos.y * k, p.kind === 'victory' ? 5 : 3.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    for (const sq of world.squads) {
      if (sq.dead || !world.canSee(this.player, sq)) continue;
      ctx.fillStyle = sq.team === 0 ? INK.blue : INK.red;
      const size = sq.def.kind === 'structure' ? 7 : sq.def.kind === 'vehicle' ? 4 : 3;
      ctx.fillRect(sq.pos.x * k - size / 2, sq.pos.y * k - size / 2, size, size);
    }

    const b = this.camera.visibleBounds();
    ctx.strokeStyle = 'rgba(30,22,12,0.9)';
    ctx.lineWidth = 1.2;
    ctx.strokeRect(b.x0 * k + 0.5, b.y0 * k + 0.5, (b.x1 - b.x0) * k, (b.y1 - b.y0) * k);
  }
}
