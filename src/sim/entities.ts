import type { Buff } from './systems/doctrine';
import { WEAPONS } from '../data/weapons';
import type { FactionDef, LoadoutEntry, Owner, PointKind, ProjectileKind, Resources, TeamId, UnitDef, WeaponDef } from '../data/types';
import { add, rotate, type Vec2 } from '../core/vec';

export interface WeaponState {
  def: WeaponDef;
  cooldown: number;
  clip: number;
  reloading: number;
}

/** One soldier, or the single hull of a vehicle/structure. */
export interface Model {
  id: number;
  pos: Vec2;
  hp: number;
  maxHp: number;
  alive: boolean;
  facing: number;
  /** Which loadout entry this model carries; used for crew hand-over and reinforcing. */
  loadoutIndex: number;
  weapons: WeaponState[];
  coverSlot: Vec2 | null;
}

export type OrderKind = 'idle' | 'move' | 'attackMove' | 'attack' | 'retreat' | 'ability' | 'build' | 'repair' | 'garrison';

export interface Order {
  kind: OrderKind;
  dest?: Vec2;
  targetId?: number;
  abilityId?: string;
  /** Direction to face on arrival (right-click drag); weapon teams set up this way. */
  facing?: number;
  /** The house to go into (garrison orders). */
  houseId?: number;
}

export type SetupState = 'packed' | 'settingUp' | 'deployed' | 'tearingDown';
export type SuppressionState = 'normal' | 'suppressed' | 'pinned';

export interface ProductionItem {
  unitId: string;
  remaining: number;
}

export interface AbilityChannel {
  abilityId: string;
  target: Vec2;
  timer: number;
  shots: number;
}

/** The primary gameplay entity: a squad, team, vehicle or structure. */
export interface Squad {
  id: number;
  team: TeamId;
  def: UnitDef;
  pos: Vec2;
  heading: number;
  speedNow: number;
  reversing: boolean;
  moving: boolean;
  blockedTime: number;
  /** Seconds a vehicle has had somewhere to go but made no headway; long enough and it gives up. */
  stuckTime: number;
  stuckFrom: Vec2 | null;
  models: Model[];
  order: Order;
  queue: Order[];
  path: Vec2[];
  pathGoal: Vec2 | null;
  repathTimer: number;
  targetId: number | null;
  scanTimer: number;
  suppression: number;
  suppState: SuppressionState;
  lastSuppressed: number;
  retreating: boolean;
  /** The house the squad is holding, or null when it is outside. */
  garrison: number | null;
  setup: SetupState;
  setupTimer: number;
  setupFacing: number;
  turret: number;
  xp: number;
  vet: number;
  kills: number;
  cooldowns: Record<string, number>;
  channel: AbilityChannel | null;
  /** True while soldiers are queued to join the squad. */
  reinforcing: boolean;
  /** Soldiers paid for and waiting to arrive, one at a time. */
  reinforceQueued: number;
  reinforceTimer: number;
  production: ProductionItem[];
  /** Structures built by engineers: the tiles they take up, freed when they fall. */
  footprint: { tx: number; ty: number }[];
  /** Structures still going up: how far along (0..1); null once finished. */
  building: number | null;
  /** Reinforcements are waiting (squad too far from a base): shown, not cancelled. */
  reinforcePaused: boolean;
  rally: Vec2 | null;
  lastHurt: number;
  lastFired: number;
  dead: boolean;
  /** This squad's own loadout: the unit's, changed by any upgrade it bought. */
  loadout: LoadoutEntry[];
  /** Upgrades already bought. */
  upgrades: string[];
  /** Upgrade on its way, if any. */
  upgrading: { id: string; remaining: number } | null;
}

export interface CapturePoint {
  index: number;
  name: string;
  kind: PointKind;
  pos: Vec2;
  /** -1 = fully held by team 1, +1 = fully held by team 0. */
  control: number;
  owner: Owner;
  contested: boolean;
  sector: number;
  /** Locked points cannot change hands (offensive mode: future and already-taken sectors). */
  locked: boolean;
}

/** Engineers' work in progress: a line of tiles (or one mine) built one after another. */
export interface Construction {
  id: number;
  team: TeamId;
  buildId: string;
  /** The engineer squad that started the job. Others may help; once nobody works on it, it is cancelled. */
  ownerId: number;
  tiles: { tx: number; ty: number; progress: number; done: boolean }[];
  /** Structures: the tiles the finished building will take up. */
  footprint?: { tx: number; ty: number }[];
  /** Structures: which way it will face (its guns' arc), radians. */
  facing?: number;
  /** Structures: the frame standing on the site while it goes up. */
  squadId?: number;
}

export interface Mine {
  id: number;
  team: TeamId;
  pos: Vec2;
}

export interface Projectile {
  id: number;
  team: TeamId;
  sourceId: number | null;
  weapon: WeaponDef;
  from: Vec2;
  to: Vec2;
  t: number;
  flight: number;
  arc: boolean;
}

export interface TeamStats {
  produced: number;
  lost: number;
  killed: number;
}

export interface TeamState {
  id: TeamId;
  faction: FactionDef;
  resources: Resources;
  income: Resources;
  incomeMult: number;
  pop: number;
  tickets: number;
  hqId: number;
  base: Vec2;
  spawn: Vec2;
  retreatPoint: Vec2;
  stats: TeamStats;
  /** Chosen doctrine id, or null until picked. */
  doctrine: string | null;
  /** Command points earned so far (they unlock the doctrine's call-ins). */
  cp: number;
  /** When each call-in is ready again (battle time). */
  callInReady: Record<string, number>;
  buffs: Buff[];
  /** Areas revealed by spotter planes. */
  reveals: { pos: Vec2; radius: number; until: number }[];
}

export type Tone = 'info' | 'good' | 'bad';

export type SimEvent =
  | { type: 'shot'; from: Vec2; to: Vec2; projectile: ProjectileKind; hit: boolean; team: TeamId; weapon: string }
  | { type: 'launch'; from: Vec2; team: TeamId; weapon: string }
  | { type: 'explosion'; pos: Vec2; radius: number; weapon: string }
  /** A house fell in. */
  | { type: 'collapse'; pos: Vec2; radius: number }
  | { type: 'death'; pos: Vec2; team: TeamId; vehicle: boolean; heading: number }
  | { type: 'float'; pos: Vec2; text: string; tone: Tone }
  | { type: 'notify'; team: TeamId | -1; text: string; tone: Tone; pos?: Vec2 };

export function createWeaponStates(ids: readonly string[]): WeaponState[] {
  return ids.map((id) => {
    const def = WEAPONS[id];
    if (!def) throw new Error(`Unknown weapon ${id}`);
    return { def, cooldown: def.cooldown * 0.5, clip: def.clip, reloading: 0 };
  });
}

export function loadoutIndexFor(def: UnitDef, modelIndex: number): number {
  let acc = 0;
  for (let i = 0; i < def.loadout.length; i++) {
    acc += def.loadout[i].count;
    if (modelIndex < acc) return i;
  }
  return Math.max(0, def.loadout.length - 1);
}

export function createModel(id: number, loadout: readonly LoadoutEntry[], loadoutIndex: number, hp: number, pos: Vec2): Model {
  const entry = loadout[loadoutIndex];
  return {
    id,
    pos: { x: pos.x, y: pos.y },
    hp,
    maxHp: hp,
    alive: true,
    facing: 0,
    loadoutIndex,
    weapons: entry ? createWeaponStates(entry.weapons) : [],
    coverSlot: null,
  };
}

/** Loose rows of three, perpendicular to the heading (local x = forward). */
export function formationOffset(i: number, n: number): Vec2 {
  const perRow = Math.min(3, n);
  const row = Math.floor(i / perRow);
  const col = i % perRow;
  const rowCount = Math.min(perRow, n - row * perRow);
  const jitter = (((i * 37) % 7) - 3) * 0.8;
  return { x: -row * 13 + jitter, y: (col - (rowCount - 1) / 2) * 13 };
}

/** Crew huddle behind a deployed weapon. */
export function crewOffset(i: number): Vec2 {
  if (i === 0) return { x: 0, y: 0 };
  return { x: -10 - Math.floor((i - 1) / 2) * 8, y: i % 2 === 0 ? 8 : -8 };
}

export function createSquad(nextId: () => number, team: TeamId, def: UnitDef, pos: Vec2, heading: number): Squad {
  const models: Model[] = [];
  for (let i = 0; i < def.models; i++) {
    const p = add(pos, rotate(formationOffset(i, def.models), heading));
    const m = createModel(nextId(), def.loadout, loadoutIndexFor(def, i), def.modelHp, def.kind === 'infantry' || def.kind === 'team' ? p : pos);
    m.facing = heading;
    models.push(m);
  }
  return {
    id: nextId(),
    team,
    def,
    pos: { x: pos.x, y: pos.y },
    heading,
    speedNow: 0,
    reversing: false,
    moving: false,
    blockedTime: 0,
    stuckTime: 0,
    stuckFrom: null,
    models,
    order: { kind: 'idle' },
    queue: [],
    path: [],
    pathGoal: null,
    repathTimer: 0,
    targetId: null,
    scanTimer: 0,
    suppression: 0,
    suppState: 'normal',
    lastSuppressed: -Infinity,
    retreating: false,
    garrison: null,
    setup: 'packed',
    setupTimer: 0,
    setupFacing: heading,
    turret: heading,
    xp: 0,
    vet: 0,
    kills: 0,
    cooldowns: {},
    channel: null,
    reinforcing: false,
    reinforceQueued: 0,
    reinforceTimer: 0,
    production: [],
    footprint: [],
    building: null,
    reinforcePaused: false,
    rally: null,
    lastHurt: -Infinity,
    lastFired: -Infinity,
    dead: false,
    loadout: def.loadout.map((e) => ({ weapons: e.weapons, count: e.count })),
    upgrades: [],
    upgrading: null,
  };
}

export const isSoft = (sq: Squad): boolean => sq.def.kind === 'infantry' || sq.def.kind === 'team';

export function aliveCount(sq: Squad): number {
  let n = 0;
  for (const m of sq.models) if (m.alive) n++;
  return n;
}

export function healthFraction(sq: Squad): number {
  let hp = 0;
  for (const m of sq.models) if (m.alive) hp += m.hp;
  return hp / (sq.def.modelHp * sq.def.models);
}

/** Longest reach of any weapon the squad currently carries. */
export function maxRange(sq: Squad): number {
  let r = 0;
  for (const m of sq.models) {
    if (!m.alive) continue;
    for (const w of m.weapons) if (w.def.range > r) r = w.def.range;
  }
  return r;
}

/** What the squad's signature weapon wants to shoot at. */
export function preference(def: UnitDef): 'infantry' | 'vehicle' | 'any' {
  const first = def.loadout[0]?.weapons[0];
  return first ? WEAPONS[first].prefers : 'any';
}
