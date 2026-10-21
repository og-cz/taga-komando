import { AICommander } from '../../ai/commander';
import { SIM_DT } from '../../data/balance';
import { MAPS, MAP_IDS } from '../../data/maps';
import { lerp, type Vec2 } from '../../core/vec';
import { createUIState } from '../../input/uiState';
import { Camera } from '../../render/camera';
import { Renderer } from '../../render/renderer';
import { World } from '../../sim/world';

/**
 * A live AI-vs-AI battle drawn behind the title and menus, with a slow
 * cinematic camera that drifts between the fights.
 */
export class MenuBattle {
  private world!: World;
  private ais!: AICommander[];
  private camera!: Camera;
  private renderer!: Renderer;
  private readonly ui = createUIState();
  private running = true;
  private last = performance.now();
  private acc = 0;
  private focus: Vec2 = { x: 0, y: 0 };
  private focusTimer = 0;
  private readonly onResize = () => this.renderer.resize(window.innerWidth, window.innerHeight);

  constructor(private readonly canvas: HTMLCanvasElement) {
    this.newBattle();
    window.addEventListener('resize', this.onResize);
    requestAnimationFrame(this.frame);
  }

  dispose(): void {
    this.running = false;
    this.renderer?.dispose();
    window.removeEventListener('resize', this.onResize);
  }

  private newBattle(): void {
    const map = MAPS[MAP_IDS[Math.floor(Math.random() * MAP_IDS.length)]];
    this.world = new World({ map, factions: ['usaffe', 'ija'], seed: (Math.random() * 1e9) | 0 });
    this.ais = [new AICommander(0), new AICommander(1)];
    // Give the battle a head start so the first frame already has a fight in it.
    for (let t = 0; t < 70; t += SIM_DT) this.step();
    this.camera = new Camera(this.world.map.pixelWidth, this.world.map.pixelHeight);
    this.camera.insets = { top: 0, bottom: 0, side: 0 };
    this.renderer?.dispose();
    this.renderer = new Renderer(this.canvas, this.world, this.camera, 0, true);
    this.renderer.resize(window.innerWidth, window.innerHeight);
    this.camera.zoom = 1.35;
    this.pickFocus();
    this.camera.centerOn(this.focus);
  }

  private step(): void {
    for (const ai of this.ais) ai.update(this.world, SIM_DT);
    this.world.step(SIM_DT);
  }

  /** Follow whichever squad fired most recently; otherwise look at a capture point. */
  private pickFocus(): void {
    const w = this.world;
    const firing = w.squads.filter((s) => !s.dead && s.def.kind !== 'structure' && w.time - s.lastFired < 3);
    if (firing.length > 0) this.focus = { ...firing[Math.floor(Math.random() * firing.length)].pos };
    else this.focus = { ...w.points[Math.floor(Math.random() * w.points.length)].pos };
    this.focusTimer = 7;
  }

  private readonly frame = (now: number): void => {
    if (!this.running) return;
    const dt = Math.min(0.1, (now - this.last) / 1000);
    this.last = now;
    this.acc += dt;
    while (this.acc >= SIM_DT) {
      this.step();
      this.acc -= SIM_DT;
    }
    if (this.world.winner !== -1 || this.world.time > 900) this.newBattle();

    this.focusTimer -= dt;
    if (this.focusTimer <= 0) this.pickFocus();
    const k = 1 - Math.pow(0.35, dt);
    this.camera.centerOn({ x: lerp(this.camera.x, this.focus.x, k * 0.5), y: lerp(this.camera.y, this.focus.y, k * 0.5) });

    this.renderer.draw(this.ui, dt);
    this.world.events.length = 0;
    requestAnimationFrame(this.frame);
  };
}
