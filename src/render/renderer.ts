import { ABILITIES } from '../data/abilities';
import { BUILDABLES } from '../data/buildables';
import { CAPTURE, TILE } from '../data/balance';
import type { DoctrineDef, TeamId, WeaponDef, HeadGear } from '../data/types';
import { UNITS } from '../data/units';
import { CALL_INS, DOCTRINES } from '../data/doctrines';
import { WEAPONS } from '../data/weapons';
import { add, angleTo, fromAngle, rotate, type Vec2 } from '../core/vec';
import { aliveCount, formationOffset, healthFraction, maxRange, type Squad } from '../sim/entities';
import { coverAt, findCoverSpots } from '../sim/systems/cover';
import { defenseAt } from '../sim/systems/defenses';
import { planBuild } from '../sim/systems/engineering';
import type { World } from '../sim/world';
import type { UIState } from '../input/uiState';
import type { Camera } from './camera';
import { Effects } from './effects';
import { COVER_COLOR, NEUTRAL, TEAM } from './palette';
import { TerrainLayer } from './terrainLayer';
import { drawIcon, unitIcon } from '../ui/icons';

const POINT_GLYPH: Record<string, string> = { victory: 'V', munitions: 'M', fuel: 'F', manpower: 'P' };
const ORDER_COLOR: Record<string, string> = {
  move: '#9be29b',
  attackMove: '#ff8a7a',
  attack: '#ff6a5a',
  retreat: '#ffd166',
  ability: '#c9a2ff',
};

/** How each army looks on the battlefield: uniforms, helmets and tank paint. */
interface FactionLook {
  cloth: string;
  helmet: string;
  pack: string;
  /** m1: wide round helmet; type90: smaller helmet with a star and a cloth neck flap. */
  helmetStyle: HeadGear;
  hull: string;
  turret: string;
  camo?: string[];
  barrel: number;
  emblem: 'sun' | 'star';
  chiHa: boolean;
  /** Headquarters: a Filipino bahay na bato, or a Japanese tiled building. */
  hq: 'bahay' | 'japanese';
  roofLight: string;
  roofMid: string;
  roofDark: string;
  ridge: string;
}

const LOOK: Record<string, FactionLook> = {
  usaffe: {
    // Rayadillo under a woven straw Baliwag hat.
    cloth: '#8b98a5',
    helmet: '#c4a866',
    pack: '#5e4a30',
    helmetStyle: 'straw',
    hull: '#58603a',
    turret: '#626b41',
    barrel: 19,
    emblem: 'sun',
    chiHa: false,
    // Terracotta tiles.
    hq: 'bahay',
    roofLight: '#b86340',
    roofMid: '#a1522f',
    roofDark: '#8a4426',
    ridge: '#6e3219',
  },
  ija: {
    cloth: '#8c7c47',
    helmet: '#6d673b',
    pack: '#5a4a2b',
    helmetStyle: 'type90',
    hull: '#8a7a4c',
    turret: '#7d6f45',
    camo: ['#5b6a3a', '#6e5231'],
    barrel: 10,
    emblem: 'star',
    chiHa: true,
    // Dark grey kawara tiles with pale ridge caps.
    hq: 'japanese',
    roofLight: '#5d646c',
    roofMid: '#4c535b',
    roofDark: '#3c4249',
    ridge: '#9aa0a6',
  },
};

/** Draws the world from the player's point of view. Reads the simulation, never writes it. */
export class Renderer {
  readonly effects = new Effects();
  private readonly ctx: CanvasRenderingContext2D;
  private readonly terrain: TerrainLayer;
  private readonly fog: HTMLCanvasElement;
  private readonly fogCtx: CanvasRenderingContext2D;
  private readonly fogData: ImageData;
  /** The fog, enlarged and blurred once per change so its edge is soft. */
  private readonly fogSoft = document.createElement('canvas');
  private fogVersion = -1;
  private readonly territoryCanvas: HTMLCanvasElement;
  private territoryVersion = -1;
  private readonly borders: Path2D;
  private dpr = 1;

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly world: World,
    private readonly camera: Camera,
    private readonly player: TeamId,
    /** Spectator view (menu background): no fog, everything visible. */
    private readonly spectator = false,
  ) {
    this.ctx = canvas.getContext('2d')!;
    this.terrain = new TerrainLayer(world.map);
    const { w, h } = world.map;
    this.fog = document.createElement('canvas');
    this.fog.width = w;
    this.fog.height = h;
    this.fogCtx = this.fog.getContext('2d', { willReadFrequently: true })!;
    this.fogData = this.fogCtx.createImageData(w, h);
    this.territoryCanvas = document.createElement('canvas');
    this.territoryCanvas.width = w;
    this.territoryCanvas.height = h;
    this.borders = this.buildBorders();
  }

  resize(w: number, h: number): void {
    this.dpr = window.devicePixelRatio || 1;
    this.canvas.width = Math.round(w * this.dpr);
    this.canvas.height = Math.round(h * this.dpr);
    this.canvas.style.width = `${w}px`;
    this.canvas.style.height = `${h}px`;
    this.camera.resize(w, h);
  }

  /** Where each tank last left track prints. */
  private readonly tracks = new Map<number, Vec2>();
  /** Each soldier's last position and stride, for the walking animation. */
  private readonly strides = new Map<number, { x: number; y: number; phase: number; moving: boolean }>();

  visibleToPlayer = (p: Vec2): boolean => this.spectator || this.world.vision.isVisible(this.player, p);

  draw(ui: UIState, dt: number): void {
    const { ctx, world, camera } = this;
    this.effects.consume(world.events, this.visibleToPlayer);
    this.effects.update(dt);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#10140f';
    ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);
    camera.apply(ctx, this.dpr);
    // Blasts near the camera shake the view a little.
    if (this.effects.shake > 0.2) {
      const s = this.effects.shake * this.dpr;
      const m = ctx.getTransform();
      ctx.setTransform(m.a, m.b, m.c, m.d, m.e + (Math.random() - 0.5) * s, m.f + (Math.random() - 0.5) * s);
    }

    this.terrain.sync();
    const topLeft = camera.screenToWorld(0, 0);
    const bottomRight = camera.screenToWorld(camera.viewW, camera.viewH);
    this.terrain.drawSurround(ctx, topLeft.x - 32, topLeft.y - 32, bottomRight.x + 32, bottomRight.y + 32);
    this.terrain.draw(ctx);
    this.drawTerritory();
    this.drawPoints();
    this.effects.drawGround(ctx);
    this.drawSelectionUnderlays(ui);

    const visible = world.squads.filter((s) => !s.dead && (this.spectator || world.canSee(this.player, s)));
    for (const sq of visible) if (sq.def.kind === 'structure') this.drawStructure(sq, ui);
    for (const sq of visible) if (sq.def.kind === 'vehicle') this.drawVehicle(sq, ui);
    for (const sq of visible) if (sq.def.kind === 'infantry' || sq.def.kind === 'team') this.drawInfantry(sq, ui);

    this.drawProjectiles();
    // Tree crowns stand over the soldiers beneath them.
    this.terrain.drawCanopy(ctx);
    this.effects.drawAir(ctx);
    if (!this.spectator) this.drawFog();
    this.drawOrders(ui);
    this.drawFaceDrag(ui);
    this.drawEngineering(ui);
    this.drawCursorPreview(ui);

    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    this.drawGrade();
    for (const sq of visible) this.drawSquadHud(sq, ui);
    this.drawPointLabels();
    this.effects.drawText(ctx, camera);
    this.drawBuildCost(ui);
    if (ui.drag) {
      const { x0, y0, x1, y1 } = ui.drag;
      ctx.strokeStyle = 'rgba(160,255,160,0.9)';
      ctx.fillStyle = 'rgba(160,255,160,0.08)';
      ctx.lineWidth = 1;
      ctx.fillRect(Math.min(x0, x1), Math.min(y0, y1), Math.abs(x1 - x0), Math.abs(y1 - y0));
      ctx.strokeRect(Math.min(x0, x1) + 0.5, Math.min(y0, y1) + 0.5, Math.abs(x1 - x0), Math.abs(y1 - y0));
    }
  }

  /** Late-afternoon light over the whole view: warm in the middle, darkening to the edges. */
  private drawGrade(): void {
    const { ctx, camera } = this;
    const w = camera.viewW;
    const h = camera.viewH;
    if (!this.gradeCache || this.gradeCache.w !== w || this.gradeCache.h !== h) {
      const vignette = ctx.createRadialGradient(w / 2, h * 0.45, Math.min(w, h) * 0.35, w / 2, h * 0.45, Math.max(w, h) * 0.75);
      vignette.addColorStop(0, 'rgba(0,0,0,0)');
      vignette.addColorStop(1, 'rgba(4,6,3,0.68)');
      this.gradeCache = { w, h, vignette };
    }
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.fillStyle = 'rgba(255,190,110,0.2)';
    ctx.fillRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(14,12,6,0.16)';
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = this.gradeCache.vignette;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  private gradeCache: { w: number; h: number; vignette: CanvasGradient } | null = null;

  // ─── Map layers ───────────────────────────────────────────────

  private buildBorders(): Path2D {
    const { map, territory } = this.world;
    const path = new Path2D();
    for (let ty = 0; ty < map.h; ty++) {
      for (let tx = 0; tx < map.w; tx++) {
        const s = territory.sectorOf[ty * map.w + tx];
        if (tx + 1 < map.w && territory.sectorOf[ty * map.w + tx + 1] !== s) {
          path.moveTo((tx + 1) * TILE, ty * TILE);
          path.lineTo((tx + 1) * TILE, (ty + 1) * TILE);
        }
        if (ty + 1 < map.h && territory.sectorOf[(ty + 1) * map.w + tx] !== s) {
          path.moveTo(tx * TILE, (ty + 1) * TILE);
          path.lineTo((tx + 1) * TILE, (ty + 1) * TILE);
        }
      }
    }
    return path;
  }

  private drawTerritory(): void {
    const { world, ctx } = this;
    const t = world.territory;
    if (t.version !== this.territoryVersion) {
      this.territoryVersion = t.version;
      const tctx = this.territoryCanvas.getContext('2d', { willReadFrequently: true })!;
      const img = tctx.createImageData(world.map.w, world.map.h);
      const rgb = [
        [79, 148, 232],
        [227, 86, 75],
      ];
      for (let i = 0; i < t.sectorOf.length; i++) {
        const owner = t.ownerOf(t.sectorOf[i], world.points);
        if (owner === -1) continue;
        const supplied = t.isSupplied(owner, t.sectorOf[i]);
        img.data[i * 4] = rgb[owner][0];
        img.data[i * 4 + 1] = rgb[owner][1];
        img.data[i * 4 + 2] = rgb[owner][2];
        img.data[i * 4 + 3] = supplied ? 22 : 9;
      }
      tctx.putImageData(img, 0, 0);
    }
    // A soft wash of the owner's colour, blended across tile edges.
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.territoryCanvas, 0, 0, world.map.pixelWidth, world.map.pixelHeight);
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = 1.5 / this.camera.zoom;
    ctx.setLineDash([6, 6]);
    ctx.stroke(this.borders);
    ctx.setLineDash([]);
  }

  private drawPoints(): void {
    const { ctx, world } = this;
    for (const p of world.points) {
      const color = p.owner === -1 ? NEUTRAL : TEAM[p.owner].main;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.55;
      ctx.lineWidth = 1.5;
      ctx.setLineDash([5, 4]);
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, CAPTURE.radius, 0, Math.PI * 2);
      ctx.stroke();
      ctx.setLineDash([]);
      ctx.globalAlpha = 1;

      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, 13, 0, Math.PI * 2);
      ctx.fill();
      if (p.control !== 0) {
        ctx.strokeStyle = p.control > 0 ? TEAM[0].main : TEAM[1].main;
        ctx.lineWidth = 3;
        ctx.beginPath();
        ctx.arc(p.pos.x, p.pos.y, 11.5, -Math.PI / 2, -Math.PI / 2 + Math.abs(p.control) * Math.PI * 2);
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(p.pos.x, p.pos.y, 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#111';
      ctx.font = 'bold 10px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(POINT_GLYPH[p.kind], p.pos.x, p.pos.y + 0.5);
      ctx.textBaseline = 'alphabetic';

      this.drawObjectiveMarker(p.index, p.pos.x, p.pos.y);
      const cutOff = p.owner !== -1 && !world.territory.isSupplied(p.owner, p.sector);
      if (cutOff) {
        ctx.strokeStyle = '#ffb35c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(p.pos.x - 16, p.pos.y - 16);
        ctx.lineTo(p.pos.x + 16, p.pos.y + 16);
        ctx.stroke();
      }
    }
  }

  /** Role of a point in the current scenario, if any. */
  private objectiveRole(index: number): 'hold' | 'target' | 'locked' | 'taken' | null {
    const s = this.world.scenario;
    if (s?.defense?.hold.includes(index)) return 'hold';
    const sectors = s?.offensive?.sectors;
    if (!sectors) return null;
    const order = sectors.indexOf(index);
    if (order < 0) return null;
    const current = this.world.objective.sector;
    return order === current ? 'target' : order < current ? 'taken' : 'locked';
  }

  private drawObjectiveMarker(index: number, x: number, y: number): void {
    const role = this.objectiveRole(index);
    if (!role || role === 'taken') return;
    const { ctx } = this;
    const pulse = (Math.sin(performance.now() / 300) + 1) / 2;
    if (role === 'locked') {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x + 10, y - 22, 12, 11);
      ctx.strokeStyle = '#cfc9b4';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(x + 16, y - 22, 3.5, Math.PI, 0);
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = role === 'hold' ? `rgba(240,200,90,${0.5 + pulse * 0.5})` : `rgba(255,90,60,${0.5 + pulse * 0.5})`;
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(x, y, CAPTURE.radius + 4 + pulse * 4, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawPointLabels(): void {
    if (this.camera.zoom < 0.7) return;
    const { ctx, world } = this;
    ctx.font = '600 11px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const p of world.points) {
      const s = this.camera.worldToScreen(p.pos);
      const cutOff = p.owner !== -1 && !world.territory.isSupplied(p.owner, p.sector);
      const role = this.objectiveRole(p.index);
      const tag = role === 'hold' ? 'HOLD · ' : role === 'target' ? 'OBJECTIVE · ' : '';
      const label = tag + (cutOff ? `${p.name} (cut off)` : p.name);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(label, s.x + 1, s.y + 13 * this.camera.zoom + 15);
      ctx.fillStyle = role === 'hold' ? '#f0c85a' : role === 'target' ? '#ff8a6a' : cutOff ? '#ffcf8a' : '#f2ecd9';
      ctx.fillText(label, s.x, s.y + 13 * this.camera.zoom + 14);
    }
  }

  private drawFog(): void {
    const { world, ctx } = this;
    const v = world.vision;
    if (v.version !== this.fogVersion) {
      this.fogVersion = v.version;
      const vis = v.visible[this.player];
      const d = this.fogData.data;
      for (let i = 0; i < vis.length; i++) {
        d[i * 4] = 6;
        d[i * 4 + 1] = 9;
        d[i * 4 + 2] = 8;
        d[i * 4 + 3] = vis[i] ? 0 : 165;
      }
      this.fogCtx.putImageData(this.fogData, 0, 0);
      const soft = this.fogSoft;
      soft.width = world.map.w * 4;
      soft.height = world.map.h * 4;
      const sctx = soft.getContext('2d')!;
      sctx.imageSmoothingEnabled = true;
      sctx.filter = 'blur(3px)';
      sctx.drawImage(this.fog, 0, 0, soft.width, soft.height);
    }
    ctx.imageSmoothingEnabled = true;
    ctx.drawImage(this.fogSoft, 0, 0, world.map.pixelWidth, world.map.pixelHeight);
  }

  // ─── Units ────────────────────────────────────────────────────

  private selectedOwn(ui: UIState): Squad[] {
    const out: Squad[] = [];
    for (const id of ui.selected) {
      const s = this.world.get(id);
      if (s && !s.dead && s.team === this.player) out.push(s);
    }
    return out;
  }

  private drawSelectionUnderlays(ui: UIState): void {
    const { ctx } = this;
    for (const sq of this.selectedOwn(ui)) {
      const range = maxRange(sq);
      if (range > 0 && sq.def.kind !== 'structure') {
        ctx.strokeStyle = 'rgba(255,255,255,0.12)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(sq.pos.x, sq.pos.y, range, 0, Math.PI * 2);
        ctx.stroke();
      }
      const crew = sq.models.flatMap((m) => m.weapons).find((w) => w.def.crew && w.def.arc < 360);
      if (crew && sq.setup !== 'packed') {
        const half = (crew.def.arc * Math.PI) / 360;
        ctx.fillStyle = sq.setup === 'deployed' ? 'rgba(255,230,120,0.12)' : 'rgba(255,230,120,0.05)';
        ctx.beginPath();
        ctx.moveTo(sq.pos.x, sq.pos.y);
        ctx.arc(sq.pos.x, sq.pos.y, crew.def.range, sq.setupFacing - half, sq.setupFacing + half);
        ctx.closePath();
        ctx.fill();
      }
      const emplaced = sq.def.kind === 'structure' ? sq.models[0]?.weapons.find((w) => w.def.arc < 360) : undefined;
      if (emplaced) {
        const half = (emplaced.def.arc * Math.PI) / 360;
        ctx.fillStyle = 'rgba(255,230,120,0.1)';
        ctx.beginPath();
        ctx.moveTo(sq.pos.x, sq.pos.y);
        ctx.arc(sq.pos.x, sq.pos.y, emplaced.def.range, sq.heading - half, sq.heading + half);
        ctx.closePath();
        ctx.fill();
      }
      if (sq.def.kind === 'structure' && sq.rally) {
        ctx.strokeStyle = 'rgba(155,226,155,0.7)';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.beginPath();
        ctx.moveTo(sq.pos.x, sq.pos.y);
        ctx.lineTo(sq.rally.x, sq.rally.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
    }
    // The HQ's rally pin stays on the map so you always know where new units go.
    const hq = this.world.hqOf(this.player);
    if (hq && !hq.dead && hq.rally) this.drawRallyPin(hq.rally, ui.selected.has(hq.id));
  }

  private drawRallyPin(p: Vec2, selected: boolean): void {
    const { ctx } = this;
    ctx.globalAlpha = selected ? 1 : 0.7;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 6, 3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = '#9be29b';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y, 9, 4.5, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.fillStyle = '#2b2b2b';
    ctx.fillRect(p.x - 1, p.y - 22, 2, 22);
    ctx.fillStyle = '#9be29b';
    ctx.beginPath();
    ctx.moveTo(p.x + 1, p.y - 22);
    ctx.lineTo(p.x + 15, p.y - 17.5);
    ctx.lineTo(p.x + 1, p.y - 13);
    ctx.closePath();
    ctx.fill();
    ctx.globalAlpha = 1;
  }

  private ring(p: Vec2, r: number, color: string): void {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(p.x, p.y + 1, r, r * 0.75, 0, 0, Math.PI * 2);
    ctx.stroke();
  }

  private drawInfantry(sq: Squad, ui: UIState): void {
    const { ctx } = this;
    const selected = ui.selected.has(sq.id);
    const hovered = ui.hoverId === sq.id;
    const pinned = sq.suppState === 'pinned';
    for (const m of sq.models) {
      if (!m.alive) continue;
      if (selected) this.ring(m.pos, 6.5, '#9dff7a');
      else if (hovered) this.ring(m.pos, 6.5, 'rgba(255,255,255,0.55)');
      const w = m.weapons[0]?.def;
      if (w?.crew) {
        const facing = sq.setup === 'packed' ? m.facing : sq.setupFacing;
        ctx.save();
        ctx.translate(m.pos.x, m.pos.y);
        ctx.rotate(facing);
        ctx.fillStyle = '#2b2b2b';
        if (w.indirect) {
          ctx.fillRect(2, -2.5, 8, 5);
          ctx.beginPath();
          ctx.arc(2, 0, 3, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.fillRect(1, -1.8, sq.setup === 'packed' ? 8 : 13, 3.6);
          if (sq.setup !== 'packed') ctx.fillRect(-2, -5, 3, 10);
        }
        ctx.restore();
      }
      // Walking: the stride advances with the ground covered since last frame.
      const last = this.strides.get(m.id);
      const moved = last ? Math.hypot(m.pos.x - last.x, m.pos.y - last.y) : 0;
      const phase = (last?.phase ?? 0) + moved * 0.55;
      this.strides.set(m.id, { x: m.pos.x, y: m.pos.y, phase, moving: moved > 0.05 });
      this.drawSoldier(m.pos, m.facing, sq, w, pinned, moved > 0.05 || (last?.moving && moved > 0) ? phase : 0);
      const hpFrac = m.hp / m.maxHp;
      if (hpFrac < 0.99) {
        ctx.fillStyle = hpFrac > 0.5 ? '#c9f08a' : hpFrac > 0.25 ? '#f2c94c' : '#ff5a4a';
        ctx.fillRect(m.pos.x - 3, m.pos.y + 5.5, 6 * hpFrac, 1.4);
      }
    }
  }

  /**
   * One soldier seen from above: helmet, shoulders in the faction's uniform
   * with a team-coloured edge, a pack on the back and the weapon held forward.
   * Pinned soldiers lie flat.
   */
  private drawSoldier(p: Vec2, facing: number, sq: Squad, w: WeaponDef | undefined, prone: boolean, stride = 0): void {
    const { ctx } = this;
    const col = TEAM[sq.team];
    const army = this.look(sq);
    // Doctrine units wear their own kit (rayadillo, camisa, paratrooper green…).
    const kit = { cloth: sq.def.look?.cloth ?? army.cloth, helmet: sq.def.look?.helmet ?? army.helmet, style: sq.def.look?.helmetStyle ?? army.helmetStyle, pack: army.pack };
    ctx.save();
    ctx.translate(p.x, p.y);
    // His shadow falls to the bottom-right, like everything else's.
    ctx.fillStyle = 'rgba(8,12,6,0.34)';
    ctx.beginPath();
    ctx.ellipse(prone ? 1.6 : 2.6, prone ? 1.6 : 2.6, prone ? 5.4 : 4, prone ? 3.4 : 3.4, facing, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(facing);

    const bodyX = prone ? -2.2 : 0;
    // Legs stepping out from under the body while he walks.
    if (!prone && stride !== 0) {
      const s = Math.sin(stride) * 2.2;
      ctx.fillStyle = '#2a2a22';
      ctx.beginPath();
      ctx.ellipse(s, -1.6, 1.5, 0.9, 0, 0, Math.PI * 2);
      ctx.ellipse(-s, 1.6, 1.5, 0.9, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    const gun = w && !w.crew ? (w.prefers === 'vehicle' ? 9.5 : w.range < 30 ? 5 : 7) : 0;
    // Weapon first, so the arms and shoulders sit over its stock. Blades are short and bright.
    if (gun) {
      const blade = w!.range < 30;
      ctx.strokeStyle = blade ? '#b9b6a8' : '#1a1a17';
      ctx.lineWidth = w!.prefers === 'vehicle' ? 2.3 : blade ? 1 : 1.2;
      ctx.lineCap = 'round';
      ctx.beginPath();
      ctx.moveTo(bodyX + 0.5, 1.6);
      ctx.lineTo(gun, blade ? 2.8 : 1);
      ctx.stroke();
    }
    // Pack.
    ctx.fillStyle = kit.pack;
    ctx.fillRect(bodyX - (prone ? 4.8 : 3.4), -1.8, 2, 3.6);
    // Shoulders and arms (or the whole body lying down).
    ctx.fillStyle = kit.cloth;
    ctx.strokeStyle = col.main;
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (prone) ctx.ellipse(bodyX, 0, 4.8, 2.3, 0, 0, Math.PI * 2);
    else ctx.ellipse(0, 0, 2.4, 4.1, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    const hx = prone ? 2.6 : 0.4;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = 0.6;
    switch (kit.style) {
      case 'm1':
        // Wide round helmet with a brim.
        ctx.fillStyle = kit.helmet;
        ctx.beginPath();
        ctx.arc(hx, 0, 2.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.strokeStyle = 'rgba(0,0,0,0.3)';
        ctx.beginPath();
        ctx.arc(hx, 0, 1.8, 0, Math.PI * 2);
        ctx.stroke();
        break;
      case 'type90':
        // Small helmet with a star and a cloth neck flap.
        ctx.fillStyle = kit.cloth;
        ctx.beginPath();
        ctx.moveTo(hx - 0.5, -1.9);
        ctx.lineTo(hx - 3.2, -2.3);
        ctx.lineTo(hx - 3.2, 2.3);
        ctx.lineTo(hx - 0.5, 1.9);
        ctx.closePath();
        ctx.fill();
        ctx.fillStyle = kit.helmet;
        ctx.beginPath();
        ctx.arc(hx, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#e8c547';
        ctx.fillRect(hx + 1.1, -0.45, 0.9, 0.9);
        break;
      case 'straw': {
        // A wide woven straw hat with a dark band round the crown.
        const brim = prone ? 3.6 : 4.3;
        ctx.fillStyle = kit.helmet;
        ctx.beginPath();
        ctx.arc(hx, 0, brim, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(70,52,24,0.7)';
        ctx.stroke();
        ctx.strokeStyle = 'rgba(90,68,30,0.35)';
        ctx.lineWidth = 0.4;
        ctx.beginPath();
        ctx.arc(hx, 0, brim * 0.75, 0, Math.PI * 2);
        ctx.stroke();
        // Black ribbon round the crown, a red cockade on it.
        ctx.fillStyle = '#161512';
        ctx.beginPath();
        ctx.arc(hx, 0, 2, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#b3261e';
        ctx.fillRect(hx - 0.4, 1.4, 0.9, 0.9);
        ctx.fillStyle = '#dcc488';
        ctx.beginPath();
        ctx.arc(hx - 0.2, -0.2, 1.5, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'salakot': {
        // A conical salakot: ribs running down from a knob at the top.
        const r = prone ? 3.4 : 4;
        const g = ctx.createRadialGradient(hx - 1, -1, 0.3, hx, 0, r);
        g.addColorStop(0, '#e2c98e');
        g.addColorStop(1, kit.helmet);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(hx, 0, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.strokeStyle = 'rgba(70,52,24,0.7)';
        ctx.stroke();
        ctx.strokeStyle = 'rgba(80,58,26,0.45)';
        ctx.lineWidth = 0.35;
        ctx.beginPath();
        for (let i = 0; i < 8; i++) {
          const a = (i / 8) * Math.PI * 2;
          ctx.moveTo(hx, 0);
          ctx.lineTo(hx + Math.cos(a) * r, Math.sin(a) * r);
        }
        ctx.stroke();
        ctx.fillStyle = '#5a4020';
        ctx.beginPath();
        ctx.arc(hx, 0, 0.7, 0, Math.PI * 2);
        ctx.fill();
        break;
      }
      case 'cap':
        // Kepi with a visor at the front.
        ctx.fillStyle = kit.helmet;
        ctx.beginPath();
        ctx.arc(hx, 0, 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#16181c';
        ctx.fillRect(hx + 1.2, -1.2, 1.4, 2.4);
        break;
      case 'bandana':
      case 'none':
        // Bare head, with a headband or bandana knotted round it.
        ctx.fillStyle = '#9c7350';
        ctx.beginPath();
        ctx.arc(hx, 0, 1.9, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#1f1a14';
        ctx.beginPath();
        ctx.arc(hx - 0.4, 0, 1.6, Math.PI * 0.5, Math.PI * 1.5);
        ctx.fill();
        if (kit.style === 'bandana') {
          ctx.strokeStyle = kit.helmet;
          ctx.lineWidth = 0.9;
          ctx.beginPath();
          ctx.arc(hx, 0, 1.9, -Math.PI * 0.6, Math.PI * 0.6);
          ctx.stroke();
          ctx.fillStyle = kit.helmet;
          ctx.fillRect(hx - 3, -0.5, 1.4, 1);
        }
        break;
    }
    ctx.fillStyle = 'rgba(255,255,230,0.2)';
    ctx.beginPath();
    ctx.arc(hx - 0.6, -0.7, 0.8, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  /**
   * Tanks in their army's paint: the Maharlika Tamaraw in olive drab with a
   * long 37mm gun and a sun on the hull; the Chi-Ha in three-colour
   * camouflage with its off-centre turret, stubby 57mm and hoop aerial.
   */
  private drawVehicle(sq: Squad, ui: UIState): void {
    const { ctx } = this;
    const vd = sq.def.vehicle!;
    const L = vd.length;
    const W = vd.width;
    const look = this.look(sq);
    ctx.save();
    ctx.translate(sq.pos.x, sq.pos.y);
    if (ui.selected.has(sq.id) || ui.hoverId === sq.id) {
      ctx.strokeStyle = ui.selected.has(sq.id) ? '#9dff7a' : 'rgba(255,255,255,0.55)';
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(0, 0, L * 0.7, L * 0.55, sq.heading, 0, Math.PI * 2);
      ctx.stroke();
    }
    // The hull's shadow falls to the bottom-right, whichever way it faces.
    ctx.save();
    ctx.translate(5, 5);
    ctx.rotate(sq.heading);
    ctx.fillStyle = 'rgba(8,10,5,0.38)';
    ctx.beginPath();
    ctx.roundRect(-L / 2 - 1, -W / 2 - 1, L + 2, W + 2, 3);
    ctx.fill();
    ctx.restore();
    ctx.rotate(sq.heading);
    // Track prints every few paces while it drives.
    const lastTrack = this.tracks.get(sq.id);
    if (!lastTrack || Math.hypot(sq.pos.x - lastTrack.x, sq.pos.y - lastTrack.y) > 7) {
      if (lastTrack) this.effects.track(sq.pos, sq.heading);
      this.tracks.set(sq.id, { x: sq.pos.x, y: sq.pos.y });
    }

    // Tracks, with links.
    ctx.fillStyle = '#23231f';
    ctx.fillRect(-L / 2, -W / 2, L, 4.5);
    ctx.fillRect(-L / 2, W / 2 - 4.5, L, 4.5);
    ctx.strokeStyle = 'rgba(90,88,78,0.7)';
    ctx.lineWidth = 0.8;
    for (let x = -L / 2 + 1.5; x < L / 2; x += 2.6) {
      ctx.beginPath();
      ctx.moveTo(x, -W / 2);
      ctx.lineTo(x, -W / 2 + 4.5);
      ctx.moveTo(x, W / 2 - 4.5);
      ctx.lineTo(x, W / 2);
      ctx.stroke();
    }

    // Hull.
    const hullX = -L / 2 + 1;
    const hullY = -W / 2 + 3.5;
    const hullW = L - 2;
    const hullH = W - 7;
    ctx.fillStyle = look.hull;
    ctx.strokeStyle = '#141410';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (look.chiHa) {
      // Sloped glacis at the front.
      ctx.moveTo(hullX, hullY);
      ctx.lineTo(hullX + hullW - 5, hullY);
      ctx.lineTo(hullX + hullW, hullY + 3);
      ctx.lineTo(hullX + hullW, hullY + hullH - 3);
      ctx.lineTo(hullX + hullW - 5, hullY + hullH);
      ctx.lineTo(hullX, hullY + hullH);
      ctx.closePath();
    } else {
      ctx.roundRect(hullX, hullY, hullW, hullH, 2.5);
    }
    ctx.fill();
    if (look.camo) {
      // Camouflage blotches, clipped to the hull.
      ctx.save();
      ctx.clip();
      look.camo.forEach((c, i) => {
        ctx.fillStyle = c;
        for (let k = 0; k < 3; k++) {
          const bx = hullX + ((i * 7 + k * 11) % hullW);
          const by = hullY + ((i * 5 + k * 7) % hullH);
          ctx.beginPath();
          ctx.ellipse(bx, by, 4.5, 2.6, (i + k) * 0.9, 0, Math.PI * 2);
          ctx.fill();
        }
      });
      ctx.restore();
    }
    ctx.stroke();
    // Engine deck grille at the back, and rivets along the hull.
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = 0.8;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.moveTo(hullX + 2 + i * 1.8, hullY + 2.5);
      ctx.lineTo(hullX + 2 + i * 1.8, hullY + hullH - 2.5);
      ctx.stroke();
    }
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    for (let x = hullX + 3; x < hullX + hullW - 2; x += 4) {
      ctx.fillRect(x, hullY + 0.8, 0.9, 0.9);
      ctx.fillRect(x, hullY + hullH - 1.7, 0.9, 0.9);
    }
    // Hull marking.
    this.emblem(look.emblem, hullX + hullW * 0.32, 0, 2.6);

    // Turret: the Tamaraw's is central, the Chi-Ha's sits to one side.
    ctx.translate(look.chiHa ? 1 : 0.5, look.chiHa ? -1.2 : 0);
    ctx.rotate(sq.turret - sq.heading);
    ctx.fillStyle = '#1b1b18';
    ctx.fillRect(0, -1.3, look.barrel, 2.6);
    ctx.fillRect(look.barrel - 1.5, -1.8, 1.5, 3.6);
    const tr = W * 0.3;
    ctx.fillStyle = look.turret;
    ctx.strokeStyle = '#141410';
    ctx.lineWidth = 1;
    ctx.beginPath();
    if (look.chiHa) ctx.ellipse(0, 0, tr, tr * 0.9, 0, 0, Math.PI * 2);
    else ctx.roundRect(-tr, -tr * 0.85, tr * 2, tr * 1.7, 2.5);
    ctx.fill();
    ctx.stroke();
    // Hatch.
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.beginPath();
    ctx.arc(-tr * 0.35, 0, tr * 0.35, 0, Math.PI * 2);
    ctx.fill();
    if (look.chiHa) {
      // The Chi-Ha's hoop aerial round the turret.
      ctx.strokeStyle = 'rgba(30,30,26,0.9)';
      ctx.lineWidth = 0.7;
      ctx.beginPath();
      ctx.ellipse(-1, 0, tr + 2.2, tr + 1.6, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();
    // Damaged vehicles trail smoke.
    if (healthFraction(sq) < 0.4 && Math.random() < 0.15) this.effects.puff(sq.pos);
  }

  /** Paint and kit of a unit's army. */
  private look(sq: Squad): FactionLook {
    return LOOK[this.world.teams[sq.team].faction.id] ?? LOOK.usaffe;
  }

  /** A small national marking: a sun (Maharlika) or a star (Imperial Army). */
  private emblem(kind: 'sun' | 'star', x: number, y: number, r: number): void {
    const { ctx } = this;
    ctx.save();
    ctx.translate(x, y);
    ctx.fillStyle = '#e8c547';
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    if (kind === 'sun') {
      ctx.arc(0, 0, r * 0.55, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = '#e8c547';
      ctx.lineWidth = 0.7;
      for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.moveTo(Math.cos(a) * r * 0.75, Math.sin(a) * r * 0.75);
        ctx.lineTo(Math.cos(a) * r * 1.2, Math.sin(a) * r * 1.2);
      }
      ctx.stroke();
    } else {
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i / 10) * Math.PI * 2;
        const rr = i % 2 === 0 ? r : r * 0.45;
        if (i === 0) ctx.moveTo(Math.cos(a) * rr, Math.sin(a) * rr);
        else ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr);
      }
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
    }
    ctx.restore();
  }

  private drawStructure(sq: Squad, ui: UIState): void {
    this.drawStructureShadow(sq);
    if (sq.building === null) {
      this.drawStructureBody(sq, ui);
      return;
    }
    // Still going up: a pale outline of the finished building inside its scaffold.
    this.ctx.globalAlpha = 0.4;
    this.drawStructureBody(sq, ui);
    this.ctx.globalAlpha = 1;
    this.drawScaffold(sq);
  }

  /** A building's shadow on the ground, to the bottom-right, in two soft layers. */
  private drawStructureShadow(sq: Squad): void {
    const { ctx } = this;
    let x0: number;
    let y0: number;
    let w: number;
    let h: number;
    if (sq.footprint.length) {
      x0 = Math.min(...sq.footprint.map((f) => f.tx)) * TILE;
      y0 = Math.min(...sq.footprint.map((f) => f.ty)) * TILE;
      w = (Math.max(...sq.footprint.map((f) => f.tx)) + 1) * TILE - x0;
      h = (Math.max(...sq.footprint.map((f) => f.ty)) + 1) * TILE - y0;
    } else {
      const r = sq.def.role === 'hq' ? sq.def.radius * 1.15 : sq.def.radius;
      x0 = sq.pos.x - r;
      y0 = sq.pos.y - r;
      w = h = r * 2;
    }
    const lift = (sq.building === null ? 1 : 0.4) * (sq.def.role === 'hq' || sq.def.role === 'tech' ? 9 : 5);
    ctx.fillStyle = 'rgba(8,10,5,0.2)';
    ctx.beginPath();
    ctx.roundRect(x0 + lift - 1, y0 + lift - 1, w + 2, h + 2, 4);
    ctx.fill();
    ctx.fillStyle = 'rgba(8,10,5,0.25)';
    ctx.beginPath();
    ctx.roundRect(x0 + lift + 1, y0 + lift + 1, w - 2, h - 2, 3);
    ctx.fill();
  }

  /** Poles and braces round a building that is still going up, and how far along it is. */
  private drawScaffold(sq: Squad): void {
    const { ctx } = this;
    const tiles = sq.footprint.length ? sq.footprint : [{ tx: Math.floor(sq.pos.x / TILE), ty: Math.floor(sq.pos.y / TILE) }];
    const x0 = Math.min(...tiles.map((f) => f.tx)) * TILE + 1;
    const y0 = Math.min(...tiles.map((f) => f.ty)) * TILE + 1;
    const x1 = (Math.max(...tiles.map((f) => f.tx)) + 1) * TILE - 1;
    const y1 = (Math.max(...tiles.map((f) => f.ty)) + 1) * TILE - 1;
    ctx.strokeStyle = '#8a6a3e';
    ctx.lineWidth = 1.3;
    ctx.strokeRect(x0, y0, x1 - x0, y1 - y0);
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    for (let x = x0 + 8; x < x1; x += 8) {
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y1);
    }
    ctx.moveTo(x0, y0);
    ctx.lineTo(x1, y1);
    ctx.moveTo(x1, y0);
    ctx.lineTo(x0, y1);
    ctx.stroke();
    ctx.fillStyle = '#5a4428';
    for (const [px, py] of [[x0, y0], [x1, y0], [x0, y1], [x1, y1]]) ctx.fillRect(px - 1.5, py - 1.5, 3, 3);
    const k = sq.building ?? 0;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x0, y1 + 3, x1 - x0, 3);
    ctx.fillStyle = '#e0c34a';
    ctx.fillRect(x0, y1 + 3, (x1 - x0) * k, 3);
  }

  private drawStructureBody(sq: Squad, ui: UIState): void {
    if (sq.def.role === 'tech') {
      this.drawTech(sq, ui);
      return;
    }
    if (sq.def.role !== 'hq') {
      this.drawFort(sq, ui);
      return;
    }
    const { ctx } = this;
    const look = this.look(sq);
    const filipino = look.hq === 'bahay';
    const r = sq.def.radius;
    const { x, y } = sq.pos;
    const wall = r + 7;

    // The compound: packed earth inside an adobe wall or a timber fence.
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(x - wall + 3, y - wall + 4, wall * 2, wall * 2);
    ctx.fillStyle = filipino ? '#8f7f5c' : '#7d7458';
    ctx.fillRect(x - wall, y - wall, wall * 2, wall * 2);
    ctx.strokeStyle = filipino ? '#c2ab80' : '#3b2f22';
    ctx.lineWidth = filipino ? 3 : 2;
    ctx.beginPath();
    // Wall all round, with a gate gap at the front (south).
    ctx.moveTo(x - 7, y + wall);
    ctx.lineTo(x - wall, y + wall);
    ctx.lineTo(x - wall, y - wall);
    ctx.lineTo(x + wall, y - wall);
    ctx.lineTo(x + wall, y + wall);
    ctx.lineTo(x + 7, y + wall);
    ctx.stroke();
    if (filipino) {
      // Adobe blocks.
      ctx.strokeStyle = 'rgba(90,70,40,0.45)';
      ctx.lineWidth = 0.6;
      for (let i = -wall; i < wall; i += 5) {
        ctx.beginPath();
        ctx.moveTo(x + i, y - wall - 1.5);
        ctx.lineTo(x + i, y - wall + 1.5);
        ctx.moveTo(x - wall - 1.5, y + i);
        ctx.lineTo(x - wall + 1.5, y + i);
        ctx.moveTo(x + wall - 1.5, y + i);
        ctx.lineTo(x + wall + 1.5, y + i);
        ctx.stroke();
      }
    } else {
      // Fence posts.
      ctx.fillStyle = '#2a2119';
      for (let i = -wall; i <= wall; i += 6) {
        ctx.fillRect(x + i - 1, y - wall - 1, 2, 2);
        ctx.fillRect(x - wall - 1, y + i - 1, 2, 2);
        ctx.fillRect(x + wall - 1, y + i - 1, 2, 2);
      }
    }

    // The house: a hipped roof seen from above.
    const hw = r;
    const hh = r * 0.78;
    const top = y - hh - 3;
    const ridge = hw * 0.45;
    const eave = filipino ? 0 : 2.5;
    const faces: [string, [number, number][]][] = [
      [look.roofLight, [[x - hw - eave, top - eave], [x + hw + eave, top - eave], [x + ridge, top + hh], [x - ridge, top + hh]]],
      [look.roofDark, [[x - hw - eave, top + hh * 2 + eave], [x + hw + eave, top + hh * 2 + eave], [x + ridge, top + hh], [x - ridge, top + hh]]],
      [look.roofMid, [[x - hw - eave, top - eave], [x - ridge, top + hh], [x - hw - eave, top + hh * 2 + eave]]],
      [look.roofMid, [[x + hw + eave, top - eave], [x + ridge, top + hh], [x + hw + eave, top + hh * 2 + eave]]],
    ];
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(x - hw - eave + 4, top - eave + 5, (hw + eave) * 2, (hh + eave) * 2);
    for (const [color, pts] of faces) {
      ctx.fillStyle = color;
      ctx.beginPath();
      pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
      ctx.closePath();
      ctx.fill();
    }
    // Rows of tiles running down each slope.
    ctx.save();
    ctx.beginPath();
    ctx.rect(x - hw - eave, top - eave, (hw + eave) * 2, (hh + eave) * 2);
    ctx.clip();
    ctx.strokeStyle = filipino ? 'rgba(70,25,10,0.35)' : 'rgba(15,18,22,0.45)';
    ctx.lineWidth = 0.7;
    for (let i = -hw - eave; i <= hw + eave; i += 3) {
      ctx.beginPath();
      ctx.moveTo(x + i, top - eave);
      ctx.lineTo(x + i * 0.5, top + hh);
      ctx.lineTo(x + i, top + hh * 2 + eave);
      ctx.stroke();
    }
    ctx.restore();
    // Ridge and hip lines.
    ctx.strokeStyle = look.ridge;
    ctx.lineWidth = filipino ? 1.6 : 2.4;
    ctx.beginPath();
    ctx.moveTo(x - ridge, top + hh);
    ctx.lineTo(x + ridge, top + hh);
    for (const [cx, cy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
      ctx.moveTo(x + cx * ridge, top + hh);
      ctx.lineTo(x + cx * (hw + eave), top + hh + cy * (hh + eave));
    }
    ctx.stroke();
    if (filipino) {
      // Capiz-shell windows along the upper floor, under the eaves.
      ctx.fillStyle = 'rgba(236,228,200,0.85)';
      for (let i = -hw + 5; i < hw - 3; i += 6) ctx.fillRect(x + i, top + hh * 2 + 1, 4, 2);
      // Sandbags either side of the gate.
      ctx.fillStyle = '#b09c70';
      for (const side of [-1, 1]) {
        for (let k = 0; k < 3; k++) {
          ctx.beginPath();
          ctx.ellipse(x + side * (10 + k * 4.5), y + wall + 4, 2.4, 1.6, 0, 0, Math.PI * 2);
          ctx.fill();
        }
      }
    } else {
      // Pale ridge-end caps, as on a temple-style roof.
      ctx.fillStyle = look.ridge;
      ctx.fillRect(x - ridge - 2, top + hh - 2, 4, 4);
      ctx.fillRect(x + ridge - 2, top + hh - 2, 4, 4);
    }

    this.drawCompoundLife(sq, wall, filipino);
    if (ui.selected.has(sq.id)) {
      ctx.strokeStyle = '#9dff7a';
      ctx.lineWidth = 1.5;
      ctx.strokeRect(x - wall - 3, y - wall - 3, wall * 2 + 6, wall * 2 + 6);
    }
  }

  /**
   * Engineer structures, each army building in its own way:
   * MG nest: Maharlika sandbags round a water-cooled heavy gun; Imperial log-lined
   * pit round a finned Type 92.
   * Bunker: Maharlika coconut logs under palm fronds; Imperial round concrete
   * pillbox under camouflage netting.
   * Aid station: Maharlika bamboo-and-nipa klinika; Imperial khaki field tent.
   * The plate above each one shows whose it is.
   */
  private drawFort(sq: Squad, ui: UIState): void {
    const { ctx } = this;
    const r = sq.def.radius;
    const { x, y } = sq.pos;
    const filipino = this.look(sq).hq === 'bahay';
    const target = this.world.get(sq.targetId);
    const aim = target && !target.dead ? Math.atan2(target.pos.y - y, target.pos.x - x) : sq.heading;
    const seed = sq.id * 7.13;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + 2, y + 3, r + 1, r * 0.9, 0, 0, Math.PI * 2);
    ctx.fill();

    if (sq.def.id === 'mg_nest') {
      // Dug-in pit.
      ctx.fillStyle = filipino ? '#3a3226' : '#33291d';
      ctx.beginPath();
      ctx.arc(x, y, r - 2.5, 0, Math.PI * 2);
      ctx.fill();
      const pieces = filipino ? 11 : 9;
      ctx.lineWidth = 0.7;
      for (let i = 0; i < pieces; i++) {
        const a = (i / pieces) * Math.PI * 2 + seed;
        const shade = 0.9 + 0.2 * Math.abs(Math.sin(seed + i * 1.7));
        const px = x + Math.cos(a) * (r - 1.8);
        const py = y + Math.sin(a) * (r - 1.8);
        if (filipino) {
          // Sandbags.
          ctx.fillStyle = `rgb(${Math.round(176 * shade)},${Math.round(158 * shade)},${Math.round(116 * shade)})`;
          ctx.strokeStyle = 'rgba(70,58,38,0.8)';
          ctx.beginPath();
          ctx.ellipse(px, py, 3.1, 1.9, a + Math.PI / 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.stroke();
        } else {
          // Logs laid round the rim, cut ends showing.
          ctx.save();
          ctx.translate(px, py);
          ctx.rotate(a + Math.PI / 2);
          ctx.fillStyle = `rgb(${Math.round(112 * shade)},${Math.round(82 * shade)},${Math.round(50 * shade)})`;
          ctx.fillRect(-3.6, -1.4, 7.2, 2.8);
          ctx.fillStyle = '#c9a86f';
          ctx.beginPath();
          ctx.arc(3.6, 0, 1.3, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
      }
      // The gun on its tripod.
      ctx.strokeStyle = '#2b2b27';
      ctx.lineWidth = 0.9;
      for (const leg of [aim + Math.PI, aim + 2.3, aim - 2.3]) {
        ctx.beginPath();
        ctx.moveTo(x, y);
        ctx.lineTo(x + Math.cos(leg) * 4, y + Math.sin(leg) * 4);
        ctx.stroke();
      }
      if (filipino) {
        // A fat water jacket round the barrel.
        this.barrel(x, y, aim, r - 1, '#2a2b26', 2.8);
        this.barrel(x, y, aim, r + 2.5, '#1c1c1a', 1.2);
      } else {
        // Type 92: a finned barrel.
        this.barrel(x, y, aim, r + 2, '#1c1c1a', 1.5);
        ctx.strokeStyle = '#1c1c1a';
        ctx.lineWidth = 0.8;
        for (let k = 3; k < r - 1; k += 1.8) {
          const bx = x + Math.cos(aim) * k;
          const by = y + Math.sin(aim) * k;
          ctx.beginPath();
          ctx.moveTo(bx - Math.sin(aim) * 1.6, by + Math.cos(aim) * 1.6);
          ctx.lineTo(bx + Math.sin(aim) * 1.6, by - Math.cos(aim) * 1.6);
          ctx.stroke();
        }
      }
      ctx.fillStyle = '#26261f';
      ctx.fillRect(x - 1.5, y - 1.5, 3, 3);
    } else if (sq.def.id === 'bunker') {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sq.heading);
      if (filipino) {
        // Coconut logs laid side by side.
        ctx.fillStyle = '#5a4630';
        ctx.beginPath();
        ctx.roundRect(-r, -r * 0.85, r * 2, r * 1.7, 3);
        ctx.fill();
        for (let i = 0; i < 5; i++) {
          const ly = -r * 0.85 + 1 + i * ((r * 1.7 - 2) / 5);
          ctx.fillStyle = i % 2 ? '#7a5f3e' : '#6e5436';
          ctx.fillRect(-r + 1, ly, r * 2 - 2, (r * 1.7 - 2) / 5 - 0.6);
          ctx.fillStyle = '#b8935e';
          ctx.beginPath();
          ctx.arc(-r + 1.5, ly + 1.4, 1.2, 0, Math.PI * 2);
          ctx.fill();
        }
        // Palm fronds thrown over the top.
        ctx.strokeStyle = 'rgba(86,120,52,0.95)';
        ctx.lineWidth = 0.8;
        for (const [fx, fy, fa] of [[-4, -3, 0.4], [3, 2, -0.6], [-2, 4, 2.6]]) {
          ctx.beginPath();
          ctx.moveTo(fx - Math.cos(fa) * 6, fy - Math.sin(fa) * 6);
          ctx.lineTo(fx + Math.cos(fa) * 6, fy + Math.sin(fa) * 6);
          for (let k = -5; k <= 5; k += 1.5) {
            const sx = fx + Math.cos(fa) * k;
            const sy = fy + Math.sin(fa) * k;
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + Math.cos(fa + 1.2) * 2.6, sy + Math.sin(fa + 1.2) * 2.6);
            ctx.moveTo(sx, sy);
            ctx.lineTo(sx + Math.cos(fa - 1.2) * 2.6, sy + Math.sin(fa - 1.2) * 2.6);
          }
          ctx.stroke();
        }
        // Firing slit in the front logs.
        ctx.fillStyle = '#121212';
        ctx.fillRect(r - 2.2, -3.5, 2.2, 7);
      } else {
        // Round concrete pillbox.
        ctx.fillStyle = '#8b887d';
        ctx.strokeStyle = '#5c5a52';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(0, 0, r - 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.stroke();
        ctx.fillStyle = '#9d9a8f';
        ctx.beginPath();
        ctx.arc(-1, -1, r - 5, 0, Math.PI * 2);
        ctx.fill();
        // Camouflage netting with scraps of foliage, draped over the dome.
        ctx.save();
        ctx.beginPath();
        ctx.arc(0, 0, r, 0, Math.PI * 2);
        ctx.clip();
        ctx.strokeStyle = 'rgba(70,80,45,0.55)';
        ctx.lineWidth = 0.6;
        for (let k = -r; k <= r; k += 3) {
          ctx.beginPath();
          ctx.moveTo(k, -r);
          ctx.lineTo(k + r, r);
          ctx.moveTo(k + r, -r);
          ctx.lineTo(k, r);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(88,108,56,0.7)';
        for (let k = 0; k < 6; k++) {
          const a = seed + k * 1.1;
          ctx.beginPath();
          ctx.ellipse(Math.cos(a) * (r - 5), Math.sin(a) * (r - 5), 2.4, 1.4, a, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
        // Embrasure.
        ctx.strokeStyle = '#121212';
        ctx.lineWidth = 2.2;
        ctx.beginPath();
        ctx.arc(0, 0, r - 1.5, -0.35, 0.35);
        ctx.stroke();
      }
      ctx.restore();
      this.barrel(x + Math.cos(sq.heading) * (r - 2), y + Math.sin(sq.heading) * (r - 2), aim, 4, '#1c1c1a', 1.5);
    } else if (filipino) {
      // Bamboo-and-nipa klinika: a thatched roof on a bamboo frame.
      const hw = r;
      const hh = r * 0.8;
      ctx.fillStyle = '#7d6a3f';
      ctx.fillRect(x - hw - 1, y - hh - 1, hw * 2 + 2, hh * 2 + 2);
      const thatch: [string, [number, number][]][] = [
        ['#c4a868', [[x - hw, y - hh], [x + hw, y - hh], [x + hw * 0.35, y], [x - hw * 0.35, y]]],
        ['#a88f55', [[x - hw, y + hh], [x + hw, y + hh], [x + hw * 0.35, y], [x - hw * 0.35, y]]],
        ['#b69b5e', [[x - hw, y - hh], [x - hw * 0.35, y], [x - hw, y + hh]]],
        ['#b69b5e', [[x + hw, y - hh], [x + hw * 0.35, y], [x + hw, y + hh]]],
      ];
      for (const [color, pts] of thatch) {
        ctx.fillStyle = color;
        ctx.beginPath();
        pts.forEach(([px, py], i) => (i === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py)));
        ctx.closePath();
        ctx.fill();
      }
      // Straw lines and the ridge.
      ctx.strokeStyle = 'rgba(90,70,35,0.45)';
      ctx.lineWidth = 0.5;
      for (let i = -hw; i <= hw; i += 2) {
        ctx.beginPath();
        ctx.moveTo(x + i, y - hh);
        ctx.lineTo(x + i * 0.35, y);
        ctx.lineTo(x + i, y + hh);
        ctx.stroke();
      }
      ctx.strokeStyle = '#6f5a2f';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.moveTo(x - hw * 0.35, y);
      ctx.lineTo(x + hw * 0.35, y);
      ctx.stroke();
      this.medicalMark(x, y - hh * 0.5);
    } else {
      // Khaki field tent.
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(sq.heading);
      const hw = r;
      const hh = r * 0.66;
      ctx.strokeStyle = 'rgba(210,200,170,0.45)';
      ctx.lineWidth = 0.6;
      for (const [sx, sy] of [[-1, -1], [1, -1], [-1, 1], [1, 1]]) {
        ctx.beginPath();
        ctx.moveTo(sx * hw * 0.8, sy * hh);
        ctx.lineTo(sx * (hw + 2), sy * (hh + 3));
        ctx.stroke();
      }
      ctx.fillStyle = '#a2915d';
      ctx.fillRect(-hw, -hh, hw * 2, hh);
      ctx.fillStyle = '#857647';
      ctx.fillRect(-hw, 0, hw * 2, hh);
      ctx.strokeStyle = '#5e5333';
      ctx.lineWidth = 1;
      ctx.strokeRect(-hw, -hh, hw * 2, hh * 2);
      ctx.beginPath();
      ctx.moveTo(-hw, 0);
      ctx.lineTo(hw, 0);
      ctx.stroke();
      this.medicalMark(0, -hh * 0.5);
      ctx.restore();
    }

    if (ui.selected.has(sq.id)) {
      ctx.strokeStyle = '#9dff7a';
      ctx.lineWidth = 1.2;
      ctx.beginPath();
      ctx.ellipse(x, y, r + 3, r + 2.5, 0, 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  /**
   * Tier buildings. Tiers 1 and 2: a barracks under nipa thatch (Maharlika) or
   * grey tiles (Imperial Army), with ammunition crates or an anti-tank gun by
   * the door. Tier 3: a corrugated iron motor pool shed with a wide door.
   */
  private drawTech(sq: Squad, ui: UIState): void {
    const { ctx } = this;
    const look = this.look(sq);
    const filipino = look.hq === 'bahay';
    const tier = Number(sq.def.id.slice(-1));
    const r = sq.def.radius;
    const { x, y } = sq.pos;
    const hw = r * 1.4;
    const hh = r * 0.9;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x - hw + 3, y - hh + 4, hw * 2, hh * 2);
    if (tier === 3) {
      // Corrugated iron roof, rusting at the edges, and the big door at the front.
      ctx.fillStyle = filipino ? '#8a8e8c' : '#7a7f80';
      ctx.fillRect(x - hw, y - hh, hw * 2, hh * 2);
      ctx.strokeStyle = 'rgba(40,44,46,0.45)';
      ctx.lineWidth = 0.8;
      for (let i = -hw + 2; i < hw; i += 2.2) {
        ctx.beginPath();
        ctx.moveTo(x + i, y - hh);
        ctx.lineTo(x + i, y + hh);
        ctx.stroke();
      }
      ctx.fillStyle = 'rgba(140,80,40,0.35)';
      ctx.fillRect(x - hw, y - hh, hw * 2, 2.5);
      ctx.fillRect(x - hw, y + hh - 2.5, hw * 2, 2.5);
      ctx.strokeStyle = '#3a3d3e';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - hw, y - hh, hw * 2, hh * 2);
      ctx.fillStyle = '#2a2c2c';
      ctx.fillRect(x - hw * 0.55, y + hh - 1, hw * 1.1, 3);
      // Oil stains on the apron.
      ctx.fillStyle = 'rgba(20,20,18,0.35)';
      ctx.beginPath();
      ctx.ellipse(x - 3, y + hh + 6, 4, 2, 0, 0, Math.PI * 2);
      ctx.ellipse(x + 5, y + hh + 5, 3, 1.6, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Barracks: a ridged roof, thatch or tiles.
      const roof = filipino ? ['#c4a868', '#a88f55'] : [look.roofLight, look.roofDark];
      ctx.fillStyle = roof[0];
      ctx.fillRect(x - hw, y - hh, hw * 2, hh);
      ctx.fillStyle = roof[1];
      ctx.fillRect(x - hw, y, hw * 2, hh);
      ctx.strokeStyle = filipino ? 'rgba(90,70,35,0.45)' : 'rgba(15,18,22,0.45)';
      ctx.lineWidth = 0.6;
      for (let i = -hw + 1.5; i < hw; i += filipino ? 1.8 : 2.6) {
        ctx.beginPath();
        ctx.moveTo(x + i, y - hh);
        ctx.lineTo(x + i, y + hh);
        ctx.stroke();
      }
      ctx.strokeStyle = filipino ? '#6f5a2f' : look.ridge;
      ctx.lineWidth = filipino ? 1.2 : 2;
      ctx.beginPath();
      ctx.moveTo(x - hw, y);
      ctx.lineTo(x + hw, y);
      ctx.stroke();
      ctx.strokeStyle = filipino ? '#5d4a26' : '#2e3338';
      ctx.lineWidth = 1;
      ctx.strokeRect(x - hw, y - hh, hw * 2, hh * 2);
      if (tier === 1) {
        // Ammunition crates stacked by the door.
        ctx.fillStyle = '#6b5a35';
        ctx.strokeStyle = '#3d331e';
        ctx.lineWidth = 0.6;
        for (const [cx, cy] of [[hw - 4, hh + 3], [hw - 10, hh + 3], [hw - 7, hh + 7]]) {
          ctx.fillRect(x + cx - 2.5, y + cy - 1.8, 5, 3.6);
          ctx.strokeRect(x + cx - 2.5, y + cy - 1.8, 5, 3.6);
        }
      } else {
        // A small anti-tank gun parked out front.
        ctx.fillStyle = '#3a3d33';
        ctx.fillRect(x - 4, y + hh + 3, 6, 4);
        ctx.strokeStyle = '#1c1d18';
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x + 2, y + hh + 5);
        ctx.lineTo(x + 11, y + hh + 5);
        ctx.moveTo(x - 4, y + hh + 6);
        ctx.lineTo(x - 10, y + hh + 9);
        ctx.moveTo(x - 4, y + hh + 6);
        ctx.lineTo(x - 10, y + hh + 3);
        ctx.stroke();
      }
    }
    // Once the army has a doctrine, its banner flies over the tier buildings.
    const doctrine = this.world.teams[sq.team].doctrine;
    if (doctrine && sq.building === null) this.drawBanner(DOCTRINES[doctrine], x + hw - 3, y - hh + 2);
    if (ui.selected.has(sq.id)) {
      ctx.strokeStyle = '#9dff7a';
      ctx.lineWidth = 1.4;
      ctx.strokeRect(x - hw - 3, y - hh - 3, hw * 2 + 6, hh * 2 + 6);
    }
  }

  /** Life inside the headquarters compound: a supply truck, stacked crates, a radio mast and gun posts. */
  private drawCompoundLife(sq: Squad, wall: number, filipino: boolean): void {
    const { ctx } = this;
    const { x, y } = sq.pos;
    const look = this.look(sq);
    // Supply truck parked inside the gate.
    ctx.save();
    ctx.translate(x - wall + 11, y + wall - 9);
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(-6, -2.5, 14, 7);
    ctx.fillStyle = look.hull;
    ctx.fillRect(-7, -3.5, 9, 7);
    ctx.fillStyle = filipino ? '#7c7a52' : '#8a7a4c';
    ctx.fillRect(2, -3, 5, 6);
    ctx.fillStyle = '#1d1d1a';
    ctx.fillRect(4.5, -2.4, 1.6, 4.8);
    ctx.restore();
    // Crates.
    ctx.strokeStyle = '#3d331e';
    ctx.lineWidth = 0.6;
    for (const [cx, cy] of [[wall - 9, wall - 8], [wall - 14, wall - 8], [wall - 11.5, wall - 12.5]]) {
      ctx.fillStyle = '#6b5a35';
      ctx.fillRect(x + cx - 2.4, y + cy - 2, 4.8, 4);
      ctx.strokeRect(x + cx - 2.4, y + cy - 2, 4.8, 4);
    }
    // Radio mast with guy wires.
    const mx = x - wall + 6;
    const my = y - wall + 6;
    ctx.strokeStyle = 'rgba(40,40,36,0.6)';
    ctx.lineWidth = 0.5;
    ctx.beginPath();
    for (const [dx, dy] of [[-4, -4], [4, -4], [-4, 4], [4, 4]]) {
      ctx.moveTo(mx, my);
      ctx.lineTo(mx + dx, my + dy);
    }
    ctx.stroke();
    ctx.fillStyle = '#2b2b27';
    ctx.beginPath();
    ctx.arc(mx, my, 1.4, 0, Math.PI * 2);
    ctx.fill();
    // Sandbagged gun posts at the two front corners.
    for (const side of [-1, 1]) {
      const gx = x + side * (wall - 4);
      const gy = y + wall - 4;
      ctx.fillStyle = filipino ? '#b09c70' : '#8a7550';
      for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        ctx.beginPath();
        ctx.ellipse(gx + Math.cos(a) * 3.2, gy + Math.sin(a) * 3.2, 1.8, 1.1, a + Math.PI / 2, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.strokeStyle = '#1c1c1a';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(gx, gy);
      ctx.lineTo(gx + side * 3, gy + 5);
      ctx.stroke();
    }
  }

  /** A doctrine banner on a pole: its field, stripe and emblem. */
  private drawBanner(d: DoctrineDef, x: number, y: number): void {
    const { ctx } = this;
    const wave = Math.sin(this.world.time * 3 + x) * 0.8;
    ctx.fillStyle = 'rgba(0,0,0,0.3)';
    ctx.fillRect(x + 1, y - 1, 2, 3);
    ctx.fillStyle = '#2b2620';
    ctx.fillRect(x - 0.7, y - 22, 1.4, 22);
    ctx.save();
    ctx.translate(x + 0.7, y - 22);
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(15, wave);
    ctx.lineTo(15, 10 + wave);
    ctx.lineTo(0, 10);
    ctx.closePath();
    ctx.fillStyle = d.field;
    ctx.fill();
    ctx.fillStyle = d.stripe;
    ctx.fillRect(0, 7.5 + wave * 0.5, 15, 2.5);
    ctx.strokeStyle = 'rgba(0,0,0,0.5)';
    ctx.lineWidth = 0.5;
    ctx.stroke();
    // Emblem.
    const ex = 7.5;
    const ey = 4 + wave * 0.5;
    switch (d.emblem) {
      case 'sun':
      case 'star':
        this.emblem(d.emblem, ex, ey, 2.4);
        break;
      case 'k':
        this.emblem('sun', ex, ey, 2.2);
        ctx.fillStyle = d.field;
        ctx.font = 'bold 3.5px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('K', ex, ey + 0.2);
        ctx.textBaseline = 'alphabetic';
        break;
      case 'shield':
        ctx.fillStyle = '#e0c34a';
        ctx.beginPath();
        ctx.moveTo(ex - 2.4, ey - 2.4);
        ctx.lineTo(ex + 2.4, ey - 2.4);
        ctx.lineTo(ex + 2.4, ey);
        ctx.lineTo(ex, ey + 2.8);
        ctx.lineTo(ex - 2.4, ey);
        ctx.closePath();
        ctx.fill();
        break;
      case 'wings':
        ctx.strokeStyle = '#f1ece0';
        ctx.lineWidth = 0.9;
        ctx.beginPath();
        ctx.moveTo(ex - 4, ey - 1);
        ctx.quadraticCurveTo(ex - 1.5, ey + 1, ex, ey);
        ctx.quadraticCurveTo(ex + 1.5, ey + 1, ex + 4, ey - 1);
        ctx.stroke();
        break;
      case 'leaf':
        ctx.fillStyle = '#9fae6a';
        ctx.beginPath();
        ctx.ellipse(ex, ey, 2.8, 1.4, -0.6, 0, Math.PI * 2);
        ctx.fill();
        break;
    }
    ctx.restore();
  }

  /** White patch with a red cross, on an aid station's roof. */
  private medicalMark(x: number, y: number): void {
    const { ctx } = this;
    ctx.fillStyle = '#e9e5d8';
    ctx.fillRect(x - 3.5, y - 3.5, 7, 7);
    ctx.fillStyle = '#b3261e';
    ctx.fillRect(x - 0.9, y - 2.5, 1.8, 5);
    ctx.fillRect(x - 2.5, y - 0.9, 5, 1.8);
  }

  private barrel(x: number, y: number, angle: number, length: number, color: string, width: number): void {
    const { ctx } = this;
    ctx.strokeStyle = color;
    ctx.lineWidth = width;
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x + Math.cos(angle) * length, y + Math.sin(angle) * length);
    ctx.stroke();
  }

  private drawProjectiles(): void {
    const { ctx, world } = this;
    for (const p of world.projectiles) {
      const k = p.t / p.flight;
      const x = p.from.x + (p.to.x - p.from.x) * k;
      const y = p.from.y + (p.to.y - p.from.y) * k;
      if (!this.visibleToPlayer({ x, y }) && !this.visibleToPlayer(p.to)) continue;
      const lift = p.arc ? Math.sin(Math.PI * k) * (p.weapon.projectile === 'grenade' ? 18 : 60) : 0;
      ctx.fillStyle = 'rgba(0,0,0,0.3)';
      ctx.beginPath();
      ctx.arc(x, y, 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = p.weapon.projectile === 'grenade' ? '#3b4a2a' : '#e8e0c8';
      ctx.beginPath();
      ctx.arc(x, y - lift, p.arc ? 2.6 : 2, 0, Math.PI * 2);
      ctx.fill();
      if (p.arc && p.weapon.indirect && k > 0.6 && this.visibleToPlayer(p.to)) {
        ctx.strokeStyle = `rgba(255,90,60,${(k - 0.6) * 1.5})`;
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(p.to.x, p.to.y, p.weapon.aoe, 0, Math.PI * 2);
        ctx.stroke();
      }
    }
  }

  private drawOrders(ui: UIState): void {
    const { ctx, world } = this;
    ctx.lineWidth = 1.4 / Math.max(0.6, this.camera.zoom);
    for (const sq of this.selectedOwn(ui)) {
      const pts: Vec2[] = [sq.pos, ...sq.path];
      const color = ORDER_COLOR[sq.order.kind];
      if (!color) continue;
      if (sq.order.kind === 'attack') {
        const t = world.get(sq.order.targetId);
        if (t) pts.push(t.pos);
      } else if (sq.order.dest && sq.path.length === 0) {
        pts.push(sq.order.dest);
      }
      for (const q of sq.queue) if (q.dest) pts.push(q.dest);
      if (pts.length < 2) continue;
      ctx.strokeStyle = color;
      ctx.globalAlpha = 0.75;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x, pts[0].y);
      for (const p of pts.slice(1)) ctx.lineTo(p.x, p.y);
      ctx.stroke();
      ctx.setLineDash([]);
      const end = pts[pts.length - 1];
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(end.x, end.y, 3, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
  }

  /** Cover preview: where each soldier would stand and how protected they'd be. */
  private drawCursorPreview(ui: UIState): void {
    const { ctx, world } = this;
    if (!ui.mouse.onCanvas || ui.drag || ui.faceDrag?.preview) return;
    const own = this.selectedOwn(ui);
    const cursor = ui.mouse.world;

    if (ui.mode.kind === 'ability') {
      const ab = ABILITIES[ui.mode.abilityId];
      const caster = own.find((s) => s.def.abilities.includes(ab.id));
      if (caster) {
        ctx.strokeStyle = 'rgba(201,162,255,0.4)';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.arc(caster.pos.x, caster.pos.y, ab.range, 0, Math.PI * 2);
        ctx.stroke();
      }
      const w = WEAPONS[ab.weapon];
      ctx.fillStyle = 'rgba(255,80,60,0.15)';
      ctx.strokeStyle = 'rgba(255,80,60,0.8)';
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, w.aoe + w.scatter * 0.6, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      return;
    }
    if (ui.mode.kind === 'callIn') {
      const c = CALL_INS[ui.mode.callInId];
      const e = c?.effect;
      const r = !e ? 30 : e.kind === 'barrage' ? e.scatter + WEAPONS[e.weapon].aoe : e.kind === 'recon' ? e.radius : e.kind === 'mines' ? e.radius : 34;
      ctx.strokeStyle = 'rgba(255,200,90,0.85)';
      ctx.fillStyle = 'rgba(255,200,90,0.08)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([7, 5]);
      ctx.beginPath();
      ctx.arc(cursor.x, cursor.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
      return;
    }
    if (ui.mode.kind === 'setup') {
      // Live preview of where the gun will cover once it is set up.
      for (const sq of own.filter((s) => s.def.kind === 'team')) {
        const w = crewWeapon(sq);
        if (w) this.drawReach(sq.pos, angleTo(sq.pos, cursor), w, 1);
      }
      return;
    }

    const infantry = own.find((s) => s.def.kind === 'infantry');
    if (!infantry || !world.map.worldPassable(cursor, 'infantry')) return;
    const n = aliveCount(infantry);
    const heading = angleTo(infantry.pos, cursor);
    const slots = Array.from({ length: n }, (_, i) => add(cursor, rotate(formationOffset(i, n), heading)));
    const spots = findCoverSpots(world.map, cursor, heading, slots);
    slots.forEach((slot, i) => {
      const s = spots[i];
      const pos = s ? s.pos : slot;
      const cover = s ? s.cover : coverAt(world.map, slot, null);
      ctx.fillStyle = COVER_COLOR[cover];
      ctx.strokeStyle = 'rgba(0,0,0,0.6)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, 3.2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    });
  }

  /**
   * Right-click drag preview: an arrow for the facing, and at each unit's
   * destination the ground its weapon will cover once it arrives.
   */
  private drawFaceDrag(ui: UIState): void {
    const preview = ui.faceDrag?.preview;
    if (!ui.faceDrag || !preview) return;
    const { ctx } = this;
    const from = ui.faceDrag.from;
    const tip = add(from, fromAngle(preview.facing, 60));
    ctx.strokeStyle = '#9be29b';
    ctx.fillStyle = '#9be29b';
    ctx.lineWidth = 2.5 / Math.max(0.6, this.camera.zoom);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
    const head = [add(tip, fromAngle(preview.facing + 2.6, 12)), add(tip, fromAngle(preview.facing - 2.6, 12))];
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(head[0].x, head[0].y);
    ctx.lineTo(head[1].x, head[1].y);
    ctx.closePath();
    ctx.fill();

    for (const t of preview.targets) {
      const sq = this.world.get(t.id);
      if (!sq) continue;
      const w = crewWeapon(sq);
      if (w) this.drawReach(t.pos, preview.facing, w, 1);
      else this.drawFacingMarker(t.pos, preview.facing);
    }
  }

  /** Your construction sites and mines (never the enemy's), plus the placement preview. */
  private drawEngineering(ui: UIState): void {
    const { ctx, world } = this;
    const lw = 1.5 / Math.max(0.6, this.camera.zoom);
    for (const c of world.constructions) {
      if (c.team !== this.player && !this.spectator) continue;
      const current = c.tiles.find((t) => !t.done);
      for (const t of c.tiles) {
        if (t.done) continue;
        const x = t.tx * TILE;
        const y = t.ty * TILE;
        ctx.strokeStyle = 'rgba(240,210,120,0.85)';
        ctx.lineWidth = lw;
        ctx.setLineDash([3, 3]);
        ctx.strokeRect(x + 1, y + 1, TILE - 2, TILE - 2);
        ctx.setLineDash([]);
        if (t === current && t.progress > 0) {
          ctx.fillStyle = 'rgba(240,210,120,0.45)';
          ctx.fillRect(x + 1, y + TILE - 1 - (TILE - 2) * t.progress, TILE - 2, (TILE - 2) * t.progress);
        }
      }
    }
    this.drawDefenseHealth(ui, lw);
    for (const m of world.mines) {
      if (m.team !== this.player && !this.spectator) continue;
      ctx.fillStyle = 'rgba(20,20,18,0.85)';
      ctx.strokeStyle = TEAM[m.team].main;
      ctx.lineWidth = lw;
      ctx.beginPath();
      ctx.arc(m.pos.x, m.pos.y, 4.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    }
    if (ui.mode.kind !== 'build' || !ui.mouse.onCanvas) return;
    const plan = planBuild(world, ui.mode.buildId, ui.buildFrom ?? ui.mouse.world, ui.mouse.world);
    for (const t of plan.tiles) {
      ctx.fillStyle = t.valid ? 'rgba(120,230,120,0.35)' : 'rgba(240,80,60,0.35)';
      ctx.strokeStyle = t.valid ? 'rgba(120,230,120,0.9)' : 'rgba(240,80,60,0.9)';
      ctx.lineWidth = lw;
      ctx.fillRect(t.tx * TILE, t.ty * TILE, TILE, TILE);
      ctx.strokeRect(t.tx * TILE + 0.5, t.ty * TILE + 0.5, TILE - 1, TILE - 1);
    }
    // Structures: show what the finished one will cover. Guns cover a wedge in front,
    // facing the way you drag (or away from headquarters); aid stations a circle.
    const def = BUILDABLES[ui.mode.buildId];
    const tile = plan.tiles[0];
    if (def.shape === 'structure' && tile) {
      const unit = UNITS[def.unit!];
      const xs = plan.tiles.map((k) => k.tx);
      const ys = plan.tiles.map((k) => k.ty);
      const center = { x: ((Math.min(...xs) + Math.max(...xs) + 1) / 2) * TILE, y: ((Math.min(...ys) + Math.max(...ys) + 1) / 2) * TILE };
      const guns = unit.loadout.flatMap((l) => l.weapons.map((w) => WEAPONS[w]));
      const reach = unit.healRadius || Math.max(0, ...guns.map((w) => w.range));
      const arc = guns.length ? Math.max(...guns.map((w) => w.arc)) : 360;
      const from = ui.buildFrom ?? ui.mouse.world;
      const dragged = ui.buildFrom && Math.hypot(ui.mouse.world.x - from.x, ui.mouse.world.y - from.y) > TILE * 0.75;
      const hq = world.hqOf(this.player);
      const facing = dragged ? angleTo(from, ui.mouse.world) : hq ? angleTo(hq.pos, center) : 0;
      ctx.strokeStyle = tile.valid ? 'rgba(120,230,120,0.6)' : 'rgba(240,80,60,0.6)';
      ctx.fillStyle = tile.valid ? 'rgba(120,230,120,0.08)' : 'rgba(240,80,60,0.06)';
      ctx.lineWidth = lw;
      ctx.setLineDash([6, 5]);
      ctx.beginPath();
      if (arc < 360 && reach > 0) {
        const half = (arc * Math.PI) / 360;
        ctx.moveTo(center.x, center.y);
        ctx.arc(center.x, center.y, reach, facing - half, facing + half);
        ctx.closePath();
      } else if (reach > 0) {
        ctx.arc(center.x, center.y, reach, 0, Math.PI * 2);
      }
      ctx.fill();
      ctx.stroke();
      ctx.setLineDash([]);
    }
  }

  /** Health bars on damaged defenses we can see, and an outline on the one being inspected. */
  private drawDefenseHealth(ui: UIState, lw: number): void {
    const { ctx, world } = this;
    const bar = (tx: number, ty: number, frac: number) => {
      const x = tx * TILE + 1;
      const y = ty * TILE - 4;
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillRect(x - 0.5, y - 0.5, TILE - 1, 3.5);
      ctx.fillStyle = frac > 0.5 ? '#8fd16a' : frac > 0.25 ? '#e0b640' : '#e0573e';
      ctx.fillRect(x, y, (TILE - 2) * frac, 2.5);
    };
    for (const [idx, hp] of world.defenseHp) {
      const tx = idx % world.map.w;
      const ty = Math.floor(idx / world.map.w);
      const d = defenseAt(world, tx, ty);
      if (!d || (!this.spectator && !world.vision.isVisible(this.player, world.map.tileCenter(tx, ty)))) continue;
      bar(tx, ty, hp / d.maxHp);
    }
    const ins = ui.inspect;
    if (ins?.kind === 'defense') {
      const d = defenseAt(world, ins.tx, ins.ty);
      if (d) {
        ctx.strokeStyle = 'rgba(255,230,140,0.95)';
        ctx.lineWidth = lw * 1.4;
        ctx.strokeRect(ins.tx * TILE + 0.5, ins.ty * TILE + 0.5, TILE - 1, TILE - 1);
        bar(ins.tx, ins.ty, d.hp / d.maxHp);
      }
    }
  }

  /** Cost of the defense being placed, next to the cursor. */
  private drawBuildCost(ui: UIState): void {
    if (ui.mode.kind === 'repair' && ui.mouse.onCanvas) {
      this.cursorLabel(ui, 'Repair · click a damaged tank, HQ or defense', '#cfe8ff');
      return;
    }
    if (ui.mode.kind !== 'build' || !ui.mouse.onCanvas) return;
    const def = BUILDABLES[ui.mode.buildId];
    const plan = planBuild(this.world, ui.mode.buildId, ui.buildFrom ?? ui.mouse.world, ui.mouse.world);
    const n = plan.tiles.filter((t) => t.valid).length;
    const parts = [];
    if (plan.cost.manpower) parts.push(`${plan.cost.manpower} MP`);
    if (plan.cost.munitions) parts.push(`${plan.cost.munitions} MU`);
    const text = `${def.name}${def.shape === 'line' ? ` ×${n}` : ''} · ${parts.join(' ') || 'free'}`;
    const { ctx } = this;
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    const x = ui.mouse.x + 16;
    const y = ui.mouse.y + 26;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 4, y - 13, ctx.measureText(text).width + 8, 18);
    ctx.fillStyle = n > 0 ? '#e9f5d0' : '#ff9a8a';
    ctx.fillText(text, x, y);
  }

  private cursorLabel(ui: UIState, text: string, color: string): void {
    const { ctx } = this;
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'left';
    const x = ui.mouse.x + 16;
    const y = ui.mouse.y + 26;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.fillRect(x - 4, y - 13, ctx.measureText(text).width + 8, 18);
    ctx.fillStyle = color;
    ctx.fillText(text, x, y);
  }

  /** A weapon's coverage: a firing cone for arc-limited guns, a range ring (with dead zone) otherwise. */
  private drawReach(pos: Vec2, facing: number, w: WeaponDef, alpha: number): void {
    const { ctx } = this;
    ctx.lineWidth = 1.5 / Math.max(0.6, this.camera.zoom);
    if (w.arc < 360) {
      const half = (w.arc * Math.PI) / 360;
      ctx.fillStyle = `rgba(255,220,110,${0.16 * alpha})`;
      ctx.strokeStyle = `rgba(255,220,110,${0.85 * alpha})`;
      ctx.beginPath();
      ctx.moveTo(pos.x, pos.y);
      ctx.arc(pos.x, pos.y, w.range, facing - half, facing + half);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      return;
    }
    ctx.strokeStyle = `rgba(255,220,110,${0.75 * alpha})`;
    ctx.setLineDash([8, 6]);
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, w.range, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);
    if (w.minRange > 0) {
      ctx.fillStyle = `rgba(255,90,60,${0.12 * alpha})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, w.minRange, 0, Math.PI * 2);
      ctx.fill();
    }
    this.drawFacingMarker(pos, facing);
  }

  private drawFacingMarker(pos: Vec2, facing: number): void {
    const { ctx } = this;
    const tip = add(pos, fromAngle(facing, 16));
    ctx.fillStyle = 'rgba(155,226,155,0.9)';
    ctx.beginPath();
    ctx.arc(pos.x, pos.y, 3.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = 'rgba(155,226,155,0.9)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(pos.x, pos.y);
    ctx.lineTo(tip.x, tip.y);
    ctx.stroke();
  }

  // ─── Screen-space unit HUD ────────────────────────────────────

  private drawSquadHud(sq: Squad, ui: UIState): void {
    const { ctx, camera } = this;
    let top = Infinity;
    for (const m of sq.models) if (m.alive) top = Math.min(top, m.pos.y);
    const anchor = camera.worldToScreen({ x: sq.pos.x, y: top - sq.def.radius });
    const x = Math.round(anchor.x);
    const y = Math.round(anchor.y - 12);
    const col = TEAM[sq.team];
    const selected = ui.selected.has(sq.id);

    // A small team-coloured plate with the unit's icon.
    const bw = 18;
    ctx.fillStyle = selected ? col.light : col.main;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.roundRect(x - bw / 2, y - 20, bw, 16, 2);
    ctx.fill();
    ctx.stroke();
    ctx.strokeStyle = '#10151c';
    drawIcon(ctx, unitIcon(sq.def), x, y - 12, 13, 'rgba(16,21,28,0.5)');
    if (sq.vet > 0) {
      ctx.font = 'bold 9px "Segoe UI", system-ui, sans-serif';
      ctx.fillStyle = '#ffd766';
      ctx.textAlign = 'left';
      ctx.fillText('★'.repeat(sq.vet), x + bw / 2 + 2, y - 8);
    }

    const barW = 26;
    if (sq.def.kind === 'infantry' || sq.def.kind === 'team') {
      const n = sq.def.models;
      const alive = aliveCount(sq);
      const pip = Math.min(5, (barW - (n - 1)) / n);
      const total = n * pip + (n - 1);
      for (let i = 0; i < n; i++) {
        ctx.fillStyle = i < alive ? '#e8e8e8' : 'rgba(0,0,0,0.5)';
        ctx.fillRect(x - total / 2 + i * (pip + 1), y - 2, pip, 3);
      }
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - barW / 2, y + 2, barW, 2);
      ctx.fillStyle = '#7fd66b';
      ctx.fillRect(x - barW / 2, y + 2, barW * healthFraction(sq), 2);
    } else {
      const f = healthFraction(sq);
      const w = sq.def.kind === 'structure' ? 50 : barW;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - w / 2, y - 2, w, 4);
      ctx.fillStyle = f > 0.5 ? '#7fd66b' : f > 0.25 ? '#f2c94c' : '#ff5a4a';
      ctx.fillRect(x - w / 2, y - 2, w * f, 4);
    }
    if (sq.suppression > 0.03) {
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillRect(x - barW / 2, y + 5, barW, 2);
      ctx.fillStyle = sq.suppState === 'pinned' ? '#ff4a3a' : '#ffd23a';
      ctx.fillRect(x - barW / 2, y + 5, barW * sq.suppression, 2);
    }

    if (sq.team !== this.player || this.spectator) return;
    let status = '';
    if (sq.retreating) status = 'RETREATING';
    else if (sq.suppState === 'pinned') status = 'PINNED';
    else if (sq.reinforcing) status = 'REINFORCING';
    else if (sq.setup === 'settingUp') status = 'SETTING UP';
    else if (sq.setup === 'tearingDown') status = 'PACKING UP';
    else if (sq.channel) status = ABILITIES[sq.channel.abilityId].name.toUpperCase();
    else if (sq.production.length > 0) status = `BUILDING ${Math.ceil(sq.production[0].remaining)}s`;
    if (status) {
      ctx.font = 'bold 8px "Segoe UI", system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.fillStyle = 'rgba(0,0,0,0.7)';
      ctx.fillText(status, x + 1, y - 19);
      ctx.fillStyle = sq.retreating || sq.suppState === 'pinned' ? '#ffcf5c' : '#d9e8ff';
      ctx.fillText(status, x, y - 20);
    }
  }
}

/** The crew-served weapon a team fires once set up, if any. */
function crewWeapon(sq: Squad): WeaponDef | null {
  for (const m of sq.models) for (const w of m.weapons) if (w.def.crew) return w.def;
  return null;
}
