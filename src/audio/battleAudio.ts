import type { TeamId } from '../data/types';
import type { Camera } from '../render/camera';
import type { Acknowledgement } from '../input/input';
import type { SimEvent, Squad } from '../sim/entities';
import type { World } from '../sim/world';
import { audio, type Loop } from './audio';
import { BIRDS, BLAST, COLLAPSE, DEFAULT_BLAST, DISTANT_GUNS, ENGINE, FIRE, FIRE_LOOP, IMPACT, SMOKE_POP, WIND_LOOP, WRECK, type SoundSpec } from './sounds';

/** Weapons whose throw or launch makes no firing sound of its own (grenades). */
const SILENT_LAUNCH = new Set(['mk2_grenade', 'type97_grenade', 'smoke_grenade_us', 'smoke_grenade_ija']);

/**
 * Battle sounds, heard from the camera: loud near the middle of the screen,
 * fading out past its edges, panned left and right, and quieter zoomed out.
 * Only what the player can see (or hear from their own units) plays.
 */
export class BattleAudio {
  private readonly engines = new Map<number, Loop>();
  private fireLoop: Loop | null = null;
  private windLoop: Loop | null = null;
  /** How much fighting is going on on screen, 0..1: birds keep quiet while it is high. */
  private din = 0;
  private birdsIn = 6;
  private gunsIn = 20;
  private last = performance.now();

  constructor(
    private readonly world: World,
    private readonly camera: Camera,
    private readonly player: TeamId,
  ) {}

  /** Where a sound at `p` sits for the listener: loudness 0..1 and pan -1..1. */
  private place(p: { x: number; y: number }): { gain: number; pan: number } {
    const c = this.camera;
    const s = c.worldToScreen(p);
    const halfW = c.viewW / 2;
    const halfH = c.viewH / 2;
    const dx = (s.x - halfW) / halfW;
    const dy = (s.y - halfH) / halfH;
    const d = Math.hypot(dx, dy * 0.8);
    const falloff = d <= 0.6 ? 1 : Math.max(0, 1 - (d - 0.6) / 1.2);
    const zoom = Math.min(1.15, Math.max(0.55, c.zoom / 1.4));
    return { gain: falloff * zoom, pan: Math.max(-1, Math.min(1, dx * 0.8)) };
  }

  private heard(p: { x: number; y: number }, team: TeamId): boolean {
    return team === this.player || this.world.vision.isVisible(this.player, p);
  }

  private emit(spec: SoundSpec, p: { x: number; y: number }, scale = 1): void {
    const { gain, pan } = this.place(p);
    audio.play(spec.name, spec.gain * gain * scale, pan, spec.gap);
  }

  consume(events: readonly SimEvent[]): void {
    for (const e of events) {
      switch (e.type) {
        case 'shot': {
          if (this.place(e.from).gain > 0.2) this.din = Math.min(1, this.din + 0.04);
          const spec = FIRE[e.weapon];
          if (spec && this.heard(e.from, e.team)) this.emit(spec, e.from);
          // Rockets and HE shells go off where they land, a moment later.
          const blast = IMPACT[e.weapon];
          if (blast && (this.heard(e.to, e.team) || this.heard(e.from, e.team))) {
            const to = { ...e.to };
            window.setTimeout(() => this.emit(blast, to), Math.max(80, (Math.hypot(e.to.x - e.from.x, e.to.y - e.from.y) / 900) * 1000));
          }
          break;
        }
        case 'launch': {
          const spec = FIRE[e.weapon];
          if (spec && !SILENT_LAUNCH.has(e.weapon) && this.heard(e.from, e.team)) this.emit(spec, e.from);
          break;
        }
        case 'explosion':
          this.din = Math.min(1, this.din + 0.15);
          this.emit(BLAST[e.weapon] ?? DEFAULT_BLAST, e.pos);
          break;
        case 'collapse':
          if (this.world.vision.isVisible(this.player, e.pos)) this.emit(COLLAPSE, e.pos);
          break;
        case 'smoke':
          if (this.world.vision.isVisible(this.player, e.pos)) this.emit(SMOKE_POP, e.pos);
          break;
        case 'death':
          if (e.vehicle) this.emit(WRECK, e.pos);
          break;
        default:
          break;
      }
    }
  }

  /**
   * The selected units answer a selection or an order. A voice line is used when
   * one exists for the faction (clips named voice_<faction>_<select|order|retreat>_N.ogg);
   * otherwise field sounds: gear rattling for infantry (heavier when they fall back),
   * mechanical clanks for weapon teams, an engine rev for tanks and the crank field
   * telephone for headquarters.
   */
  acknowledge(kind: Acknowledgement, squads: readonly Squad[]): void {
    const lead = squads.find((s) => s.def.kind !== 'structure') ?? squads[0];
    if (!lead) return;
    const faction = this.world.teams[lead.team].faction.id;
    // Tank crews have their own lines (voice_<faction>_tank_<kind>); everyone else shares the squad lines.
    const crew = `voice_${faction}_tank_${kind}`;
    const voice = lead.def.kind === 'vehicle' && audio.has(crew) ? crew : `voice_${faction}_${kind}`;
    if (lead.def.kind !== 'structure' && audio.has(voice)) {
      audio.play(voice, 0.9, 0, 0.6);
      return;
    }
    if (kind === 'retreat') {
      audio.play('gear', 0.6, 0, 0.2);
      audio.play('gear', 0.45, 0, 0);
      return;
    }
    switch (lead.def.kind) {
      case 'structure':
        // The HQ answers on the field telephone; nests and bunkers with a rattle of the gun.
        if (lead.def.role === 'hq') audio.play('phone', 0.35, 0, 0.6);
        else audio.play('clank', 0.45, 0, 0.25);
        break;
      case 'vehicle':
        audio.play('tank_rev', kind === 'select' ? 0.3 : 0.45, 0, 0.6);
        break;
      case 'team':
        audio.play('clank', 0.5, 0, 0.25);
        break;
      default:
        audio.play('gear', kind === 'order' ? 0.55 : 0.45, 0, 0.25);
    }
  }

  /**
   * The world around the fighting: burning houses roar and crackle, the wind
   * blows, birds call when it goes quiet, and guns thump far off now and then.
   */
  private ambience(dt: number): void {
    // Fires: one loop, as loud as the burning houses on screen, leaning towards them.
    let sum = 0;
    let lean = 0;
    for (const h of this.world.houses) {
      if (h.stage !== 2 || !this.world.vision.isVisible(this.player, h.center)) continue;
      const { gain, pan } = this.place(h.center);
      sum += gain;
      lean += gain * pan;
    }
    if (sum > 0.02 && !this.fireLoop) this.fireLoop = audio.loop(FIRE_LOOP);
    this.fireLoop?.set(Math.min(0.45, sum * 0.22), sum > 0 ? lean / sum : 0, 1);
    // Wind under everything, a little stronger zoomed out.
    this.windLoop ??= audio.loop(WIND_LOOP);
    this.windLoop?.set(0.07 + 0.05 * Math.max(0, 1 - this.camera.zoom / 1.4), 0, 1);
    this.din = Math.max(0, this.din - dt * 0.08);
    this.birdsIn -= dt;
    if (this.birdsIn <= 0) {
      this.birdsIn = 7 + Math.random() * 12;
      if (this.din < 0.5) audio.play(BIRDS.name, BIRDS.gain * (1 - this.din * 1.6), (Math.random() - 0.5) * 1.4, BIRDS.gap);
    }
    this.gunsIn -= dt;
    if (this.gunsIn <= 0) {
      this.gunsIn = 22 + Math.random() * 40;
      audio.play(DISTANT_GUNS.name, DISTANT_GUNS.gain * (0.6 + Math.random() * 0.4), (Math.random() - 0.5) * 1.6, DISTANT_GUNS.gap);
    }
  }

  /** Engine noise for vehicles on screen: a low idle, louder and higher while moving. */
  update(): void {
    const now = performance.now();
    const dt = Math.min(0.25, (now - this.last) / 1000);
    this.last = now;
    this.ambience(dt);
    const seen = new Set<number>();
    for (const sq of this.world.squads) {
      if (sq.dead || sq.def.kind !== 'vehicle' || !this.heard(sq.pos, sq.team)) continue;
      const { gain, pan } = this.place(sq.pos);
      if (gain < 0.03) continue;
      seen.add(sq.id);
      let loop = this.engines.get(sq.id);
      if (!loop) {
        const made = audio.loop(ENGINE);
        if (!made) continue;
        loop = made;
        this.engines.set(sq.id, loop);
      }
      const speed = Math.abs(sq.speedNow) / Math.max(1, sq.def.speed);
      loop.set(gain * (0.12 + 0.3 * speed), pan, 0.85 + 0.35 * speed);
    }
    for (const [id, loop] of this.engines) {
      if (seen.has(id)) continue;
      loop.stop();
      this.engines.delete(id);
    }
  }

  dispose(): void {
    for (const loop of this.engines.values()) loop.stop();
    this.engines.clear();
    this.fireLoop?.stop();
    this.windLoop?.stop();
    this.fireLoop = null;
    this.windLoop = null;
  }
}

