/**
 * Sound effects and music. Effects are small clips bundled into the game and
 * played through Web Audio; music streams from audio/*.ogg. Browsers only allow
 * sound after the first key press or click, so everything starts silent and
 * wakes up then.
 */

const CLIPS = import.meta.glob<string>('./sfx/*.ogg', { query: '?inline', import: 'default', eager: true });

export type Track = 'menu' | 'battle' | 'victory' | 'defeat';
export type Channel = 'master' | 'music' | 'effects';

/** Most effects that may sound at once; quieter new ones are dropped beyond this. */
const MAX_VOICES = 32;
const STORAGE_KEY = 'tagakomando.volume';
const FADE_SECONDS = 1.5;
/**
 * Music loops by crossfading into a second copy of the track shortly before the
 * end, so a track that fades out (or ends mid-phrase) never cuts or jumps.
 */
const LOOP_CROSSFADE = 4;
/** Where a track's music really ends: the menu theme closes on a long fade, the battle theme ends in silence. */
const TRACK_END_TRIM: Record<Track, number> = { menu: 10, battle: 6, victory: 0, defeat: 0 };
/** Result pieces play once and end; the rest loop. */
const PLAYS_ONCE: ReadonlySet<Track> = new Set(['victory', 'defeat']);

/** One music track: two copies of the same file take turns so it can loop with a crossfade. */
interface MusicTrack {
  copies: [HTMLAudioElement, HTMLAudioElement];
  current: 0 | 1;
  /** Track loudness 0..1: fades when switching between tracks. */
  level: number;
  /** When the crossfade into the other copy started (seconds, performance clock), or null. */
  crossingSince: number | null;
}

export interface Loop {
  set(gain: number, pan: number, rate: number): void;
  stop(): void;
}

class AudioSystem {
  private ctx: AudioContext | null = null;
  private effects: GainNode | null = null;
  private readonly clips = new Map<string, AudioBuffer[]>();
  private readonly lastPlayed = new Map<string, number>();
  private voices = 0;
  /** Clips started so far (for checking in development). */
  played = 0;
  private readonly volume: Record<Channel, number> = { master: 0.8, music: 0.5, effects: 0.8 };
  private readonly music = new Map<Track, MusicTrack>();
  private wanted: Track | null = null;
  private musicTimer = 0;

  constructor() {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<Record<Channel, number>>;
      for (const k of ['master', 'music', 'effects'] as const) if (typeof saved[k] === 'number') this.volume[k] = Math.min(1, Math.max(0, saved[k]!));
    } catch {
      // Settings unavailable: keep the defaults.
    }
    const wake = () => {
      this.unlock();
      window.removeEventListener('keydown', wake);
      window.removeEventListener('mousedown', wake);
    };
    window.addEventListener('keydown', wake);
    window.addEventListener('mousedown', wake);
  }

  /** Start the audio engine (after a user gesture) and decode the clips. */
  unlock(): void {
    if (this.ctx) return;
    const ctx = new AudioContext();
    this.ctx = ctx;
    this.effects = ctx.createGain();
    this.effects.connect(ctx.destination);
    this.applyVolume();
    void ctx.resume();
    for (const [path, url] of Object.entries(CLIPS)) {
      const file = path.split('/').pop()!.replace('.ogg', '');
      const name = file.replace(/_\d+$/, '');
      void fetch(url)
        .then((r) => r.arrayBuffer())
        .then((data) => ctx.decodeAudioData(data))
        .then((buffer) => {
          const list = this.clips.get(name) ?? [];
          list.push(buffer);
          this.clips.set(name, list);
        })
        .catch(() => {
          // A clip that fails to decode is simply silent.
        });
    }
    if (this.wanted) this.playMusic(this.wanted);
  }

  /** True once a clip (any variation of `name`) is loaded. */
  has(name: string): boolean {
    return this.clips.has(name);
  }

  getVolume(channel: Channel): number {
    return this.volume[channel];
  }

  setVolume(channel: Channel, value: number): void {
    this.volume[channel] = Math.min(1, Math.max(0, value));
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.volume));
    } catch {
      // Not saved; it still applies for this session.
    }
    this.applyVolume();
  }

  private applyVolume(): void {
    if (this.effects) this.effects.gain.value = this.volume.master * this.volume.effects;
  }

  private musicLevel(): number {
    return this.volume.master * this.volume.music;
  }

  /**
   * Play one variation of a clip. `gain` 0..1, `pan` -1 (left) .. 1 (right).
   * Plays closer together than `gap` seconds are skipped.
   */
  play(name: string, gain: number, pan = 0, gap = 0, rate = 1): void {
    const ctx = this.ctx;
    const list = this.clips.get(name);
    if (!ctx || !this.effects || !list || gain < 0.02) return;
    const now = ctx.currentTime;
    if (gap > 0 && now - (this.lastPlayed.get(name) ?? -1) < gap) return;
    if (this.voices >= MAX_VOICES && gain < 0.5) return;
    this.lastPlayed.set(name, now);
    const src = ctx.createBufferSource();
    src.buffer = list[Math.floor(Math.random() * list.length)];
    src.playbackRate.value = rate * (0.94 + Math.random() * 0.12);
    const g = ctx.createGain();
    g.gain.value = gain;
    const p = ctx.createStereoPanner();
    p.pan.value = Math.max(-1, Math.min(1, pan));
    src.connect(g).connect(p).connect(this.effects);
    this.voices++;
    this.played++;
    src.onended = () => this.voices--;
    src.start();
  }

  /**
   * A one-off piece from audio/ played straight away, such as the studio sting
   * at startup. Skipped quietly if sound is not allowed yet (in a browser,
   * before the first click).
   */
  playOnce(file: string, gain = 1): void {
    void this.prepareOnce(file, gain).play().catch(() => {});
  }

  /** Load a one-off piece ready to play in sync with something on screen. */
  prepareOnce(file: string, gain = 1): HTMLAudioElement {
    const el = new Audio(`audio/${file}.ogg`);
    el.preload = 'auto';
    el.volume = Math.min(1, Math.max(0, this.volume.master * this.volume.effects * gain));
    return el;
  }

  /** A looping clip whose loudness, pan and pitch can be changed while it plays. */
  loop(name: string): Loop | null {
    const ctx = this.ctx;
    const buffer = this.clips.get(name)?.[0];
    if (!ctx || !this.effects || !buffer) return null;
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = 0;
    const p = ctx.createStereoPanner();
    src.connect(g).connect(p).connect(this.effects);
    src.start(0, Math.random() * buffer.duration);
    return {
      set: (gain, pan, rate) => {
        const t = ctx.currentTime;
        g.gain.setTargetAtTime(gain, t, 0.15);
        p.pan.setTargetAtTime(Math.max(-1, Math.min(1, pan)), t, 0.15);
        src.playbackRate.setTargetAtTime(rate, t, 0.3);
      },
      stop: () => {
        g.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        src.stop(ctx.currentTime + 0.5);
      },
    };
  }

  /** Switch music, fading the old track out and the new one in. `null` fades to silence. */
  playMusic(track: Track | null): void {
    this.wanted = track;
    if (!this.ctx) return;
    if (track && !this.music.has(track)) {
      const copy = () => {
        const el = new Audio(`audio/${track}.ogg`);
        el.preload = 'auto';
        el.volume = 0;
        return el;
      };
      this.music.set(track, { copies: [copy(), copy()], current: 0, level: 0, crossingSince: null });
    }
    const t = track ? this.music.get(track)! : null;
    // A result piece starts again from the top each time it is called for.
    if (t && track && PLAYS_ONCE.has(track)) t.copies[t.current].currentTime = 0;
    if (t && t.copies[t.current].paused) void t.copies[t.current].play().catch(() => {});
    if (!this.musicTimer) this.musicTimer = window.setInterval(() => this.tickMusic(), 50);
  }

  /** Fades between tracks and loops each one by crossfading its two copies. */
  private tickMusic(): void {
    const now = performance.now() / 1000;
    const step = 0.05 / FADE_SECONDS;
    let active = false;
    for (const [name, t] of this.music) {
      const goal = name === this.wanted ? 1 : 0;
      t.level += Math.sign(goal - t.level) * Math.min(step, Math.abs(goal - t.level));
      const cur = t.copies[t.current];
      const next = t.copies[1 - t.current];
      if (t.level <= 0.001 && goal === 0) {
        for (const c of t.copies) if (!c.paused) c.pause();
        t.crossingSince = null;
        continue;
      }
      active = true;
      if (PLAYS_ONCE.has(name)) {
        cur.volume = Math.max(0, Math.min(1, this.musicLevel() * t.level));
        continue;
      }
      // Start the second copy a few seconds before the first runs out.
      const end = (Number.isFinite(cur.duration) ? cur.duration : Infinity) - TRACK_END_TRIM[name];
      if (t.crossingSince === null && !cur.paused && cur.currentTime >= end - LOOP_CROSSFADE) {
        next.currentTime = 0;
        void next.play().catch(() => {});
        t.crossingSince = now;
      }
      const x = t.crossingSince === null ? 0 : Math.min(1, (now - t.crossingSince) / LOOP_CROSSFADE);
      const base = this.musicLevel() * t.level;
      cur.volume = Math.max(0, Math.min(1, base * Math.cos((x * Math.PI) / 2)));
      next.volume = Math.max(0, Math.min(1, base * Math.sin((x * Math.PI) / 2)));
      if (x >= 1) {
        cur.pause();
        cur.currentTime = 0;
        t.current = t.current === 0 ? 1 : 0;
        t.crossingSince = null;
      }
    }
    if (!active && !this.wanted) {
      window.clearInterval(this.musicTimer);
      this.musicTimer = 0;
    }
  }
}

export const audio = new AudioSystem();
if (import.meta.env.DEV) Object.assign(window, { audio });
