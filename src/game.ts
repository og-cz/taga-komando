import { AICommander } from './ai/commander';
import { audio } from './audio/audio';
import { BattleAudio } from './audio/battleAudio';
import { DIFFICULTY, SIM_DT } from './data/balance';
import { ALL_MAPS } from './data/theaterMaps';
import type { Difficulty, ScenarioDef, TeamId, WinCondition } from './data/types';
import { Input } from './input/input';
import { createUIState } from './input/uiState';
import { Camera } from './render/camera';
import { Renderer } from './render/renderer';
import { World } from './sim/world';
import { Hud } from './ui/hud';
import { Minimap } from './ui/minimap';
import { endOverlay, helpOverlay, pauseOverlay } from './ui/overlays';

const PLAYER: TeamId = 0;

export interface MatchSetup {
  faction: string;
  enemyFaction: string;
  map: string;
  difficulty: Difficulty;
  /** Theater of War / Campaign mission; omitted for a plain skirmish. */
  scenario?: ScenarioDef;
  /** Skirmish win condition; missions use their own. */
  win?: WinCondition;
}

export interface MatchResult {
  won: boolean;
  action: 'menu' | 'retry' | 'continue';
}

/** Wires the simulation to rendering, input and UI and runs the fixed-timestep loop. */
export class Game {
  private readonly world: World;
  private readonly ai: AICommander | null;
  private readonly camera: Camera;
  private readonly renderer: Renderer;
  private readonly sound: BattleAudio;
  private readonly input: Input;
  private readonly hud: Hud;
  private readonly minimap: Minimap;
  private readonly ui = createUIState();
  private overlay: HTMLElement | null = null;
  private paused = false;
  private ended = false;
  private running = true;
  private acc = 0;
  private last = performance.now();
  private readonly onResize = () => this.resize();

  constructor(
    private readonly canvas: HTMLCanvasElement,
    private readonly layer: HTMLElement,
    private readonly setup: MatchSetup,
    private readonly continueLabel: string,
    private readonly onExit: (result: MatchResult) => void,
  ) {
    const scenario = setup.scenario;
    const skirmishRules = !scenario || scenario.mode === 'skirmish';
    this.world = new World({
      map: ALL_MAPS[setup.map],
      factions: [setup.faction, setup.enemyFaction],
      seed: (Date.now() & 0xffff) + 1,
      incomeMult: [1, skirmishRules ? DIFFICULTY[setup.difficulty] : 1],
      scenario,
      difficulty: setup.difficulty,
      win: setup.win,
    });
    // Defense waves and offensive garrisons are scripted; only skirmish battles need the AI commander.
    this.ai = skirmishRules ? new AICommander(1) : null;
    this.camera = new Camera(this.world.map.pixelWidth, this.world.map.pixelHeight);
    this.renderer = new Renderer(canvas, this.world, this.camera, PLAYER);
    this.sound = new BattleAudio(this.world, this.camera, PLAYER);
    audio.playMusic('battle');
    this.input = new Input(canvas, this.world, this.camera, this.ui, PLAYER, {
      toast: (t) => this.hud.toast(t, 'bad'),
      togglePause: () => this.togglePause(),
      toggleHelp: () => this.toggleHelp(),
      acknowledge: (kind, squads) => this.sound.acknowledge(kind, squads),
    });
    this.minimap = new Minimap(this.world, this.camera, PLAYER);
    this.hud = new Hud(layer, this.world, this.ui, this.input, PLAYER, this.minimap);
    this.hud.onMenu = () => this.togglePause();
    this.hud.onHelp = () => this.toggleHelp();
    window.addEventListener('resize', this.onResize);
    this.resize();
    // Start close in on the infantry, where the fighting is.
    this.camera.zoom = 2.6;
    const hold = scenario?.defense ? this.world.points[scenario.defense.hold[0]].pos : null;
    this.camera.centerOn(hold ?? this.world.teams[PLAYER].spawn);
    this.input.select(this.world.squads.filter((s) => s.team === PLAYER && (s.def.kind === 'infantry' || s.def.kind === 'team')).map((s) => s.id));
    this.hud.toast(this.openingHint(), 'info');
    if (import.meta.env.DEV) Object.assign(window, { game: this });
    requestAnimationFrame(this.frame);
  }

  private openingHint(): string {
    switch (this.world.objective.mode) {
      case 'defense':
        return 'Dig in: set up your guns and reinforce before the first wave arrives.';
      case 'offensive':
        return 'Take the marked objective. Flank the machine guns through the paddies.';
      default:
        if (this.world.win === 'annihilation') return 'Annihilation: destroy every enemy unit and their headquarters.';
        if (this.world.win === 'none') return 'Free battle: there is no victory condition. Leave from the Menu when you are done.';
        return 'Capture the victory points. Right-click to move your squads.';
    }
  }

  private resize(): void {
    this.renderer.resize(window.innerWidth, window.innerHeight);
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    // Clamp both ways: a stalled tab must not fast-forward, a clock step backwards must not stall.
    const dt = Math.min(0.1, Math.max(0, (now - this.last) / 1000));
    this.last = now;
    try {
      if (!this.paused && !this.ended) {
        this.acc += dt;
        while (this.acc >= SIM_DT) {
          this.ai?.update(this.world, SIM_DT);
          this.world.step(SIM_DT);
          this.acc -= SIM_DT;
        }
      }
      this.input.update(dt);
      this.renderer.draw(this.ui, this.paused ? 0 : dt);
      this.hud.consume(this.world.events);
      this.sound.consume(this.world.events);
      this.sound.update();
      this.world.events.length = 0;
      this.hud.update(dt);
      this.minimap.draw();
      if (!this.ended && this.world.winner !== -1) {
        this.ended = true;
        // Let the final moment play out briefly before the result screen.
        window.setTimeout(() => this.showResult(), 1400);
      }
    } catch (err) {
      this.reportError(err);
    } finally {
      // Always schedule the next frame so one error can never freeze the game.
      requestAnimationFrame(this.frame);
    }
  };

  private errorReported = false;

  private reportError(err: unknown): void {
    console.error(err);
    this.world.events.length = 0;
    if (this.errorReported) return;
    this.errorReported = true;
    const message = err instanceof Error ? err.message : String(err);
    this.hud.toast(`Something went wrong: ${message}. Press F12 and screenshot the Console to report it.`, 'bad');
  }

  private showResult(): void {
    if (!this.running) return;
    const won = this.world.winner === PLAYER;
    const title = this.setup.scenario?.name ?? `Skirmish · ${ALL_MAPS[this.setup.map].name}`;
    audio.playMusic(won ? 'victory' : 'defeat');
    // The battle HUD (and any tooltip left open) goes away behind the result.
    this.hud.root.style.display = 'none';
    this.showOverlay(
      endOverlay(this.world, PLAYER, title, {
        continueLabel: this.continueLabel,
        onContinue: () => this.exit({ won, action: 'continue' }),
        onRetry: () => this.exit({ won, action: 'retry' }),
        onMenu: () => this.exit({ won, action: 'menu' }),
      }),
    );
  }

  private showOverlay(node: HTMLElement | null): void {
    this.overlay?.remove();
    this.overlay = node;
    if (node) this.layer.append(node);
  }

  private togglePause(): void {
    if (this.ended) return;
    this.paused = !this.paused;
    this.showOverlay(
      this.paused
        ? pauseOverlay(
            () => this.togglePause(),
            () => this.surrender(),
          )
        : null,
    );
  }

  /** Give up: the enemy wins and the defeat screen is shown. */
  private surrender(): void {
    if (this.ended) return;
    this.paused = false;
    this.showOverlay(null);
    this.world.winner = PLAYER === 0 ? 1 : 0;
    this.world.endReason = `${this.world.teams[PLAYER].faction.name} surrendered`;
    this.ended = true;
    this.showResult();
  }

  private toggleHelp(): void {
    if (this.ended) return;
    if (this.overlay) {
      this.paused = false;
      this.showOverlay(null);
      return;
    }
    this.paused = true;
    this.showOverlay(
      helpOverlay(() => {
        this.paused = false;
        this.showOverlay(null);
      }),
    );
  }

  private exit(result: MatchResult): void {
    this.running = false;
    this.sound.dispose();
    this.input.dispose();
    this.minimap.dispose();
    this.renderer.dispose();
    window.removeEventListener('resize', this.onResize);
    this.showOverlay(null);
    this.hud.root.remove();
    const ctx = this.canvas.getContext('2d')!;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    this.onExit(result);
  }
}
