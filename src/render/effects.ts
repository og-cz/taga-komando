import type { TeamId } from '../data/types';
import { dist, type Vec2 } from '../core/vec';
import type { SimEvent, Tone } from '../sim/entities';
import type { Camera } from './camera';

interface Tracer { from: Vec2; to: Vec2; life: number; max: number; heavy: boolean; team: TeamId }
/** Weapons whose round explodes on impact, with the size of the burst. */
export const IMPACT_BLAST: Readonly<Record<string, number>> = { bazooka: 16, m6_37mm: 11, type97_57mm: 14 };

interface Shell { from: Vec2; to: Vec2; t: number; flight: number; kind: 'shell' | 'rocket'; blast: number }
interface Blast { pos: Vec2; radius: number; life: number }
interface Smoke { pos: Vec2; r: number; life: number; max: number; drift: Vec2 }
interface Mark { pos: Vec2; life: number; wreck: boolean; heading: number }
interface Floater { pos: Vec2; text: string; tone: Tone; life: number }
interface Flash { pos: Vec2; life: number }
/** A clod of earth or splinter thrown up by a blast, falling back down. */
interface Debris { x: number; y: number; z: number; vx: number; vy: number; vz: number; life: number; size: number; dark: boolean }
/** The pressure ring of a blast. */
interface Ring { pos: Vec2; r: number; max: number; life: number }
/** Scorched earth and track prints left on the ground. */
interface Decal { pos: Vec2; life: number; max: number; kind: 'scorch' | 'track'; r: number; heading: number }

const TONE_COLOR: Record<Tone, string> = { info: '#f2f2f2', good: '#8ef58e', bad: '#ffb35c' };

/** Purely cosmetic effects driven by simulation events. Never feeds back into gameplay. */
export class Effects {
  private tracers: Tracer[] = [];
  private shells: Shell[] = [];
  private blasts: Blast[] = [];
  private smokes: Smoke[] = [];
  private marks: Mark[] = [];
  private floats: Floater[] = [];
  private flashes: Flash[] = [];
  private debris: Debris[] = [];
  private rings: Ring[] = [];
  private decals: Decal[] = [];
  /** Screen shake from blasts near the camera, in screen pixels; the renderer applies it. */
  shake = 0;
  /** The 3D battlefield draws tracers and muzzle flashes itself. */
  shotsIn3d = false;

  consume(events: readonly SimEvent[], visible: (p: Vec2) => boolean): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          if (!visible(e.from) && !visible(e.to)) break;
          if (e.projectile === 'shell' || e.projectile === 'rocket') {
            this.shells.push({ from: e.from, to: e.to, t: 0, flight: Math.max(0.08, dist(e.from, e.to) / 900), kind: e.projectile, blast: IMPACT_BLAST[e.weapon] ?? 0 });
            this.flashes.push({ pos: e.from, life: 0.12 });
            this.smokes.push({ pos: { ...e.from }, r: 6, life: 1.2, max: 1.2, drift: { x: 0, y: -4 } });
          } else if (!this.shotsIn3d) {
            this.tracers.push({ from: e.from, to: e.to, life: 0.07, max: 0.07, heavy: false, team: e.team });
            this.flashes.push({ pos: e.from, life: 0.05 });
          }
          break;
        }
        case 'launch':
          if (visible(e.from)) this.flashes.push({ pos: e.from, life: 0.15 });
          break;
        case 'explosion':
          if (!visible(e.pos)) break;
          this.blow(e.pos, Math.max(14, e.radius));
          this.blasts.push({ pos: e.pos, radius: Math.max(14, e.radius), life: 0.45 });
          for (let i = 0; i < 4; i++) {
            const a = Math.random() * Math.PI * 2;
            this.smokes.push({
              pos: { x: e.pos.x + Math.cos(a) * 6, y: e.pos.y + Math.sin(a) * 6 },
              r: e.radius * 0.5 + 4,
              life: 2.5,
              max: 2.5,
              drift: { x: Math.cos(a) * 5, y: Math.sin(a) * 5 - 4 },
            });
          }
          break;
        case 'death':
          this.marks.push({ pos: e.pos, life: e.vehicle ? 90 : 25, wreck: e.vehicle, heading: e.heading });
          if (e.vehicle) {
            this.blasts.push({ pos: e.pos, radius: 34, life: 0.7 });
            this.blow(e.pos, 30);
            // A burning wreck: smoke keeps rising for a while.
            for (let i = 0; i < 8; i++) {
              this.smokes.push({ pos: { x: e.pos.x + (Math.random() - 0.5) * 10, y: e.pos.y + (Math.random() - 0.5) * 10 }, r: 6 + i, life: 4 + i * 0.6, max: 4 + i * 0.6, drift: { x: (Math.random() - 0.5) * 4, y: -6 - Math.random() * 4 } });
            }
          }
          break;
        case 'float':
          if (visible(e.pos)) this.floats.push({ pos: { ...e.pos }, text: e.text, tone: e.tone, life: 1.6 });
          break;
        case 'notify':
          break;
      }
    }
  }

  /** The parts of a blast every explosion shares: ring, flying earth, scorch mark, shake. */
  private blow(pos: Vec2, radius: number): void {
    this.rings.push({ pos: { ...pos }, r: radius * 0.3, max: radius * 1.6, life: 0.4 });
    const n = Math.min(26, 6 + Math.round(radius / 2));
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = 30 + Math.random() * radius * 3;
      this.debris.push({ x: pos.x, y: pos.y, z: 0, vx: Math.cos(a) * v, vy: Math.sin(a) * v, vz: 40 + Math.random() * 90, life: 1.6, size: 0.8 + Math.random() * 1.6, dark: Math.random() < 0.7 });
    }
    this.decals.push({ pos: { ...pos }, life: 40, max: 40, kind: 'scorch', r: radius * 0.75, heading: Math.random() * Math.PI });
    this.shake = Math.min(9, this.shake + radius / 9);
  }

  /** A tank's track prints, left behind as it drives. */
  track(pos: Vec2, heading: number): void {
    this.decals.push({ pos: { ...pos }, life: 18, max: 18, kind: 'track', r: 0, heading });
    if (this.decals.length > 900) this.decals.splice(0, this.decals.length - 900);
  }

  /** A small explosion: flash, then smoke drifting off. */
  private burst(pos: Vec2, radius: number): void {
    this.blow(pos, radius);
    this.blasts.push({ pos: { ...pos }, radius, life: 0.35 });
    for (let i = 0; i < 3; i++) {
      const a = Math.random() * Math.PI * 2;
      this.smokes.push({
        pos: { x: pos.x + Math.cos(a) * 3, y: pos.y + Math.sin(a) * 3 },
        r: radius * 0.45 + 2,
        life: 1.6,
        max: 1.6,
        drift: { x: Math.cos(a) * 4, y: Math.sin(a) * 4 - 3 },
      });
    }
  }

  puff(pos: Vec2): void {
    this.smokes.push({ pos: { x: pos.x, y: pos.y }, r: 4, life: 2, max: 2, drift: { x: 3, y: -7 } });
  }

  update(dt: number): void {
    const tick = <T extends { life: number }>(arr: T[]) => arr.filter((x) => (x.life -= dt) > 0);
    this.tracers = tick(this.tracers);
    this.blasts = tick(this.blasts);
    this.marks = tick(this.marks);
    this.floats = tick(this.floats);
    this.flashes = tick(this.flashes);
    this.smokes = tick(this.smokes);
    for (const s of this.smokes) {
      s.pos.x += s.drift.x * dt;
      s.pos.y += s.drift.y * dt;
      s.r += 6 * dt;
    }
    for (const f of this.floats) f.pos.y -= 14 * dt;
    this.rings = tick(this.rings);
    this.decals = tick(this.decals);
    this.debris = tick(this.debris);
    for (const d of this.debris) {
      d.x += d.vx * dt;
      d.y += d.vy * dt;
      d.z += d.vz * dt;
      d.vz -= 260 * dt;
      if (d.z <= 0) {
        // Landed: it stays put and fades.
        d.z = 0;
        d.vx *= 0.2;
        d.vy *= 0.2;
        d.vz = 0;
        d.life = Math.min(d.life, 0.6);
      }
    }
    this.shake = Math.max(0, this.shake - dt * 18);
    this.shells = this.shells.filter((s) => {
      s.t += dt;
      if (s.t < s.flight) return true;
      // Rockets and high-explosive shells burst where they land.
      if (s.blast > 0) this.burst(s.to, s.blast);
      return false;
    });
  }

  /** Ground-level marks drawn beneath units. */
  drawGround(ctx: CanvasRenderingContext2D): void {
    for (const d of this.decals) {
      const a = Math.min(1, d.life / (d.max * 0.4));
      if (d.kind === 'scorch') {
        ctx.fillStyle = `rgba(22,18,14,${0.45 * a})`;
        ctx.beginPath();
        ctx.ellipse(d.pos.x, d.pos.y, d.r, d.r * 0.8, d.heading, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = `rgba(10,8,6,${0.35 * a})`;
        ctx.beginPath();
        ctx.ellipse(d.pos.x, d.pos.y, d.r * 0.45, d.r * 0.35, d.heading, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.save();
        ctx.translate(d.pos.x, d.pos.y);
        ctx.rotate(d.heading);
        ctx.fillStyle = `rgba(40,32,22,${0.32 * a})`;
        ctx.fillRect(-2, -8, 4, 3);
        ctx.fillRect(-2, 5, 4, 3);
        ctx.restore();
      }
    }
    for (const m of this.marks) {
      const a = Math.min(1, m.life / 5);
      if (m.wreck) {
        ctx.save();
        ctx.translate(m.pos.x, m.pos.y);
        ctx.rotate(m.heading);
        ctx.globalAlpha = a;
        ctx.fillStyle = '#1d1a17';
        ctx.fillRect(-15, -9, 30, 18);
        ctx.fillStyle = '#3a332c';
        ctx.fillRect(-6, -5, 12, 10);
        ctx.restore();
      } else {
        ctx.fillStyle = `rgba(40,25,20,${0.45 * a})`;
        ctx.beginPath();
        ctx.arc(m.pos.x, m.pos.y, 3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  drawAir(ctx: CanvasRenderingContext2D): void {
    for (const t of this.tracers) {
      ctx.strokeStyle = t.team === 0 ? 'rgba(255,240,170,0.8)' : 'rgba(255,210,150,0.8)';
      ctx.lineWidth = 0.9;
      ctx.beginPath();
      ctx.moveTo(t.from.x, t.from.y);
      ctx.lineTo(t.to.x, t.to.y);
      ctx.stroke();
    }
    for (const s of this.shells) {
      const k = s.t / s.flight;
      const x = s.from.x + (s.to.x - s.from.x) * k;
      const y = s.from.y + (s.to.y - s.from.y) * k;
      ctx.fillStyle = s.kind === 'rocket' ? '#ffcf6b' : '#fff3c4';
      ctx.beginPath();
      ctx.arc(x, y, 2.2, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const f of this.flashes) {
      ctx.fillStyle = `rgba(255,220,120,${Math.min(1, f.life * 8)})`;
      ctx.beginPath();
      ctx.arc(f.pos.x, f.pos.y, 3.5, 0, Math.PI * 2);
      ctx.fill();
    }
    for (const b of this.blasts) {
      const k = 1 - b.life / 0.45;
      ctx.fillStyle = `rgba(255,${Math.round(180 - k * 120)},60,${Math.max(0, 0.75 - k * 0.75)})`;
      ctx.beginPath();
      ctx.arc(b.pos.x, b.pos.y, b.radius * (0.4 + k * 0.8), 0, Math.PI * 2);
      ctx.fill();
    }
    for (const r of this.rings) {
      const k = 1 - r.life / 0.4;
      ctx.strokeStyle = `rgba(255,235,200,${0.45 * (1 - k)})`;
      ctx.lineWidth = 2 * (1 - k) + 0.5;
      ctx.beginPath();
      ctx.arc(r.pos.x, r.pos.y, r.r + (r.max - r.r) * k, 0, Math.PI * 2);
      ctx.stroke();
    }
    for (const d of this.debris) {
      ctx.fillStyle = d.dark ? `rgba(48,38,26,${Math.min(1, d.life * 2)})` : `rgba(150,120,80,${Math.min(1, d.life * 2)})`;
      ctx.fillRect(d.x - d.size / 2, d.y - d.z * 0.35 - d.size / 2, d.size, d.size);
    }
    for (const s of this.smokes) {
      ctx.fillStyle = `rgba(70,70,70,${0.35 * (s.life / s.max)})`;
      ctx.beginPath();
      ctx.arc(s.pos.x, s.pos.y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  /** Floating combat text, drawn in screen space so it stays readable at any zoom. */
  drawText(ctx: CanvasRenderingContext2D, camera: Camera): void {
    ctx.font = '600 12px "Segoe UI", system-ui, sans-serif';
    ctx.textAlign = 'center';
    for (const f of this.floats) {
      const p = camera.worldToScreen(f.pos);
      ctx.globalAlpha = Math.min(1, f.life / 0.5);
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.fillText(f.text, p.x + 1, p.y - 23);
      ctx.fillStyle = TONE_COLOR[f.tone];
      ctx.fillText(f.text, p.x, p.y - 24);
    }
    ctx.globalAlpha = 1;
  }
}
