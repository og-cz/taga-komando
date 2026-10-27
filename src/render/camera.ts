import { clamp, type Vec2 } from '../core/vec';

/** How far the 3D battlefield camera leans back from straight down. */
export const CAMERA_TILT = (36 * Math.PI) / 180;

/**
 * Battlefield camera with pan and zoom. `x`/`y` is the world point at screen centre.
 * When `tilted`, the view leans back like an elevated tactical camera: the ground
 * still maps to the screen by a plain scale and offset, but north-south distances
 * shrink by cos(tilt). Everything that converts between screen and world goes
 * through here, so input, HUD and minimap follow the tilt automatically.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 1;
  viewH = 1;
  readonly maxZoom = 4;
  /** Set by the 3D battlefield renderer. */
  tilted = false;

  /** Screen squash of north-south ground distances. */
  get ky(): number {
    return this.tilted ? Math.cos(CAMERA_TILT) : 1;
  }

  /**
   * How far the camera may pull: never so far that the land beyond the edge
   * fills the screen. Zoomed right out, the battlefield still fills the view
   * between the HUD bars.
   */
  get minZoom(): number {
    const fitW = (this.viewW - this.insets.side * 2) / this.worldW;
    const fitH = (this.viewH - this.insets.top - this.insets.bottom) / (this.worldH * this.ky);
    return Math.min(this.maxZoom, Math.max(0.6, fitW, fitH));
  }

  constructor(
    private readonly worldW: number,
    private readonly worldH: number,
  ) {}

  resize(w: number, h: number): void {
    this.viewW = w;
    this.viewH = h;
    this.zoom = clamp(this.zoom, this.minZoom, this.maxZoom);
    this.clamp();
  }

  worldToScreen(p: Vec2): Vec2 {
    return { x: (p.x - this.x) * this.zoom + this.viewW / 2, y: (p.y - this.y) * this.zoom * this.ky + this.viewH / 2 };
  }

  screenToWorld(sx: number, sy: number): Vec2 {
    return { x: (sx - this.viewW / 2) / this.zoom + this.x, y: (sy - this.viewH / 2) / (this.zoom * this.ky) + this.y };
  }

  centerOn(p: Vec2): void {
    this.x = p.x;
    this.y = p.y;
    this.clamp();
  }

  pan(dx: number, dy: number): void {
    this.x += dx / this.zoom;
    this.y += dy / (this.zoom * this.ky);
    this.clamp();
  }

  /** Zoom keeping the world point under the cursor fixed. */
  zoomAt(factor: number, sx: number, sy: number): void {
    const before = this.screenToWorld(sx, sy);
    this.zoom = clamp(this.zoom * factor, this.minZoom, this.maxZoom);
    const after = this.screenToWorld(sx, sy);
    this.x += before.x - after.x;
    this.y += before.y - after.y;
    this.clamp();
  }

  apply(ctx: CanvasRenderingContext2D, dpr: number): void {
    const z = this.zoom * dpr;
    ctx.setTransform(z, 0, 0, z * this.ky, (-this.x * this.zoom + this.viewW / 2) * dpr, (-this.y * this.zoom * this.ky + this.viewH / 2) * dpr);
  }

  visibleBounds(): { x0: number; y0: number; x1: number; y1: number } {
    const a = this.screenToWorld(0, 0);
    const b = this.screenToWorld(this.viewW, this.viewH);
    return { x0: a.x, y0: a.y, x1: b.x, y1: b.y };
  }

  /** Screen pixels covered by HUD bars; the map edge may scroll clear of them. */
  insets = { top: 44, bottom: 190, side: 60 };

  private clamp(): void {
    const z = this.zoom;
    const zy = z * this.ky;
    const minX = this.viewW / 2 / z - this.insets.side / z;
    const maxX = this.worldW - this.viewW / 2 / z + this.insets.side / z;
    const minY = this.viewH / 2 / zy - this.insets.top / zy;
    const maxY = this.worldH - this.viewH / 2 / zy + this.insets.bottom / zy;
    this.x = minX > maxX ? this.worldW / 2 : clamp(this.x, minX, maxX);
    this.y = minY > maxY ? (this.worldH + (this.insets.bottom - this.insets.top) / zy) / 2 : clamp(this.y, minY, maxY);
  }
}
