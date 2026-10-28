import { findHouses, updateGarrisons, type House } from './systems/garrison';
import { ECONOMY, TILE, VICTORY } from '../data/balance';
import { FACTIONS } from '../data/factions';
import { isHidden, updateDoctrines, type Drop, type Strike } from './systems/doctrine';
import { T } from '../data/terrain';
import type { Difficulty, MapDef, Owner, PlacedUnit, ScenarioDef, TeamId, WinCondition } from '../data/types';
import { UNITS } from '../data/units';
import { Rng } from '../core/rng';
import { add, angleTo, normalize, scale, sub, type Vec2 } from '../core/vec';
import {
  createSquad,
  type CapturePoint,
  type Construction,
  type Mine,
  type Projectile,
  type SimEvent,
  type Squad,
  type TeamState,
} from './entities';
import { GameMap } from './grid';
import { updateAbilities } from './systems/abilities';
import { updateCombat, updateProjectiles } from './systems/combat';
import { updateEconomy } from './systems/economy';
import { updateEngineering } from './systems/engineering';
import { updateUpgrades } from './systems/upgrades';
import { updateLogistics } from './systems/logistics';
import { updateMovement } from './systems/movement';
import { updateProduction } from './systems/production';
import { updateSuppression } from './systems/suppression';
import { Territory, updateCapture } from './systems/territory';
import { createObjective, updateObjectives, type ObjectiveState } from './systems/objectives';
import { Vision } from './systems/vision';

export interface WorldOptions {
  map: MapDef;
  factions: [string, string];
  seed?: number;
  incomeMult?: [number, number];
  /** Theater of War / Campaign rules; omitted for a plain skirmish. */
  scenario?: ScenarioDef;
  difficulty?: Difficulty;
  /** Win condition for open battles; overrides the scenario's own. */
  win?: WinCondition;
}

/** Owns all simulation state and runs the systems in a fixed order. No rendering here. */
export class World {
  time = 0;
  readonly map: GameMap;
  private houseList: House[] | null = null;
  /** Houses infantry can hold, found from the map on first use. */
  get houses(): House[] {
    return (this.houseList ??= findHouses(this));
  }
  readonly rng: Rng;
  readonly mapDef: MapDef;
  squads: Squad[] = [];
  readonly points: CapturePoint[];
  readonly teams: [TeamState, TeamState];
  projectiles: Projectile[] = [];
  constructions: Construction[] = [];
  mines: Mine[] = [];
  /** Commander artillery strikes and paradrops in progress. */
  strikes: Strike[] = [];
  drops: Drop[] = [];
  /** Damaged defense tiles: tile index → hit points left. Missing means untouched. */
  readonly defenseHp = new Map<number, number>();
  events: SimEvent[] = [];
  readonly vision: Vision;
  readonly territory: Territory;
  winner: Owner = -1;
  /**
   * Every unit is available without tier buildings: defense and assault
   * missions drop you into a running fight with the army already in place.
   */
  techFree = false;
  /** Why the match ended, for the end screen. */
  endReason = '';
  ticketTimer = 0;
  readonly scenario: ScenarioDef | null;
  readonly difficulty: Difficulty;
  readonly win: WinCondition;
  readonly objective: ObjectiveState;
  private readonly byId = new Map<number, Squad>();
  private idCounter = 1;

  constructor(opts: WorldOptions) {
    this.mapDef = opts.map;
    this.scenario = opts.scenario ?? null;
    this.techFree = !!this.scenario && this.scenario.mode !== 'skirmish';
    this.difficulty = opts.difficulty ?? 'normal';
    this.win = opts.win ?? opts.scenario?.win ?? 'points';
    const scenario = this.scenario;
    this.rng = new Rng(opts.seed ?? 1);
    this.map = GameMap.fromDef(opts.map);
    const center = { x: this.map.pixelWidth / 2, y: this.map.pixelHeight / 2 };

    this.points = opts.map.points.map((p, index) => ({
      index,
      name: p.name,
      kind: p.kind,
      pos: { x: p.x * TILE, y: p.y * TILE },
      control: 0,
      owner: -1 as Owner,
      contested: false,
      sector: -1,
      locked: false,
    }));
    for (const [i, owner] of Object.entries(scenario?.owners ?? {})) {
      const p = this.points[Number(i)];
      p.owner = owner;
      p.control = owner === 0 ? 1 : owner === 1 ? -1 : 0;
    }
    // Offensive: only the first sector can be fought over at the start.
    scenario?.offensive?.sectors.forEach((idx, order) => (this.points[idx].locked = order > 0));

    const teams = ([0, 1] as const).map((id): TeamState => {
      const faction = FACTIONS[opts.factions[id]];
      if (!faction) throw new Error(`Unknown faction ${opts.factions[id]}`);
      const b = opts.map.bases[id];
      const base = { x: b.x * TILE, y: b.y * TILE };
      const dir = normalize(sub(center, base));
      return {
        id,
        faction,
        resources: { ...(id === 0 && scenario?.startResources ? scenario.startResources : ECONOMY.start) },
        income: { manpower: 0, munitions: 0, fuel: 0 },
        incomeMult: opts.incomeMult?.[id] ?? 1,
        pop: 0,
        tickets: VICTORY.tickets,
        hqId: -1,
        base,
        spawn: add(base, scale(dir, TILE * 5.5)),
        retreatPoint: add(base, scale(dir, TILE * 4)),
        stats: { produced: 0, lost: 0, killed: 0 },
        doctrine: null,
        cp: 0,
        callInReady: {},
        buffs: [],
        reveals: [],
      };
    });
    this.teams = [teams[0], teams[1]];

    for (const team of this.teams) {
      this.stampFootprint(team.base, 2.3);
      team.spawn = this.map.nearestPassable(team.spawn, 'vehicle');
      team.retreatPoint = this.map.nearestPassable(team.retreatPoint, 'infantry');
      const facing = angleTo(team.base, center);
      const hq = this.spawn(team.id, team.faction.hq, team.base, facing);
      team.hqId = hq.id;
      const placed = team.id === 0 ? scenario?.playerUnits : scenario && scenario.mode !== 'skirmish' ? (scenario.enemyUnits ?? []) : undefined;
      if (placed) {
        this.place(team.id, placed);
        continue;
      }
      team.faction.starting.forEach((unitId, i) => {
        const offset = scale(normalize({ x: -Math.sin(facing), y: Math.cos(facing) }), (i - (team.faction.starting.length - 1) / 2) * 40);
        this.spawn(team.id, unitId, this.map.nearestPassable(add(team.spawn, offset), 'infantry'), facing);
      });
    }
    this.map.changes.length = 0;

    this.territory = new Territory(this.map, this.points, [this.teams[0].base, this.teams[1].base]);
    this.vision = new Vision(this.map);
    this.vision.recompute(this);
    this.objective = createObjective(this.scenario);
  }

  private place(team: TeamId, units: readonly PlacedUnit[]): void {
    for (const u of units) {
      const def = UNITS[u.unitId];
      const facing = ((u.facing ?? 0) * Math.PI) / 180;
      const pos = this.map.nearestPassable({ x: u.x * TILE, y: u.y * TILE }, def.vehicle ? 'vehicle' : 'infantry');
      const sq = this.spawn(team, u.unitId, pos, facing);
      if (u.deployed && def.kind === 'team') {
        sq.setup = 'deployed';
        sq.setupFacing = facing;
      }
    }
  }

  readonly nextId = (): number => this.idCounter++;

  get(id: number | null | undefined): Squad | undefined {
    return id == null ? undefined : this.byId.get(id);
  }

  spawn(team: TeamId, unitId: string, pos: Vec2, heading = 0): Squad {
    const def = UNITS[unitId];
    if (!def) throw new Error(`Unknown unit ${unitId}`);
    const sq = createSquad(this.nextId, team, def, pos, heading);
    this.squads.push(sq);
    this.byId.set(sq.id, sq);
    return sq;
  }

  /** True if the tier building `unitId` (or nothing, if undefined) is standing for this team. */
  hasTech(team: TeamId, unitId: string | undefined): boolean {
    if (!unitId || this.techFree) return true;
    return this.squads.some((s) => !s.dead && s.team === team && s.def.id === unitId && s.building === null);
  }

  emit(e: SimEvent): void {
    this.events.push(e);
  }

  hqOf(team: TeamId): Squad | undefined {
    return this.get(this.teams[team].hqId);
  }

  /** Fog-of-war check: own units are always known, enemies only when a model is in vision. */
  canSee(team: TeamId, sq: Squad): boolean {
    if (sq.team === team) return true;
    if (isHidden(this, team, sq)) return false;
    for (const m of sq.models) if (m.alive && this.vision.isVisible(team, m.pos)) return true;
    return false;
  }

  step(dt: number): void {
    if (this.winner !== -1) return;
    this.time += dt;
    updateProduction(this, dt);
    updateEconomy(this, dt);
    updateLogistics(this, dt);
    updateUpgrades(this, dt);
    updateAbilities(this, dt);
    updateDoctrines(this, dt);
    updateMovement(this, dt);
    updateGarrisons(this, dt);
    updateEngineering(this, dt);
    updateCombat(this, dt);
    updateProjectiles(this, dt);
    updateSuppression(this, dt);
    updateCapture(this, dt);
    this.vision.update(this, dt);
    updateObjectives(this, dt);
    this.cleanup();
  }

  private cleanup(): void {
    let removed = false;
    for (const sq of this.squads) {
      if (sq.models.some((m) => !m.alive)) sq.models = sq.models.filter((m) => m.alive);
      if (sq.dead && sq.def.kind !== 'structure') {
        this.byId.delete(sq.id);
        removed = true;
      }
    }
    if (removed) this.squads = this.squads.filter((s) => !s.dead || s.def.kind === 'structure');
  }

  private stampFootprint(center: Vec2, radiusTiles: number): void {
    const cx = center.x / TILE;
    const cy = center.y / TILE;
    for (let y = Math.floor(cy - radiusTiles); y <= Math.ceil(cy + radiusTiles); y++) {
      for (let x = Math.floor(cx - radiusTiles); x <= Math.ceil(cx + radiusTiles); x++) {
        if (Math.hypot(x + 0.5 - cx, y + 0.5 - cy) <= radiusTiles) this.map.set(x, y, T.Building);
      }
    }
  }
}
