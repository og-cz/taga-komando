import { ABILITIES } from '../data/abilities';
import { BUILDABLES, BUILDABLE_IDS } from '../data/buildables';
import { ECONOMY, LOGISTICS } from '../data/balance';
import type { CallInDef, DoctrineDef, Resources, TeamId, UnitDef } from '../data/types';
import { CALL_INS, DOCTRINES, doctrinesOf } from '../data/doctrines';
import { callInBlock, chooseDoctrine } from '../sim/systems/doctrine';
import { TERRAIN } from '../data/terrain';
import { UNITS } from '../data/units';
import { UPGRADES } from '../data/upgrades';
import { WEAPONS } from '../data/weapons';
import { cancelProduction, cancelReinforce, cancelUpgrade, queueProduction } from '../sim/commands';
import { aliveCount, healthFraction, type SimEvent, type Squad, type Tone } from '../sim/entities';
import { defenseAt } from '../sim/systems/defenses';
import { canAfford } from '../sim/systems/economy';
import { workersOf } from '../sim/systems/engineering';
import { reinforceCost } from '../sim/systems/logistics';
import { forcesRemaining } from '../sim/systems/victory';
import type { World } from '../sim/world';
import type { Input } from '../input/input';
import type { UIState } from '../input/uiState';
import { el, formatTime } from './dom';
import { portrait } from './portrait';
import { hash2 } from '../core/rng';
import { icon, unitIcon } from './icons';
import type { Minimap } from './minimap';

/** "Sundalo ng Maharlika · Rifle Squad": the unit's name and what it is. */
const titleOf = (sq: Squad): string => (sq.def.type ? `${sq.def.name} · ${sq.def.type}` : sq.def.name);

/** A small doctrine banner: its colours and emblem. */
function banner(d: DoctrineDef): HTMLElement {
  const flag = el('div', { class: `banner emblem-${d.emblem}` });
  flag.style.background = `linear-gradient(180deg, ${d.field} 0 70%, ${d.stripe} 70% 100%)`;
  return flag;
}

/** Icon for a call-in, by what it does. */
function callInIcon(c: CallInDef): string {
  const e = c.effect;
  if (e.kind === 'barrage') return 'barrage';
  if (e.kind === 'recon') return 'plane';
  if (e.kind === 'paradrop') return 'parachute';
  if (e.kind === 'levy') return 'reinforce';
  if (e.kind === 'mines') return 'mine';
  if (e.camo) return 'leaf';
  if (e.rally) return 'rally';
  if (e.received) return 'shield';
  if (e.accuracy) return 'attack';
  return 'charge';
}

/**
 * Squares of the 4 × 3 order grid, the same for every unit: the top row is the
 * orders every squad has, the middle row the engineers' build menus, the
 * bottom row the unit's own abilities.
 */
const ORDER_SLOT: Record<string, number> = {
  attack: 0, stop: 1, reinforce: 2, retreat: 3,
  base: 4, build: 5,
  repair: 8, setup: 8, grenade: 9, barrage: 10, back: 11, rally: 11,
};
/** Squares in the order grid. */
const GRID_SQUARES = 12;
/** Order of the recruit buttons, by kind of unit (a doctrine's unit comes after them). */
const UNIT_SLOT: Record<string, number> = { line: 0, engineer: 1, mg: 2, mortar: 3, at: 4, tank: 5 };

function placeInSlot(node: HTMLElement, slot: number): void {
  node.dataset.slot = String(slot);
  node.style.gridColumn = String((slot % 4) + 1);
  node.style.gridRow = String(Math.floor(slot / 4) + 1);
}

/** Fill a grid's shown buttons from the top-left square, keeping their usual order (the recruit menu). */
function packGrid(grid: HTMLElement): void {
  const shown = [...grid.querySelectorAll<HTMLElement>('.cmd')].filter((n) => n.style.display !== 'none');
  shown.sort((a, b) => Number(a.dataset.slot) - Number(b.dataset.slot));
  shown.forEach((n, i) => {
    n.style.gridColumn = String((i % 4) + 1);
    n.style.gridRow = String(Math.floor(i / 4) + 1);
  });
}

/**
 * A soldier's photograph for the unit card: a man of that unit in its own
 * uniform and headgear, the same man each time for the same squad.
 */
function soldierPhoto(sq: Squad, faction: string): HTMLElement | null {
  const def = sq.def;
  if (def.kind !== 'infantry' && def.kind !== 'team') return null;
  const ija = faction === 'ija';
  const h = (i: number) => hash2(sq.id, i, 5);
  const style = def.look?.helmetStyle ?? (ija ? 'type90' : 'straw');
  const helmet = def.look?.helmet ?? (ija ? '#6d673b' : '#c4a866');
  const cloth = def.look?.cloth ?? (ija ? '#8c7c47' : '#8b98a5');
  const skins = ija ? ['#c99a72', '#bf8f69', '#c4946c'] : ['#a8754f', '#9a6a46', '#8f6040'];
  const hat =
    style === 'straw' ? { kind: style, color: helmet, band: h(4) < 0.35 ? '#a3241c' : undefined } :
    style === 'm1' || style === 'type90' || style === 'salakot' || style === 'pith' ? { kind: style, color: helmet } : style === 'cap' ? { kind: 'field' as const, color: helmet } : style === 'bandana' ? { kind: 'bandana' as const, color: helmet } : undefined;
  return portrait(
    {
      title: '',
      name: def.name,
      look: {
        skin: skins[Math.floor(h(1) * skins.length)],
        hair: h(2) < 0.5 ? 'short' : 'slick',
        moustache: h(3) < 0.3 ? 'thin' : undefined,
        hat,
        dress: style === 'bandana' && !ija ? 'camisa' : 'tunic',
        cloth,
        stripes: !ija && style === 'straw',
      },
    },
    'unit-photo',
  );
}

/** Icon for a unit (its role, or what a structure is). */
const glyphOf = (def: UnitDef): SVGSVGElement => icon(unitIcon(def));

interface Tip {
  title: string;
  body?: string;
  cost?: Resources;
  key?: string;
  warn?: string;
}

interface GridButton {
  node: HTMLButtonElement;
  refresh(own: Squad[]): void;
  /** Available with several units selected (move, stop, retreat); everything else needs one unit. */
  common?: boolean;
  /** Buttons on one of the engineers' submenu pages instead of the main orders. */
  buildPage?: 'defense' | 'base';
}

/**
 * In-game HUD: objective and timer top
 * centre, unit roster top right, minimap / unit portrait / command grid along
 * the bottom, with rich tooltips on every button.
 */
export class Hud {
  readonly root: HTMLElement;
  onMenu: () => void = () => {};
  onHelp: () => void = () => {};

  private readonly res: Record<'manpower' | 'munitions' | 'fuel' | 'pop', HTMLElement>;
  private readonly tickets: [HTMLElement, HTMLElement];
  private readonly ticketBars: [HTMLElement, HTMLElement];
  private readonly pointIcons: HTMLElement;
  private readonly objective: { box: HTMLElement; title: HTMLElement; detail: HTMLElement } | null;
  private readonly clock: HTMLElement;
  private readonly roster: HTMLElement;
  private readonly rosterCards = new Map<number, HTMLElement>();
  private readonly unitPanel: HTMLElement;
  private readonly income: Record<'manpower' | 'munitions' | 'fuel', HTMLElement>;
  private readonly orderGrid: HTMLElement;
  private readonly buildGrid: HTMLElement;
  private readonly orders: GridButton[] = [];
  private readonly builds: { id: string; node: HTMLButtonElement }[] = [];
  private rallyNode: HTMLButtonElement | null = null;
  private readonly doctrineBar: HTMLElement;
  private readonly picker: HTMLElement;
  private doctrineShown: string | null | undefined = undefined;
  private readonly callInNodes: { id: string; node: HTMLButtonElement }[] = [];
  private cpFill: HTMLElement | null = null;
  private cpText: HTMLElement | null = null;
  /** The HQ's production queue: three slots beside the orders. */
  private readonly queueSlots: HTMLElement[] = [];
  /** Upgrades for the selected unit, beside its card. */
  private readonly upgradePanel = el('div', { class: 'upgrade-panel' });
  /** Which idle squad the idle buttons last picked, to cycle through them. */
  private idleIndex = 0;
  /** Headquarters and tier buildings, as tabs over the order grid. */
  private readonly buildingTabs = el('div', { class: 'building-tabs' });
  private readonly buildingTabNodes: { node: HTMLButtonElement; find: () => Squad | undefined }[] = [];
  private readonly toasts: HTMLElement;
  private readonly tooltip: HTMLElement;
  private tipSource: { node: HTMLElement; get: () => Tip } | null = null;
  private selectionKey = '';
  private timer = 0;

  constructor(
    parent: HTMLElement,
    private readonly world: World,
    private readonly ui: UIState,
    private readonly input: Input,
    private readonly player: TeamId,
    minimap: Minimap,
  ) {
    const team = world.teams[player];

    // ─── Top centre: objective or VP bar, clock beneath ───
    const ticketBox = (t: TeamId) => {
      const bar = el('div', { class: 'fill' });
      const num = el('span', { class: 'num' });
      return [el('div', { class: `tickets t${t}` }, el('div', { class: 'bar' }, bar), num), num, bar] as const;
    };
    const [t0, n0, b0] = ticketBox(0);
    const [t1, n1, b1] = ticketBox(1);
    this.tickets = [n0, n1];
    this.ticketBars = [b0, b1];
    this.pointIcons = el('div', { class: 'vp-icons' });
    this.clock = el('div', { class: 'clock' });
    // Ticket bars only make sense for capture-point battles; everything else gets an objective panel.
    if (world.objective.mode === 'skirmish' && world.win === 'points') {
      this.objective = null;
    } else {
      const title = el('div', { class: 'obj-title' });
      const detail = el('div', { class: 'obj-detail' });
      this.objective = { box: el('div', { class: `objective-panel mode-${world.objective.mode}` }, title, detail), title, detail };
    }
    const top = el('div', { class: 'hud-top' }, this.objective ? this.objective.box : el('div', { class: 'score' }, t0, this.pointIcons, t1), this.clock);

    // ─── Resources (bottom, beside the orders) ───
    const stat = (cls: string, label: string, name: string) => {
      const v = el('span', { class: 'val' });
      const inc = el('span', { class: 'inc' });
      const node = el('div', { class: `res ${cls}` }, icon(name, 'ico res-icon'), v, inc);
      this.tip(node, () => ({ title: label, body: RESOURCE_HELP[cls] }));
      return [node, v, inc] as const;
    };
    const [mpBox, mp, mpInc] = stat('mp', 'Manpower', 'manpower');
    const [muBox, mu, muInc] = stat('mu', 'Munitions', 'munitions');
    const [fuBox, fu, fuInc] = stat('fu', 'Fuel', 'fuel');
    const [popBox, pop] = stat('pop', 'Population', 'pop');
    this.res = { manpower: mp, munitions: mu, fuel: fu, pop };
    this.income = { manpower: mpInc, munitions: muInc, fuel: fuInc };
    // ─── Top right: menu buttons and unit roster ───
    const menu = el('button', { class: 'corner-btn', text: 'Menu' });
    const help = el('button', { class: 'corner-btn', text: '?' });
    menu.addEventListener('click', () => this.onMenu());
    help.addEventListener('click', () => this.onHelp());
    this.tip(menu, () => ({ title: 'Menu', body: 'Pause the battle, see the controls, or leave.', key: 'Esc' }));
    this.tip(help, () => ({ title: 'Controls', body: 'Show every key binding.', key: 'F1' }));
    this.roster = el('div', { class: 'roster' });
    const corner = el('div', { class: 'hud-corner' }, this.roster);
    // Round buttons on the map's frame: next idle infantry / vehicle, help, menu.
    const mapBtn = (cls: string, glyph: string, title: string, body: string, fn: () => void, label?: string) => {
      const b = el('button', { class: `map-btn ${cls}` }, label ? el('span', { text: label }) : icon(glyph, 'ico'));
      b.addEventListener('click', fn);
      this.tip(b, () => ({ title, body }));
      return b;
    };
    menu.className = 'map-btn menu';
    help.className = 'map-btn help';
    const idleInf = mapBtn('idle-inf', 'line', 'Next idle infantry', 'Select and go to the next infantry squad with no orders.', () => this.nextIdle(false));
    const idleVeh = mapBtn('idle-veh', 'tank', 'Next idle vehicle', 'Select and go to the next vehicle with no orders.', () => this.nextIdle(true));

    // ─── Bottom: minimap · unit card · queue · command grid ───
    this.unitPanel = el('div', { class: 'unit-panel' });
    this.orderGrid = el('div', { class: 'cmd-grid' });
    this.buildGrid = el('div', { class: 'cmd-grid build' });
    // The squares are always there, so buttons never shift about.
    for (const grid of [this.orderGrid, this.buildGrid]) {
      for (let i = 0; i < GRID_SQUARES; i++) {
        const square = el('div', { class: 'cmd-slot' });
        placeInSlot(square, i);
        grid.append(square);
      }
    }
    this.buildOrders();
    this.buildDefenseButtons();
    this.buildUpgradeButtons();
    for (const id of team.faction.roster) this.buildButton(id);
    this.rallyButton();
    const queue = el('div', { class: 'queue-panel' });
    for (let i = 0; i < ECONOMY.maxQueue; i++) queue.append(this.queueSlot(i));
    this.buildBuildingTabs();

    this.doctrineBar = el('div', { class: 'doctrine-bar' });
    const bottom = el(
      'div',
      { class: 'bottombar' },
      el('div', { class: 'panel minimap-panel' }, minimap.canvas, idleInf, idleVeh, help, menu),
      // The information panel: the unit, its upgrades, then the production queue at its right end.
      // Along its top edge, one strip: the doctrine on the left, the resources on the right.
      el(
        'div',
        { class: 'panel unit-card' },
        el('div', { class: 'info-strip' }, this.doctrineBar, el('div', { class: 'resources res-strip' }, mpBox, muBox, fuBox, popBox)),
        this.unitPanel,
        this.upgradePanel,
        queue,
      ),
      el(
        'div',
        { class: 'panel command-card' },
        this.buildingTabs,
        this.orderGrid,
        this.buildGrid,
      ),
    );

    this.toasts = el('div', { class: 'toasts' });
    this.tooltip = el('div', { class: 'tooltip' });
    this.picker = el('div', { class: 'doctrine-picker' });
    this.buildDoctrineUi();
    this.root = el('div', { class: 'hud' }, top, corner, this.toasts, bottom, this.picker, this.tooltip);
    parent.append(this.root);
    this.update(0, true);
  }

  // ─── Tooltips ──────────────────────────────────────────────────

  /** Attach a rich tooltip; `get` is re-read while shown so cooldowns stay live. */
  private tip(node: HTMLElement, get: () => Tip): void {
    node.addEventListener('mouseenter', () => {
      this.tipSource = { node, get };
      this.renderTip();
    });
    node.addEventListener('mouseleave', () => {
      if (this.tipSource?.node === node) this.tipSource = null;
      this.tooltip.classList.remove('show');
    });
  }

  private renderTip(): void {
    const src = this.tipSource;
    if (!src || !src.node.isConnected) {
      this.tipSource = null;
      this.tooltip.classList.remove('show');
      return;
    }
    const t = src.get();
    const res = this.world.teams[this.player].resources;
    const parts: HTMLElement[] = [el('div', { class: 'tip-head' }, el('span', { class: 'tip-title', text: t.title }), ...(t.key ? [el('span', { class: 'tip-key', text: t.key })] : []))];
    if (t.body) parts.push(el('p', { class: 'tip-body', text: t.body }));
    if (t.cost) {
      const row = el('div', { class: 'tip-cost' });
      for (const [k, label] of [['manpower', 'MP'], ['munitions', 'MU'], ['fuel', 'FU']] as const) {
        if (!t.cost[k]) continue;
        row.append(el('span', { class: `c ${res[k] < t.cost[k] ? 'short' : ''}`, text: `${t.cost[k]} ${label}` }));
      }
      parts.push(row);
    }
    if (t.warn) parts.push(el('div', { class: 'tip-warn', text: t.warn }));
    this.tooltip.replaceChildren(...parts);
    const r = src.node.getBoundingClientRect();
    const w = this.tooltip.offsetWidth || 260;
    this.tooltip.style.left = `${Math.max(8, Math.min(window.innerWidth - w - 8, r.left + r.width / 2 - w / 2))}px`;
    this.tooltip.style.bottom = `${window.innerHeight - r.top + 8}px`;
    this.tooltip.classList.add('show');
  }

  // ─── Command grid ──────────────────────────────────────────────

  /** An icon-only command button; its name and details live in the tooltip. */
  private gridButton(grid: HTMLElement, iconName: string, label: string, key: string, action: () => void, slot = ORDER_SLOT[iconName] ?? 0): HTMLButtonElement {
    const node = el('button', { class: 'cmd' }, icon(iconName, 'ico cmd-icon'), el('span', { class: 'key', text: key }), el('span', { class: 'cmd-cd' }));
    placeInSlot(node, slot);
    node.setAttribute('aria-label', label);
    node.addEventListener('click', action);
    grid.append(node);
    return node;
  }

  private buildOrders(): void {
    const units = (own: Squad[]) => own.filter((s) => s.def.kind !== 'structure');
    const add = (icon: string, label: string, key: string, tip: () => Tip, action: () => void, refresh: (b: HTMLButtonElement, own: Squad[]) => void, common = false) => {
      const node = this.gridButton(this.orderGrid, icon, label, key, action);
      this.tip(node, tip);
      this.orders.push({ node, refresh: (own) => refresh(node, own), common });
    };

    add('attack', 'Attack-Move', 'A', () => ({ title: 'Attack-Move', body: 'Move and engage anything on the way. Press A, then left-click the destination.', key: 'A' }), () => this.input.attackMoveMode(), (b, own) => {
      b.disabled = units(own).length === 0;
      b.classList.toggle('active', this.ui.mode.kind === 'attackMove');
    }, true);
    add('stop', 'Stop', 'S', () => ({ title: 'Stop', body: 'Cancel all orders.', key: 'S' }), () => this.input.stop(), (b, own) => (b.disabled = units(own).length === 0), true);
    add('retreat', 'Retreat', 'R', () => ({ title: 'Retreat', body: 'Fall back to headquarters. Retreating units run faster, take less fire and cannot be pinned, but they take no other orders until they get there. Tanks cannot retreat: drive them back and have engineers repair them.', key: 'R' }), () => this.input.retreat(), (b, own) => {
      b.disabled = units(own).length === 0;
      // Tanks cannot retreat.
      if (units(own).length > 0 && units(own).every((s) => s.def.kind === 'vehicle')) b.style.display = 'none';
    }, true);
    add('reinforce', 'Reinforce', 'E', () => {
      const soft = this.input.selectedOwn().filter((s) => (s.def.kind === 'infantry' || s.def.kind === 'team') && aliveCount(s) < s.def.models);
      const cost = soft.length === 1 ? { manpower: reinforceCost(soft[0].def), munitions: 0, fuel: 0 } : undefined;
      return { title: 'Reinforce', body: 'Each press queues one soldier, paid for now, in the squad’s queue (three jobs at a time, the upgrade included). They join one after another. Must stay near headquarters or a supplied friendly point, or the rest are called off and refunded.', key: 'E', cost };
    }, () => this.input.reinforce(), (b, own) => {
      b.disabled = !own.some((s) => (s.def.kind === 'infantry' || s.def.kind === 'team') && aliveCount(s) + s.reinforceQueued < s.def.models);
    });
    add('repair', 'Repair', 'F', () => ({
      title: 'Repair',
      body: 'Click, then click a damaged tank, the headquarters or a damaged defense. The engineers work until it is fully repaired and do not fight while they work. Shift-click to repair several in a row.',
      key: 'F',
    }), () => this.input.repairMode(), (b, own) => {
      b.style.display = own.some((s) => s.def.canRepair) ? '' : 'none';
      b.classList.toggle('active', this.ui.mode.kind === 'repair');
    });
    add('setup', 'Set Up', 'D', () => ({
      title: 'Set Up / Tear Down',
      body: 'Set a weapon team up to fire, aimed at the cursor (the firing cone shows as you aim), or pack it up to move. Tip: right-click drag to move and set up in one order.',
      key: 'D',
    }), () => this.input.setupMode(), (b, own) => {
      const teams = own.filter((s) => s.def.kind === 'team');
      // Only weapon teams set up; hide the button otherwise so engineers' build buttons fit.
      b.style.display = teams.length === 0 ? 'none' : '';
      b.classList.toggle('on', teams.some((s) => s.setup === 'deployed' || s.setup === 'settingUp'));
      b.classList.toggle('active', this.ui.mode.kind === 'setup');
    });
    for (const hotkey of ['G', 'B']) {
      const holderOf = (own: Squad[]) => own.find((s) => s.def.abilities.some((a) => ABILITIES[a].hotkey === hotkey));
      add(hotkey === 'G' ? 'grenade' : 'barrage', hotkey === 'G' ? 'Grenade' : 'Barrage', hotkey, () => {
        const holder = holderOf(this.input.selectedOwn());
        if (!holder) return { title: '—' };
        const ab = ABILITIES[holder.def.abilities.find((a) => ABILITIES[a].hotkey === hotkey)!];
        const cd = Math.max(0, holder.cooldowns[ab.id] ?? 0);
        return { title: ab.name, body: ab.description, key: hotkey, cost: ab.cost, warn: cd > 0 ? `Recharging: ${Math.ceil(cd)}s` : undefined };
      }, () => this.input.abilityMode(hotkey), (b, own) => {
        const holder = holderOf(own);
        b.style.display = holder ? '' : 'none';
        if (!holder) return;
        const ab = ABILITIES[holder.def.abilities.find((a) => ABILITIES[a].hotkey === hotkey)!];
        const cd = Math.max(0, holder.cooldowns[ab.id] ?? 0);
        (b.querySelector('.cmd-cd') as HTMLElement).textContent = cd > 0 ? String(Math.ceil(cd)) : '';
        b.disabled = cd > 0 || !canAfford(this.world.teams[this.player].resources, ab.cost);
        b.classList.toggle('active', this.ui.mode.kind === 'ability' && this.ui.mode.abilityId === ab.id);
      });
    }
  }

  /**
   * The engineers' two submenus: Build (Q) for field defenses and Base (W) for
   * the tier buildings that unlock the rest of the army.
   */
  private buildDefenseButtons(): void {
    const builders = (own: Squad[]) => own.some((s) => s.def.builds.length > 0);
    const open = this.gridButton(this.orderGrid, 'build', 'Build', 'Q', () => this.input.toggleBuildMenu('defense'));
    this.tip(open, () => ({ title: 'Build', body: 'Field defenses: sandbags, barbed wire, tank traps, mines, MG nests, bunkers and aid stations.', key: 'Q' }));
    this.orders.push({ node: open, refresh: (own) => (open.style.display = builders(own) ? '' : 'none') });
    const base = this.gridButton(this.orderGrid, 'base', 'Base', 'W', () => this.input.toggleBuildMenu('base'));
    this.tip(base, () => ({ title: 'Base', body: 'Tier buildings: each one unlocks more of the army at headquarters. Tier 1 support weapons, Tier 2 anti-tank, Tier 3 tanks.', key: 'W' }));
    this.orders.push({ node: base, refresh: (own) => (base.style.display = builders(own) && !this.world.techFree ? '' : 'none') });
    for (const id of BUILDABLE_IDS) {
      const def = BUILDABLES[id];
      const page = def.page ?? 'defense';
      const index = BUILDABLE_IDS.filter((b) => (BUILDABLES[b].page ?? 'defense') === page && (page === 'defense' || b.slice(-1) === id.slice(-1))).indexOf(id);
      const slot = page === 'base' ? Number(id.slice(-1)) - 1 : index;
      const node = this.gridButton(this.orderGrid, page === 'base' ? `tech${id.slice(-1)}` : id, def.name, def.hotkey, () => this.input.buildMode(id), slot);
      const how = def.shape === 'line' ? `Click and drag to lay a line of up to ${def.maxLength} tiles. Cost is per tile.` : 'Click to place.';
      this.tip(node, () => ({
        title: def.name,
        body: `${def.description}\n\n${how} ${def.buildTime}s of work${def.shape === 'line' ? ' each' : ''} for one squad; more engineers build faster.`,
        key: def.hotkey,
        cost: def.cost,
        warn: this.buildBlock(def),
      }));
      this.orders.push({
        buildPage: page,
        node,
        refresh: (own) => {
          const can = own.some((s) => s.def.builds.includes(id));
          const blocked = this.buildBlock(def);
          node.style.display = can ? '' : 'none';
          node.disabled = !canAfford(this.world.teams[this.player].resources, def.cost) || !!blocked;
          node.classList.toggle('locked', !!blocked);
          node.classList.toggle('active', this.ui.mode.kind === 'build' && this.ui.mode.buildId === id);
        },
      });
    }
    for (const page of ['defense', 'base'] as const) {
      const back = this.gridButton(this.orderGrid, 'back', 'Back', 'Esc', () => (this.ui.buildMenu = false), 11);
      this.tip(back, () => ({ title: 'Back', body: 'Close this menu.', key: 'Esc' }));
      this.orders.push({ buildPage: page, node: back, refresh: () => {} });
    }
  }

  /** Why a building cannot be started yet (already standing, or its tier is missing), or undefined. */
  private buildBlock(def: (typeof BUILDABLES)[string]): string | undefined {
    const standing = (unitId?: string) => this.world.squads.some((s) => !s.dead && s.team === this.player && s.def.id === unitId);
    if (def.unique && (standing(def.unit) || this.world.constructions.some((c) => c.team === this.player && c.buildId === def.id))) return 'Already built';
    if (def.requires && !standing(def.requires)) return `Needs the ${UNITS[def.requires].name}`;
    return undefined;
  }

  /** Weapon upgrade buttons (T, Y), shown when a selected squad can still take one. */
  private buildUpgradeButtons(): void {
    for (const hotkey of ['T', 'Y']) {
      const offer = (own: Squad[]) => {
        for (const sq of own) {
          const id = sq.def.upgrades.find((u) => UPGRADES[u].hotkey === hotkey);
          if (id) return { sq, def: UPGRADES[id] };
        }
        return null;
      };
      const node = this.gridButton(this.upgradePanel, 'upgrade', 'Upgrade', hotkey, () => this.input.upgrade(hotkey), 0);
      node.classList.add('upgrade');
      this.tip(node, () => {
        const o = offer(this.input.selectedOwn());
        if (!o) return { title: '—' };
        const taken = o.sq.upgrades.length > 0 || o.sq.upgrading;
        return {
          title: `Upgrade: ${o.def.name}`,
          body: `${o.def.description}

Buy near headquarters or a supplied friendly point. Arrives in ${o.def.time}s. One upgrade per squad; reinforcements replace the new weapon first.`,
          key: hotkey,
          cost: o.def.cost,
          warn: !this.world.hasTech(this.player, o.def.requires)
            ? `Locked: build the ${UNITS[o.def.requires!].name} first (engineers, Base menu)`
            : taken
              ? 'This squad already has an upgrade'
              : undefined,
        };
      });
      this.orders.push({
        node,
        refresh: (own) => {
          const o = offer(own);
          node.style.display = o ? '' : 'none';
          if (!o) return;
          // Show what the upgrade gives: an anti-tank weapon or a machine gun.
          const kind = o.def.weapons.some((w) => WEAPONS[w].prefers === 'vehicle') ? 'at' : 'mg';
          if (node.dataset.icon !== kind) {
            node.dataset.icon = kind;
            node.querySelector('.cmd-icon')!.replaceWith(icon(kind, 'ico cmd-icon'));
          }
          const open = own.some((s) => s.def.upgrades.includes(o.def.id) && s.upgrades.length === 0 && !s.upgrading);
          const unlocked = this.world.hasTech(this.player, o.def.requires);
          node.classList.toggle('locked', !unlocked);
          node.disabled = !open || !unlocked || !canAfford(this.world.teams[this.player].resources, o.def.cost);
        },
      });
    }
  }

  /** Tabs over the order grid for the headquarters and each tier building: click to select it and recruit there. */
  private buildBuildingTabs(): void {
    const team = this.world.teams[this.player];
    const prefix = team.faction.id === 'ija' ? 'ija_' : 'us_';
    const ids = [`${prefix}hq`, ...Object.keys(UNITS).filter((u) => UNITS[u].role === 'tech' && u.startsWith(prefix)).sort()];
    for (const id of ids) {
      const def = UNITS[id];
      const glyph = def.role === 'hq' ? 'hq' : `tech${id.slice(-1)}`;
      const node = el('button', { class: 'btab' }, icon(glyph, 'ico'));
      const find = () =>
        def.role === 'hq'
          ? this.world.hqOf(this.player)
          : this.world.squads.find((s) => !s.dead && s.team === this.player && s.def.id === id && s.building === null);
      node.addEventListener('click', () => {
        const sq = find();
        if (sq) this.input.select([sq.id]);
      });
      node.addEventListener('dblclick', () => this.input.centerOnSelection());
      this.tip(node, () => {
        const sq = find();
        return sq
          ? { title: def.name, body: 'Click to select it and recruit its units; double-click to go there.' }
          : { title: def.name, warn: 'Not built yet: engineers raise it from the Base menu (W).' };
      });
      this.buildingTabNodes.push({ node, find });
      this.buildingTabs.append(node);
    }
  }

  private renderBuildingTabs(): void {
    const selected = new Set(this.input.selectedOwn().map((s) => s.id));
    for (const { node, find } of this.buildingTabNodes) {
      const sq = find();
      node.classList.toggle('built', !!sq);
      node.classList.toggle('active', !!sq && selected.has(sq.id));
      node.disabled = !sq;
    }
  }

  /** HQ: set the rally point where new units go. */
  private rallyButton(): void {
    const node = this.gridButton(
      this.buildGrid,
      'rally',
      'Rally Point',
      '',
      () => {
        if (!this.input.selectedOwn().some((s) => s.def.role === 'hq' || s.def.role === 'tech')) this.input.selectHq();
        this.input.rallyMode();
      },
      7,
    );
    this.tip(node, () => ({
      title: 'Rally Point',
      body: 'Click, then click the map: new units walk to the flag once recruited. With the HQ selected you can also right-click the map to move it.',
    }));
    this.rallyNode = node;
  }

  private buildButton(id: string): void {
    const def = UNITS[id];
    const node = this.gridButton(
      this.buildGrid,
      unitIcon(def),
      def.name,
      '',
      () => {
        const r = queueProduction(this.world, this.player, id, this.producer());
        if (!r.ok) this.toast(r.reason ?? 'Cannot build', 'bad');
      },
      def.doctrine ? 6 : UNIT_SLOT[def.role] ?? 0,
    );
    this.tip(node, () => ({
      title: def.type ? `${def.name} · ${def.type}` : def.name,
      body: `${def.description}\n\nPopulation ${def.pop} · Build time ${def.buildTime}s`,
      cost: def.cost,
      warn: this.world.hasTech(this.player, def.requires) ? undefined : `Locked: engineers must build the ${UNITS[def.requires!].name} (Base menu, W)`,
    }));
    this.builds.push({ id, node });
  }

  // ─── Doctrine: the army's way of fighting and its call-ins ─────

  private buildDoctrineUi(): void {
    const team = this.world.teams[this.player];
    const cards = doctrinesOf(team.faction.id).map((d) => {
      const unit = UNITS[d.unit];
      const pick = el(
        'button',
        { class: 'doctrine-card' },
        el('div', { class: 'dc-top' }, portrait(d.commander, 'cmdr dc-portrait'), banner(d)),
        el('div', { class: 'dc-commander', text: `${d.commander.title} ${d.commander.name}` }),
        el('div', { class: 'dc-name', text: d.name }),
        el('div', { class: 'dc-style', text: d.style }),
        el('p', { class: 'dc-desc', text: d.description }),
        el('div', { class: 'dc-line' }, el('b', { text: 'Unit ' }), `${unit.name} · ${unit.type}`),
        ...d.callIns.map((c) => el('div', { class: 'dc-line' }, el('b', { text: `${c.cp} CP ` }), c.name)),
      );
      pick.addEventListener('click', () => {
        const r = chooseDoctrine(this.world, this.player, d.id);
        if (!r.ok) this.toast(r.reason, 'bad');
        this.picker.classList.remove('show');
      });
      return pick;
    });
    const close = el('button', { class: 'corner-btn', text: 'Later' });
    close.addEventListener('click', () => this.picker.classList.remove('show'));
    this.picker.append(
      el('div', { class: 'picker-box' }, el('div', { class: 'picker-title', text: 'Pumili ng Doktrina' }), el('div', { class: 'picker-sub', text: 'Choose how your army fights this battle. You can only choose once.' }), el('div', { class: 'picker-cards' }, ...cards), close),
    );
  }

  /** The doctrine strip above the orders: a chooser at first, then the call-ins and command points. */
  private renderDoctrine(): void {
    const team = this.world.teams[this.player];
    if (this.world.techFree && !team.doctrine) {
      this.doctrineBar.style.display = 'none';
      return;
    }
    this.doctrineBar.style.display = '';
    if (this.doctrineShown !== team.doctrine) {
      this.doctrineShown = team.doctrine;
      this.callInNodes.length = 0;
      if (!team.doctrine) {
        const choose = el('button', { class: 'doctrine-choose' }, icon('doctrine', 'ico'), el('span', { text: 'Pumili ng Doktrina' }));
        choose.addEventListener('click', () => this.picker.classList.add('show'));
        this.tip(choose, () => ({ title: 'Doctrine', body: 'Choose how your army fights: each doctrine brings its own special unit and two commander call-ins that unlock as you earn command points in battle.' }));
        this.doctrineBar.replaceChildren(choose);
      } else {
        const d = DOCTRINES[team.doctrine];
        this.cpFill = el('div', { class: 'fill' });
        this.cpText = el('span', { class: 'cp-text' });
        const head = el('div', { class: 'db-head' }, portrait(d.commander, 'cmdr db-portrait'), el('div', { class: 'db-titles' }, el('div', { class: 'db-name', text: d.name }), el('div', { class: 'db-commander', text: `${d.commander.title} ${d.commander.name}` }), el('div', { class: 'db-cp' }, this.cpText, el('div', { class: 'cp-bar' }, this.cpFill))));
        const buttons = d.callIns.map((c) => {
          const node = el('button', { class: 'cmd callin' }, icon(callInIcon(c), 'ico cmd-icon'), el('span', { class: 'callin-cp', text: `${c.cp}` }), el('span', { class: 'cmd-cd' }));
          node.addEventListener('click', () => this.input.callIn(c.id));
          this.tip(node, () => ({ title: c.name, body: c.description, cost: c.cost, warn: callInBlock(this.world, this.player, c.id) ?? undefined }));
          this.callInNodes.push({ id: c.id, node });
          return node;
        });
        this.tip(head, () => ({ title: d.name, body: `${d.commander.title} ${d.commander.name} · ${d.style}

${d.description}` }));
        this.doctrineBar.replaceChildren(head, el('div', { class: 'db-calls' }, ...buttons));
      }
    }
    if (!team.doctrine) return;
    const whole = Math.floor(team.cp);
    if (this.cpFill) this.cpFill.style.width = `${Math.round((team.cp - whole) * 100)}%`;
    if (this.cpText) this.cpText.textContent = `${whole} CP`;
    for (const { id, node } of this.callInNodes) {
      const block = callInBlock(this.world, this.player, id);
      const ready = team.callInReady[id] ?? 0;
      node.disabled = !!block;
      node.classList.toggle('locked', team.cp < CALL_INS[id].cp);
      node.classList.toggle('active', this.ui.mode.kind === 'callIn' && this.ui.mode.callInId === id);
      (node.querySelector('.cmd-cd') as HTMLElement).textContent = ready > this.world.time ? String(Math.ceil(ready - this.world.time)) : '';
    }
  }

  // ─── Notifications ─────────────────────────────────────────────

  toast(text: string, tone: Tone = 'info'): void {
    const t = el('div', { class: `toast ${tone}`, text });
    this.toasts.prepend(t);
    while (this.toasts.childElementCount > 6) this.toasts.lastElementChild!.remove();
    setTimeout(() => t.classList.add('fade'), 3500);
    setTimeout(() => t.remove(), 4200);
  }

  consume(events: readonly SimEvent[]): void {
    for (const e of events) {
      if (e.type === 'notify' && (e.team === this.player || e.team === -1)) this.toast(e.text, e.tone);
    }
  }

  // ─── Per-tick refresh ──────────────────────────────────────────

  update(dt: number, force = false): void {
    this.timer -= dt;
    if (this.timer > 0 && !force) return;
    this.timer = 0.1;
    const { world } = this;
    const team = world.teams[this.player];
    const r = team.resources;
    const inc = team.income;
    for (const k of ['manpower', 'munitions', 'fuel'] as const) {
      this.res[k].textContent = String(Math.floor(r[k]));
      this.income[k].textContent = `+${Math.round(inc[k])}`;
    }
    this.res.pop.textContent = `${team.pop}/${ECONOMY.popCap}`;
    for (const t of [0, 1] as const) {
      this.tickets[t].textContent = String(world.teams[t].tickets);
      this.ticketBars[t].style.width = `${(world.teams[t].tickets / 500) * 100}%`;
    }
    this.pointIcons.replaceChildren(
      ...world.points.filter((p) => p.kind === 'victory').map((p) => el('span', { class: `vp o${p.owner}`, title: p.name, text: 'V' })),
    );
    this.clock.textContent = formatTime(world.time);
    if (this.objective) this.renderObjective();

    const own = this.input.selectedOwn();
    const units = own.filter((s) => s.def.kind !== 'structure');
    // Units selected → their orders; HQ or nothing selected → the recruit menu; a nest, bunker or tent → nothing to order.
    const fort = units.length === 0 ? own.find((s) => s.def.role === 'fort') : undefined;
    const building = units.length === 0 && !fort;
    if (this.ui.buildMenu && !own.some((s) => s.def.builds.length > 0)) this.ui.buildMenu = false;
    this.orderGrid.style.display = building ? 'none' : '';
    this.buildGrid.style.display = building ? '' : 'none';
    // One unit type selected (one squad or several of the same kind): its abilities show; a mixed group only gets the common orders.
    const kinds = new Set(own.filter((s) => s.def.kind !== 'structure').map((s) => s.def.id));
    const single = kinds.size <= 1;
    for (const c of this.orders) {
      c.node.style.display = '';
      c.refresh(own);
      if (!single && !c.common) c.node.style.display = 'none';
      if ((c.buildPage ?? false) !== this.ui.buildMenu) c.node.style.display = 'none';
      if (fort) c.node.style.display = 'none';
    }
    const producer = this.producer();
    const tier = producer?.def.role === 'tech' ? producer.def.id : null;
    for (const b of this.builds) {
      const doctrine = UNITS[b.id].doctrine;
      b.node.style.display = (tier && UNITS[b.id].requires !== tier) || (doctrine && doctrine !== team.doctrine) ? 'none' : '';
      const open = this.world.hasTech(this.player, UNITS[b.id].requires);
      b.node.classList.toggle('locked', !open);
      b.node.disabled = !open || !canAfford(r, UNITS[b.id].cost);
    }
    this.rallyNode?.classList.toggle('active', this.ui.mode.kind === 'rally');
    // The order grid keeps its fixed squares; the recruit menu fills from the top-left.
    packGrid(this.buildGrid);
    // The upgrade column only when the selection has something to upgrade.
    this.upgradePanel.style.display = [...this.upgradePanel.querySelectorAll<HTMLElement>('.cmd')].some((n) => n.style.display !== 'none') ? '' : 'none';
    this.renderBuildingTabs();
    this.renderDoctrine();
    this.renderQueue();
    this.renderRoster();
    this.renderUnitPanel();
    if (this.tipSource) this.renderTip();
  }

  private renderObjective(): void {
    const { world } = this;
    const o = world.objective;
    const s = world.scenario;
    const { title, detail, box } = this.objective!;
    if (!s?.defense && !s?.offensive) {
      if (world.win === 'annihilation') {
        const [mine, theirs] = forcesRemaining(world);
        title.textContent = 'Annihilation';
        detail.textContent = `Destroy every enemy unit and their HQ · Enemy forces: ${theirs} · Yours: ${mine}`;
      } else {
        title.textContent = 'Free battle';
        detail.textContent = 'No victory condition · Leave from the Menu when you are done';
      }
      return;
    }
    if (s.defense) {
      const hold = s.defense.hold.map((i) => world.points[i]);
      const threatened = hold.some((p) => p.contested || p.control < 1);
      title.textContent = o.wave === 0 ? 'Prepare your defences' : `Wave ${o.wave} / ${o.totalWaves}`;
      if (o.wave < o.totalWaves) detail.textContent = `Next wave in ${formatTime(Math.max(0, o.nextWaveIn))}`;
      else detail.textContent = `Final wave · ${o.waveSquads.length} enemy units remaining`;
      detail.textContent += ` · Hold ${hold.map((p) => p.name).join(', ')}${threatened ? ' — UNDER ATTACK' : ''}`;
      box.classList.toggle('alert', threatened);
    } else if (s.offensive) {
      const next = world.points[s.offensive.sectors[Math.min(o.sector, o.totalSectors - 1)]];
      title.textContent = `Sector ${Math.min(o.sector + 1, o.totalSectors)} / ${o.totalSectors} · ${next.name}`;
      detail.textContent = `Time remaining ${formatTime(Math.max(0, o.timeLeft))}`;
      box.classList.toggle('alert', o.timeLeft < 60);
    }
  }

  // ─── Production queue ────────────────────────────────────────

  /** Squads whose queue is shown: the selected units, or none (then it is the HQ's queue). */
  /** The building whose recruits are shown: a selected tier building, otherwise headquarters. */
  private producer(): Squad | undefined {
    const own = this.input.selectedOwn();
    return own.find((s) => s.def.role === 'tech') ?? this.world.hqOf(this.player);
  }

  private queueOwners(): Squad[] {
    return this.input.selectedOwn().filter((s) => s.def.kind !== 'structure');
  }

  /**
   * The queue of whatever is selected: the HQ's
   * recruits when the HQ (or nothing) is selected, otherwise the selected
   * squads' own upgrades and reinforcements.
   */
  private queueJobs(): QueueJob[] {
    const jobs: QueueJob[] = [];
    const squads = this.queueOwners();
    if (squads.length > 0) return this.squadJobs(squads);
    const producer = this.producer();
    (producer?.production ?? []).forEach((item, i) => {
      const def = UNITS[item.unitId];
      jobs.push({
        key: `unit:${i}:${item.unitId}`,
        glyph: unitIcon(def),
        mark: '',
        running: i === 0,
        progress: i === 0 ? 1 - item.remaining / def.buildTime : 0,
        remaining: i === 0 ? item.remaining : null,
        title: def.name,
        body: i === 0 ? `Recruiting · ${Math.ceil(item.remaining)}s left.` : 'Waiting for the recruit ahead of it.',
        action: 'Click to cancel and get the full cost back.',
        cost: def.cost,
        click: () => cancelProduction(this.world, this.player, i, producer),
      });
    });
    return jobs;
  }

  private squadJobs(squads: Squad[]): QueueJob[] {
    const jobs: QueueJob[] = [];
    for (const sq of squads) {
      if (!sq.upgrading) continue;
      const def = UPGRADES[sq.upgrading.id];
      jobs.push({
        key: `upgrade:${sq.id}`,
        glyph: unitIcon(sq.def),
        mark: '⇪',
        running: true,
        progress: 1 - Math.max(0, sq.upgrading.remaining) / def.time,
        remaining: Math.max(0, sq.upgrading.remaining),
        title: `${def.name} for ${sq.def.name}`,
        body: `Weapons on the way · ${Math.ceil(sq.upgrading.remaining)}s left.`,
        action: 'Click to cancel and get the munitions back.',
        cost: def.cost,
        click: () => cancelUpgrade(this.world, sq),
      });
    }
    for (const sq of squads) {
      // One slot per soldier on the way; only the first is being brought up.
      for (let i = 0; i < sq.reinforceQueued; i++) {
        const first = i === 0;
        jobs.push({
          key: `reinforce:${sq.id}:${i}`,
          glyph: unitIcon(sq.def),
          mark: '+',
          running: first,
          progress: first ? reinforceProgress(sq) : 0,
          remaining: Math.max(0, sq.reinforceTimer) + i * LOGISTICS.reinforceTime,
          title: `Soldier for ${sq.def.name}`,
          body: first
            ? `${aliveCount(sq)}/${sq.def.models} men · joins in ${Math.ceil(Math.max(0, sq.reinforceTimer))}s.`
            : `Waiting behind ${i} other soldier${i > 1 ? 's' : ''}.`,
          action: 'Click to call off the last soldier and get the manpower back.',
          cost: { manpower: reinforceCost(sq.def), munitions: 0, fuel: 0 },
          click: () => cancelReinforce(this.world, sq),
        });
      }
    }
    return jobs;
  }

  private queueSlot(i: number): HTMLElement {
    const slot = el(
      'button',
      { class: 'qslot' },
      el('span', { class: 'qslot-fill' }),
      el('span', { class: 'qslot-glyph' }),
      el('span', { class: 'qslot-mark' }),
      el('span', { class: 'qslot-time' }),
    );
    // mousedown: slots refresh every tick and a click could fall between two frames.
    slot.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      this.queueJobs()[i]?.click();
    });
    this.tip(slot, () => {
      const job = this.queueJobs()[i];
      if (!job) {
        return {
          title: `Queue slot ${i + 1}`,
          body:
            this.queueOwners().length > 0
              ? 'This squad’s queue: its weapon upgrade and reinforcements show here while they run.'
              : `${this.producer()?.def.name ?? 'Headquarters'}: recruiting queue, up to ${ECONOMY.maxQueue} units at a time.`,
        };
      }
      return { title: job.title, body: `${job.body}\n${job.action}`, cost: job.cost };
    });
    this.queueSlots.push(slot);
    return slot;
  }

  private renderQueue(): void {
    const jobs = this.queueJobs();
    // Shown only while something is being recruited, reinforced or upgraded.
    const panel = this.queueSlots[0]?.parentElement;
    if (panel) panel.style.display = jobs.length ? '' : 'none';
    this.queueSlots.forEach((slot, i) => {
      const job = jobs[i];
      slot.classList.toggle('filled', !!job);
      slot.classList.toggle('active', !!job?.running);
      const glyph = slot.querySelector('.qslot-glyph') as HTMLElement;
      if (glyph.dataset.icon !== (job?.glyph ?? '')) {
        glyph.dataset.icon = job?.glyph ?? '';
        glyph.replaceChildren(...(job ? [icon(job.glyph)] : []));
      }
      (slot.querySelector('.qslot-mark') as HTMLElement).textContent = job?.mark ?? '';
      (slot.querySelector('.qslot-time') as HTMLElement).textContent = job && job.remaining !== null ? `${Math.ceil(job.remaining)}s` : '';
      (slot.querySelector('.qslot-fill') as HTMLElement).style.height = `${Math.round((job?.progress ?? 0) * 100)}%`;
    });
  }

  // ─── Unit roster (top right) ───────────────────────────────────

  private renderRoster(): void {
    const squads = this.world.squads.filter((s) => s.team === this.player && !s.dead && s.def.kind !== 'structure');
    const alive = new Set(squads.map((s) => s.id));
    for (const [id, card] of this.rosterCards) {
      if (alive.has(id)) continue;
      card.remove();
      this.rosterCards.delete(id);
    }
    for (const sq of squads) {
      let card = this.rosterCards.get(sq.id);
      if (!card) {
        card = this.rosterCard(sq);
        this.rosterCards.set(sq.id, card);
        this.roster.append(card);
      }
      this.refreshRosterCard(card, sq);
    }
  }

  /** A roster card: the unit's icon, health and squad size; the name is in the tooltip. */
  private rosterCard(sq: Squad): HTMLElement {
    const card = el(
      'button',
      { class: 'roster-card' },
      glyphOf(sq.def),
      el('span', { class: 'rc-name', text: sq.def.short }),
      el('span', { class: 'rc-group' }),
      el('span', { class: 'rc-state' }),
      el('span', { class: 'rc-count' }),
      el('div', { class: 'rc-bar' }, el('div', { class: 'fill' })),
      el('div', { class: 'rc-job' }, el('div', { class: 'fill' })),
    );
    // mousedown, not click: the card is refreshed often and a click can get lost between frames.
    card.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      this.input.select([sq.id], e.shiftKey);
    });
    card.addEventListener('dblclick', () => this.input.centerOnSelection());
    this.tip(card, () => ({ title: titleOf(sq), body: this.statusLine(sq) }));
    return card;
  }

  private refreshRosterCard(card: HTMLElement, sq: Squad): void {
    card.classList.toggle('selected', this.ui.selected.has(sq.id));
    card.classList.toggle('pinned', sq.suppState === 'pinned');
    card.classList.toggle('retreating', sq.retreating);
    card.classList.toggle('reinforcing', sq.reinforcing);
    card.classList.toggle('upgrading', !!sq.upgrading);
    const hp = healthFraction(sq);
    const fill = card.querySelector('.rc-bar .fill') as HTMLElement;
    fill.style.width = `${hp * 100}%`;
    fill.classList.toggle('low', hp < 0.35);
    const group = [...this.ui.groups].find(([, ids]) => ids.includes(sq.id))?.[0];
    (card.querySelector('.rc-group') as HTMLElement).textContent = (group !== undefined ? String(group) : '') + (sq.vet > 0 ? ' ' + '★'.repeat(sq.vet) : '');
    (card.querySelector('.rc-count') as HTMLElement).textContent = sq.def.kind !== 'vehicle' ? `${aliveCount(sq)}/${sq.def.models}` : '';
    (card.querySelector('.rc-state') as HTMLElement).textContent = '';
    // The squad's own job, shown on its card too: reinforcing first, else the upgrade on its way.
    const job = sq.reinforcing ? reinforceProgress(sq) : sq.upgrading ? 1 - Math.max(0, sq.upgrading.remaining) / UPGRADES[sq.upgrading.id].time : 0;
    (card.querySelector('.rc-job .fill') as HTMLElement).style.width = `${Math.round(job * 100)}%`;
  }

  private statusLine(sq: Squad): string {
    const parts = [`${Math.round(healthFraction(sq) * 100)}% health`];
    if (sq.def.kind !== 'vehicle') parts.push(`${aliveCount(sq)} of ${sq.def.models} men`);
    if (sq.retreating) parts.push('retreating');
    else if (sq.suppState !== 'normal') parts.push(sq.suppState);
    if (sq.def.kind === 'team') parts.push(sq.setup === 'deployed' ? 'set up' : 'packed');
    return parts.join(' · ') + '\nClick to select, double-click to jump there.';
  }

  // ─── Unit card (bottom centre) ─────────────────────────────────

  private renderUnitPanel(): void {
    const squads = [...this.ui.selected].map((id) => this.world.get(id)).filter((s): s is Squad => !!s && !s.dead);
    const key = squads.map((s) => s.id).join(',');
    if (squads.length === 0 && this.ui.inspect) {
      const card = this.inspectCard();
      if (card) {
        const k = `inspect:${card.key}`;
        if (this.selectionKey !== k) {
          this.selectionKey = k;
          this.unitPanel.replaceChildren(card.node);
        }
        return;
      }
      this.ui.inspect = null;
    }
    if (squads.length === 0) {
      if (this.selectionKey !== 'none') {
        this.selectionKey = 'none';
        const team = this.world.teams[this.player];
        this.unitPanel.replaceChildren(el('div', { class: 'empty-card' }, icon('hq', 'ico empty-icon'), el('div', {}, el('div', { class: 'empty-name', text: team.faction.name }), el('div', { class: 'empty-sub', text: 'No unit selected' }))));
      }
      return;
    }
    this.selectionKey = key;
    if (squads.length === 1) {
      this.unitPanel.replaceChildren(this.portraitCard(squads[0]));
      return;
    }
    this.unitPanel.replaceChildren(el('div', { class: 'multi' }, ...squads.map((s) => this.miniCard(s))));
  }

  /** Info card for a clicked defense tile, construction job or mine. */
  private inspectCard(): { key: string; node: HTMLElement } | null {
    const ins = this.ui.inspect;
    if (!ins) return null;
    const world = this.world;
    const card = (glyph: string, name: string, desc: string, lines: [string, string][], health: number | null, hint?: string) => {
      const fill = el('div', { class: 'fill' });
      fill.style.width = `${(health ?? 1) * 100}%`;
      const portrait = el('div', { class: 'portrait' }, icon(glyph, 'ico portrait-icon'));
      this.tip(portrait, () => ({ title: name, body: desc }));
      return el(
        'div',
        { class: `portrait-card t${this.player}` },
        portrait,
        el(
          'div',
          { class: 'portrait-text' },
          el('div', { class: 'portrait-name', text: name }),
          el('div', { class: 'hpbar big' }, fill),
          el('div', { class: 'chips' }, ...lines.map(([k, v]) => el('span', { class: 'chip', text: `${k} ${v}` }))),
          ...(hint ? [el('div', { class: 'portrait-hint', text: hint })] : []),
        ),
      );
    };
    if (ins.kind === 'defense') {
      const d = defenseAt(world, ins.tx, ins.ty);
      if (!d) return null;
      const t = TERRAIN[world.map.get(ins.tx, ins.ty)];
      const blocks = [t.infantryCost === Infinity ? 'infantry' : '', t.vehicleCost === Infinity ? 'vehicles' : ''].filter(Boolean).join(' and ') || 'nothing';
      const hp = Math.ceil(d.hp);
      const damaged = d.hp < d.maxHp;
      return {
        key: `d:${ins.tx},${ins.ty}:${hp}`,
        node: card(d.def.id, d.def.name, d.def.description, [
          ['Health', `${hp} / ${d.maxHp}`],
          ['Cover', t.cover === 'none' ? 'None' : t.cover === 'heavy' ? 'Heavy' : t.cover === 'light' ? 'Light' : 'Exposed'],
          ['Blocks', blocks],
          ['Explosives', d.def.blastResist < 1 ? 'Resists them' : 'Wear it down'],
        ], d.hp / d.maxHp, damaged ? 'Damaged: right-click it with engineers selected to repair.' : undefined),
      };
    }
    if (ins.kind === 'construction') {
      const c = world.constructions.find((k) => k.id === ins.id);
      if (!c) return null;
      const def = BUILDABLES[c.buildId];
      const done = c.tiles.filter((t) => t.done).length;
      const progress = (done + (c.tiles.find((t) => !t.done)?.progress ?? 0)) / c.tiles.length;
      const workers = workersOf(world, c).length;
      return {
        key: `c:${c.id}:${Math.round(progress * 100)}:${workers}`,
        node: card(def.id, `Building ${def.name}`, def.description, [
          ['Progress', `${Math.round(progress * 100)}%${def.shape === 'line' ? ` · ${done}/${c.tiles.length} tiles` : ''}`],
          ['Engineers', `${workers} squad${workers === 1 ? '' : 's'} working`],
        ], progress, 'Right-click it with more engineers selected to help build.'),
      };
    }
    const mine = world.mines.find((m) => m.id === ins.id);
    if (!mine) return null;
    const def = BUILDABLES.mine;
    return { key: `m:${mine.id}`, node: card('mine', def.name, def.description, [['Status', 'Armed · hidden from the enemy']], null) };
  }

  private miniCard(sq: Squad): HTMLElement {
    const fill = el('div', { class: 'fill' });
    fill.style.width = `${healthFraction(sq) * 100}%`;
    const soft = sq.def.kind === 'infantry' || sq.def.kind === 'team';
    const card = el(
      'button',
      { class: `mini t${sq.team}` },
      glyphOf(sq.def),
      el('span', { class: 'mini-count', text: soft ? `${aliveCount(sq)}/${sq.def.models}` : `${Math.round(healthFraction(sq) * 100)}%` }),
      el('div', { class: 'hp' }, fill),
    );
    if (sq.suppState !== 'normal') card.classList.add(sq.suppState);
    card.addEventListener('mousedown', (e) => this.input.select([sq.id], e.shiftKey));
    this.tip(card, () => ({ title: titleOf(sq), body: this.statusLine(sq) }));
    return card;
  }

  /**
   * The selected unit at a glance: portrait, name, health, one pip per soldier
   * and a few short status chips. The description is in the portrait's tooltip.
   */
  private portraitCard(sq: Squad): HTMLElement {
    const weapons = new Map<string, number>();
    for (const m of sq.models) if (m.alive) for (const w of m.weapons) weapons.set(w.def.name, (weapons.get(w.def.name) ?? 0) + 1);
    const hp = healthFraction(sq);
    const soft = sq.def.kind === 'infantry' || sq.def.kind === 'team';
    const chips: [string, string][] = [];
    if (sq.building !== null) chips.push([`Under construction ${Math.round(sq.building * 100)}%`, 'bad']);
    if (soft && sq.suppState !== 'normal') chips.push([sq.suppState === 'pinned' ? 'Pinned' : 'Suppressed', 'bad']);
    if (sq.retreating) chips.push(['Retreating', 'bad']);
    if (sq.reinforcePaused && sq.reinforceQueued > 0) chips.push(['Reinforcements paused', '']);
    if (sq.def.kind === 'team') chips.push([{ packed: 'Packed', settingUp: 'Setting up', deployed: 'Set up', tearingDown: 'Packing' }[sq.setup], sq.setup === 'deployed' ? 'good' : '']);
    if (sq.def.armor) chips.push([sq.def.vehicle ? `Armour ${sq.def.armor.front}/${sq.def.armor.rear}` : `Armour ${sq.def.armor.front}`, '']);
    for (const [n, c] of weapons) chips.push([c > 1 ? `${c}× ${n}` : n, 'weapon']);

    const enemy = sq.team !== this.player;
    const fill = el('div', { class: `fill ${hp < 0.35 ? 'low' : ''}` });
    fill.style.width = `${hp * 100}%`;
    const alive = sq.models.filter((x) => x.alive);
    const rows: HTMLElement[] = [el('div', { class: 'stat-row' }, el('span', { class: 'stat-label', text: 'Health' }), el('div', { class: 'hpbar big' }, fill), el('span', { class: 'stat-val', text: `${Math.round(hp * 100)}%` }))];
    if (soft) {
      rows.push(
        el(
          'div',
          { class: 'stat-row' },
          el('span', { class: 'stat-label', text: 'Men' }),
          el('div', { class: 'pips' }, ...Array.from({ length: sq.def.models }, (_, i) => {
            const m = alive[i];
            return el('span', { class: `pip ${m ? (m.hp / m.maxHp < 0.4 ? 'hurt' : '') : 'lost'}` });
          })),
          el('span', { class: 'stat-val', text: `${alive.length}/${sq.def.models}` }),
        ),
      );
    }
    const photo = soldierPhoto(sq, this.world.teams[sq.team].faction.id);
    const portrait = el('div', { class: `portrait ${photo ? 'photo' : ''}` }, photo ?? icon(unitIcon(sq.def), 'ico portrait-icon'), el('span', { class: 'portrait-vet', text: '★'.repeat(sq.vet) }));
    this.tip(portrait, () => ({ title: titleOf(sq), body: sq.def.description }));
    return el(
      'div',
      { class: `portrait-card t${sq.team}` },
      portrait,
      el(
        'div',
        { class: 'portrait-text' },
        el('div', { class: 'portrait-head' }, el('div', { class: 'portrait-name', text: sq.def.name }), el('div', { class: 'portrait-type', text: (sq.def.type || this.world.teams[sq.team].faction.name) + (enemy ? ' · enemy' : '') })),
        ...rows,
        el('div', { class: 'chips' }, ...chips.map(([text, tone]) => el('span', { class: `chip ${tone}`, text }))),
        el('div', { class: 'portrait-desc', text: sq.def.description }),
      ),
    );
  }

  /** Select the next infantry squad (or vehicle) that has no orders, and go to it. */
  private nextIdle(vehicles: boolean): void {
    const idle = this.world.squads.filter(
      (s) => !s.dead && s.team === this.player && (vehicles ? s.def.kind === 'vehicle' : s.def.kind === 'infantry' || s.def.kind === 'team') && s.order.kind === 'idle' && !s.moving,
    );
    if (!idle.length) {
      this.toast(vehicles ? 'No idle vehicles' : 'No idle infantry');
      return;
    }
    const sq = idle[this.idleIndex++ % idle.length];
    this.input.select([sq.id]);
    this.input.centerOnSelection();
  }
}

/** How far the next reinforcement is, 0..1. */
/** One job in the shared queue. */
interface QueueJob {
  key: string;
  glyph: string;
  /** Small marker for the kind of job: '+' reinforcing, '⇪' upgrade, '' recruiting. */
  mark: string;
  running: boolean;
  progress: number;
  remaining: number | null;
  title: string;
  body: string;
  action: string;
  cost?: Resources;
  click: () => void;
}

const reinforceProgress = (sq: Squad): number =>
  sq.reinforcing ? 1 - Math.max(0, sq.reinforceTimer) / LOGISTICS.reinforceTime : 0;

const RESOURCE_HELP: Record<string, string> = {
  mp: 'Recruits and reinforces soldiers. Income comes from your base; a larger army costs more upkeep.',
  mu: 'Pays for grenades, barrages and anti-tank weapons. Earned from munitions points (M).',
  fu: 'Pays for tanks. Earned from fuel points (F).',
  pop: 'Army size. Every unit takes population; you cannot exceed the cap.',
};
