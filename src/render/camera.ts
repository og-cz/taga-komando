import { clamp, type Vec2 } from '../core/vec';

/** How far the 3D battlefield camera leans back from straight down. */
export const CAMERA_TILT = (38 * Math.PI) / 180;
/**
 * Vertical field of view of the 3D battlefield camera: a long lens from far
 * back, so the field stays flat and true to the edges of the screen.
 */
export const CAMERA_FOV = (28 * Math.PI) / 180;

/**
 * Battlefield camera with pan and zoom. `x`/`y` is the world point at screen centre.
 * When `tilted`, the view is a real perspective camera high over the field,
 * leaning back by CAMERA_TILT: near ground is larger than far ground, and
 * `zoom` is the screen pixels per world unit at the centre of the screen.
 * Everything that converts between screen and world goes through here, so
 * input, HUD and minimap follow the camera automatically.
 */
export class Camera {
  x = 0;
  y = 0;
  zoom = 1;
  viewW = 1;
  viewH = 1;
  /** Close enough to see each man's kit and rifle. */
  readonly maxZoom = 6.5;
  /** Set by the 3D battlefield renderer. */
  tilted = false;

  /** Screen squash of north-south ground distances at the centre of the screen. */
  get ky(): number {
    return this.tilted ? Math.cos(CAMERA_TILT) : 1;
  }

  /** Focal length in screen pixels. */
  get focal(): number {
    return this.viewH / 2 / Math.tan(CAMERA_FOV / 2);
  }

  /** Distance from the camera to the ground point at screen centre. */
  get distance(): number {
    return this.focal / this.zoom;
  }

  /** Where the camera is: x and y over the map, h above the ground. */
  get eye(): { x: number; y: number; h: number } {
    const d = this.distance;
    return { x: this.x, y: this.y + Math.sin(CAMERA_TILT) * d, h: Math.cos(CAMERA_TILT) * d };
  }

  /**
   * How far the camera may pull: never so far that the land beyond the edge
   * fills the screen. Zoomed right out, the battlefield still fills the view
   * between the HUD bars.
   */
  get minZoom(): number {
    const fitW = (this.viewW - this.insets.side * 2) / this.worldW;
    const fitH = (this.viewH - this.insets.top - this.insets.bottom) / (this.worldH * this.ky);
    return Math.min(this.maxZoom, Math.max(this.tilted ? 0.75 : 0.6, fitW, fitH));
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

  /** Screen position of a world point, `height` world units above the ground. */
  worldToScreen(p: Vec2, height = 0): Vec2 {
    if (!this.tilted) return { x: (p.x - this.x) * this.zoom + this.viewW / 2, y: (p.y - this.y) * this.zoom + this.viewH / 2 };
    const e = this.eye;
    const s = Math.sin(CAMERA_TILT);
    const c = Math.cos(CAMERA_TILT);
    const vx = p.x - e.x;
    const vh = height - e.h;
    const vy = p.y - e.y;
    // Camera axes: right (1,0,0); up (h: sin, y: -cos); back (h: cos, y: sin).
    const up = vh * s - vy * c;
    const depth = -(vh * c + vy * s);
    const k = this.focal / Math.max(1, depth);
    return { x: this.viewW / 2 + vx * k, y: this.viewH / 2 - up * k };
  }

  /** The ground point under a screen position. */
  screenToWorld(sx: number, sy: number): Vec2 {
    if (!this.tilted) return { x: (sx - this.viewW / 2) / this.zoom + this.x, y: (sy - this.viewH / 2) / this.zoom + this.y };
    const e = this.eye;
    const s = Math.sin(CAMERA_TILT);
    const c = Math.cos(CAMERA_TILT);
    const f = this.focal;
    const a = (sx - this.viewW / 2) / f;
    const b = -(sy - this.viewH / 2) / f;
    // Ray direction: right * a + up * b - back.
    const dx = a;
    const dh = b * s - c;
    const dy = -b * c - s;
    const t = e.h / Math.max(0.05, -dh);
    return { x: e.x + dx * t, y: e.y + dy * t };
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

  /** Flat 2D view (no WebGL): world to screen by a plain scale and offset. */
  apply(ctx: CanvasRenderingContext2D, dpr: number): void {
    const z = this.zoom * dpr;
    ctx.setTransform(z, 0, 0, z, (-this.x * this.zoom + this.viewW / 2) * dpr, (-this.y * this.zoom + this.viewH / 2) * dpr);
  }

  /** The ground the screen shows, as a box round the four corners. */
  visibleBounds(): { x0: number; y0: number; x1: number; y1: number } {
    const pts = [this.screenToWorld(0, 0), this.screenToWorld(this.viewW, 0), this.screenToWorld(0, this.viewH), this.screenToWorld(this.viewW, this.viewH)];
    return {
      x0: Math.min(...pts.map((p) => p.x)),
      y0: Math.min(...pts.map((p) => p.y)),
      x1: Math.max(...pts.map((p) => p.x)),
      y1: Math.max(...pts.map((p) => p.y)),
    };
  }

  /** Screen pixels covered by HUD bars; the map edge may scroll clear of them. */
  insets = { top: 44, bottom: 190, side: 60 };

  private clamp(): void {
    const z = this.zoom;
    const zy = z * this.ky;
    const minX = this.viewW / 2 / z - this.insets.side / z;
    const maxX = this.worldW - this.viewW / 2 / z + this.insets.side / z;
    let minY = this.viewH / 2 / zy - this.insets.top / zy;
    let maxY = this.worldH - this.viewH / 2 / zy + this.insets.bottom / zy;
    if (this.tilted) {
      // In perspective the top of the screen reaches further than the bottom: measure both.
      const top = this.y - this.screenToWorld(this.viewW / 2, this.insets.top).y;
      const bottom = this.screenToWorld(this.viewW / 2, this.viewH - this.insets.bottom).y - this.y;
      minY = top;
      maxY = this.worldH - bottom;
    }
    this.x = minX > maxX ? this.worldW / 2 : clamp(this.x, minX, maxX);
    this.y = minY > maxY ? (this.worldH + (this.insets.bottom - this.insets.top) / zy) / 2 : clamp(this.y, minY, maxY);
  }
}
