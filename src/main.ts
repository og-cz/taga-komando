import './ui/styles.css';
import './ui/frontend.css';
import { audio } from './audio/audio';
import { installUiSounds } from './audio/uiSounds';
import { CAMPAIGN } from './data/campaign';
import { Game, type MatchSetup } from './game';
import { MenuBattle } from './ui/frontend/background';
import { showBriefing } from './ui/frontend/briefing';
import { showCampaign, type CampaignSpot } from './ui/frontend/campaign';
import { showHowToPlay } from './ui/frontend/howToPlay';
import { playIntro } from './ui/frontend/intro';
import { showMainMenu } from './ui/frontend/mainMenu';
import { completeCampaign, recordTheater } from './ui/frontend/progress';
import { showSkirmish } from './ui/frontend/skirmish';
import { showStory } from './ui/frontend/story';
import { setupFor, showTheater } from './ui/frontend/theater';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const layer = document.getElementById('ui') as HTMLElement;

/** Where a match was started from, so "Continue" and "Retry" know where to go. */
type Origin = { kind: 'skirmish' } | { kind: 'theater' } | ({ kind: 'campaign' } & CampaignSpot);

let background: MenuBattle | null = null;

function cinematic(on: boolean): void {
  document.body.classList.toggle('cinematic', on);
  if (on) audio.playMusic('menu');
  if (on && !background) background = new MenuBattle(canvas);
  if (!on && background) {
    background.dispose();
    background = null;
  }
}

function mainMenu(): void {
  cinematic(true);
  showMainMenu(layer, {
    campaign: () => campaign(),
    theater: () => showTheater(layer, (setup) => briefThenPlay(setup, { kind: 'theater' }, theater), mainMenu),
    skirmish: () => showSkirmish(layer, (setup) => play(setup, { kind: 'skirmish' }), mainMenu),
    howToPlay: () => showHowToPlay(layer, mainMenu),
  });
}

function theater(): void {
  cinematic(true);
  showTheater(layer, (setup) => briefThenPlay(setup, { kind: 'theater' }, theater), mainMenu);
}

function campaign(focus?: number): void {
  cinematic(true);
  showCampaign(layer, (setup, spot) => campaignPart(setup, spot), mainMenu, focus);
}

/** A campaign part: its story scenes, then the briefing, then the battle. */
function campaignPart(setup: MatchSetup, spot: CampaignSpot): void {
  cinematic(true);
  const mission = CAMPAIGN[spot.mission];
  const s = setup.scenario!;
  showStory(layer, `${mission.name} · Part ${spot.part + 1}`, s.name, s.story ?? [], () =>
    briefThenPlay(setup, { kind: 'campaign', ...spot }, () => campaign(spot.mission)),
  );
}

/** After a won campaign part: on to the next part, or the mission's ending and the next mission. */
function campaignNext(setup: MatchSetup, spot: CampaignSpot): void {
  const mission = CAMPAIGN[spot.mission];
  if (spot.part + 1 < mission.parts.length) {
    return campaignPart(setupFor(mission.parts[spot.part + 1], setup.difficulty), { mission: spot.mission, part: spot.part + 1 });
  }
  cinematic(true);
  const next = Math.min(spot.mission + 1, CAMPAIGN.length - 1);
  showStory(layer, `${mission.name} · Aftermath`, mission.name, setup.scenario?.aftermath ?? [], () => campaign(next));
}

function briefThenPlay(setup: MatchSetup, origin: Origin, back: () => void): void {
  if (!setup.scenario) return play(setup, origin);
  showBriefing(layer, setup.scenario, () => play(setup, origin), back);
}

function continueLabel(origin: Origin): string {
  if (origin.kind === 'campaign') {
    if (origin.part + 1 < CAMPAIGN[origin.mission].parts.length) return 'Next part';
    return origin.mission + 1 < CAMPAIGN.length ? 'Next mission' : 'Finish campaign';
  }
  return origin.kind === 'theater' ? 'Theater of War' : 'Continue';
}

function play(setup: MatchSetup, origin: Origin): void {
  cinematic(false);
  new Game(canvas, layer, setup, continueLabel(origin), (result) => {
    if (result.won && setup.scenario) {
      if (origin.kind === 'campaign') completeCampaign(setup.scenario.id);
      if (origin.kind === 'theater') recordTheater(setup.scenario.id, setup.difficulty);
    }
    if (result.action === 'retry') return play(setup, origin);
    if (result.action === 'continue') {
      if (origin.kind === 'campaign') return result.won ? campaignNext(setup, origin) : campaign(origin.mission);
      if (origin.kind === 'theater') return theater();
    }
    mainMenu();
  });
}

installUiSounds();
// Load the display font now: the first screen that uses it may be the result
// screen, and the title must never flash up in a fallback font.
void document.fonts.load("400 48px 'Quiapo'").catch(() => {});
// Development only: ?battle=<map> starts a skirmish straight away (for quick checks).
// &spawn=<unit id>[,<unit id>…] adds our units by the HQ (&enemy=… adds enemy ones beside them), &select=<unit id> selects our
// first unit of that type, &zoom=<n> zooms in on them, &edge=1 zooms out to the map corner,
// &end=win|lose ends the battle at once (to see the result screen), &focus=hq|enemy centres
// the camera on our or the enemy headquarters, &reveal=1 lifts the fog of war,
// &menu=defense|base opens an engineers' submenu, &doctrine=<id> chooses a doctrine (with &cp=<n>
// command points), &picker=1 opens the doctrine chooser, &frame=1 leaves spawned structures half built,
// &faction=ija plays the Imperial side.
const devBattle = import.meta.env.DEV ? new URLSearchParams(location.search).get('battle') : null;
if (devBattle) {
  const side = new URLSearchParams(location.search).get('faction') === 'ija' ? 'ija' : 'usaffe';
  play({ faction: side, enemyFaction: side === 'ija' ? 'usaffe' : 'ija', map: devBattle, difficulty: 'normal', win: 'points' }, { kind: 'skirmish' });
  devSetup();
} else {
  cinematic(true);
  playIntro(layer, mainMenu);
}

interface DevGame {
  world: import('./sim/world').World;
  input: { select(ids: number[]): void };
  renderer: { spectator: boolean };
  ui: { buildMenu: false | 'defense' | 'base' };
  hud: { root: HTMLElement };
  camera: { zoom: number; minZoom: number; maxZoom: number; centerOn(p: { x: number; y: number }): void };
}

function devSetup(): void {
  const params = new URLSearchParams(location.search);
  const game = (window as unknown as { game: DevGame }).game;
  const hq = game.world.hqOf(0);
  const near = hq ? { x: hq.pos.x + 90, y: hq.pos.y + 20 } : { x: 0, y: 0 };
  (params.get('spawn') ?? '').split(',').filter(Boolean).forEach((id, i) => game.world.spawn(0, id, { x: near.x + (i % 3) * 45, y: near.y + Math.floor(i / 3) * 45 }));
  (params.get('enemy') ?? '').split(',').filter(Boolean).forEach((id, i) => game.world.spawn(1, id, { x: near.x + 120 + (i % 3) * 45, y: near.y + Math.floor(i / 3) * 45 }, Math.PI));
  const zoom = Number(params.get('zoom'));
  if (zoom) {
    game.camera.zoom = Math.min(game.camera.maxZoom, zoom);
    game.camera.centerOn({ x: near.x + 45, y: near.y + 20 });
  }
  const pick = params.get('select');
  const sq = pick ? game.world.squads.find((s) => s.team === 0 && s.def.id === pick) : undefined;
  if (sq) game.input.select([sq.id]);
  if (params.get('reveal')) game.renderer.spectator = true;
  const doctrine = params.get('doctrine');
  if (doctrine) game.world.teams[0].doctrine = doctrine;
  if (params.get('cp')) game.world.teams[0].cp = Number(params.get('cp'));
  if (params.get('picker')) game.hud.root.querySelector('.doctrine-picker')?.classList.add('show');
  if (params.get('frame')) for (const s of game.world.squads) if (s.team === 0 && (s.def.role === 'fort' || s.def.role === 'tech')) s.building = 0.45;
  const menu = params.get('menu');
  if (menu === 'defense' || menu === 'base') game.ui.buildMenu = menu;
  const focus = params.get('focus');
  const target = focus === 'enemy' ? game.world.hqOf(1) : focus === 'hq' ? hq : undefined;
  if (target) game.camera.centerOn(target.pos);
  const end = params.get('end');
  if (end) game.world.winner = end === 'win' ? 0 : 1;
  if (params.get('edge')) {
    game.camera.zoom = game.camera.minZoom;
    game.camera.centerOn({ x: 0, y: 0 });
  }
}
