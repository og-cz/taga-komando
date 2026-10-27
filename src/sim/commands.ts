import { canGarrison, doorFor, type House } from './systems/garrison';
import { ABILITIES } from '../data/abilities';
import { BUILDABLES } from '../data/buildables';
import { ECONOMY, LOGISTICS, TILE } from '../data/balance';
import type { TeamId } from '../data/types';
import { UNITS } from '../data/units';
import { UPGRADES } from '../data/upgrades';
import { angleTo, type Vec2 } from '../core/vec';
import { aliveCount, type Squad } from './entities';
import { resetMovement, setOrder } from './orders';
import { canAfford, pay, popUsed, refund } from './systems/economy';
import { defenseAt } from './systems/defenses';
import { ownGround, placeFrame, planBuild } from './systems/engineering';
import { canReinforceHere, dropReinforcements, reinforceCost } from './systems/logistics';
import { startSetup, startTeardown } from './systems/setup';
import type { World } from './world';

/**
 * The only way to change what units do. The player's input and the AI both go
 * through here, so the AI obeys exactly the same rules as the player.
 */
export interface CommandResult {
  ok: boolean;
  reason?: string;
}

const OK: CommandResult = { ok: true };
const fail = (reason: string): CommandResult => ({ ok: false, reason });

/** Retreating squads ignore every order until they reach headquarters. */
const RETREATING = fail('Retreating: orders resume at headquarters');

function commandable(sq: Squad): boolean {
  return !sq.dead && sq.def.kind !== 'structure';
}

/** Move to `dest`; with `facing`, face that way on arrival (weapon teams also set up). */
export function issueMove(world: World, sq: Squad, dest: Vec2, queue = false, facing?: number): CommandResult {
  if (sq.dead) return fail('Unit is dead');
  if (sq.def.kind === 'structure') {
    // Headquarters and tier buildings: the rally point where new units go.
    if (sq.def.role !== 'hq' && sq.def.role !== 'tech') return fail('Structures cannot move');
    sq.rally = { ...dest };
    return OK;
  }
  if (sq.retreating) return RETREATING;
  sq.channel = null;
  setOrder(sq, { kind: 'move', dest: clampToMap(world, dest), facing }, queue);
  return OK;
}

export function issueAttackMove(world: World, sq: Squad, dest: Vec2, queue = false): CommandResult {
  if (!commandable(sq)) return fail('Cannot move');
  if (sq.retreating) return RETREATING;
  sq.channel = null;
  setOrder(sq, { kind: 'attackMove', dest: clampToMap(world, dest) }, queue);
  return OK;
}

export function issueAttack(_world: World, sq: Squad, target: Squad): CommandResult {
  if (sq.dead || target.dead || target.team === sq.team) return fail('Invalid target');
  if (sq.def.kind === 'structure') return fail('Structures fire automatically');
  if (sq.retreating) return RETREATING;
  sq.channel = null;
  setOrder(sq, { kind: 'attack', targetId: target.id });
  sq.targetId = target.id;
  if (sq.def.kind === 'team' && sq.setup === 'deployed') sq.setupFacing = angleTo(sq.pos, target.pos);
  return OK;
}

/** Infantry: go into a house and hold it, firing from the windows. */
export function issueGarrison(world: World, sq: Squad, house: House, queue = false): CommandResult {
  if (!commandable(sq) || !canGarrison(sq)) return fail('Only infantry squads can go into houses');
  if (sq.retreating) return RETREATING;
  if (house.occupant !== null && house.occupant !== sq.id) {
    return fail(world.get(house.occupant)?.team === sq.team ? 'Another squad already holds that house' : 'The enemy holds that house');
  }
  sq.channel = null;
  setOrder(sq, { kind: 'garrison', houseId: house.id, dest: doorFor(house, sq.pos) }, queue);
  return OK;
}

export function issueStop(_world: World, sq: Squad): CommandResult {
  if (!commandable(sq)) return fail('Cannot stop');
  if (sq.retreating) return RETREATING;
  sq.channel = null;
  sq.queue.length = 0;
  sq.order = { kind: 'idle' };
  resetMovement(sq);
  return OK;
}

export function issueRetreat(world: World, sq: Squad): CommandResult {
  if (!commandable(sq)) return fail('Cannot retreat');
  if (sq.def.kind === 'vehicle') return fail('Tanks cannot retreat: move them back and have engineers repair them');
  const team = world.teams[sq.team];
  sq.retreating = true;
  sq.channel = null;
  dropReinforcements(world, sq);
  sq.targetId = null;
  sq.queue.length = 0;
  sq.order = { kind: 'retreat', dest: { ...team.retreatPoint } };
  resetMovement(sq);
  startTeardown(sq);
  return OK;
}

export function issueReinforce(world: World, sq: Squad): CommandResult {
  if (!commandable(sq) || sq.def.kind === 'vehicle') return fail('Cannot reinforce vehicles');
  if (aliveCount(sq) + sq.reinforceQueued >= sq.def.models) return fail(sq.reinforceQueued > 0 ? 'Every missing soldier is already on the way' : 'Squad is at full strength');
  if (sq.retreating) return RETREATING;
  if (squadJobs(sq) >= LOGISTICS.squadQueue) return fail('Queue full: three jobs at a time');
  if (!canReinforceHere(world, sq)) return fail('Must be close to headquarters, a tier building or a bunker');
  const cost = reinforceCost(sq.def);
  const res = world.teams[sq.team].resources;
  if (res.manpower < cost) return fail('Not enough manpower');
  // One press queues one soldier, paid for now; they arrive one after another.
  res.manpower -= cost;
  if (!sq.reinforcing) sq.reinforceTimer = LOGISTICS.reinforceTime;
  sq.reinforceQueued++;
  sq.reinforcing = true;
  return OK;
}

/** Toggle set up / tear down for crew weapons, facing `toward` if given. */
export function issueSetup(_world: World, sq: Squad, toward?: Vec2): CommandResult {
  if (!commandable(sq) || sq.def.kind !== 'team') return fail('Only weapon teams set up');
  if (sq.retreating) return RETREATING;
  if (sq.setup === 'deployed' || sq.setup === 'settingUp') {
    startTeardown(sq);
    return OK;
  }
  if (sq.setup === 'tearingDown') return fail('Tearing down');
  sq.queue.length = 0;
  sq.order = { kind: 'idle' };
  resetMovement(sq);
  startSetup(sq, toward ? angleTo(sq.pos, toward) : sq.heading);
  return OK;
}

export function issueAbility(world: World, sq: Squad, abilityId: string, target: Vec2): CommandResult {
  const ab = ABILITIES[abilityId];
  if (!commandable(sq) || !ab || !sq.def.abilities.includes(abilityId)) return fail('Ability unavailable');
  if (sq.retreating) return RETREATING;
  if (sq.suppState === 'pinned') return fail('Squad is pinned');
  if ((sq.cooldowns[abilityId] ?? 0) > 0) return fail(`${ab.name} is recharging`);
  if (!canAfford(world.teams[sq.team].resources, ab.cost)) return fail('Not enough munitions');
  sq.channel = null;
  setOrder(sq, { kind: 'ability', abilityId, dest: clampToMap(world, target) });
  return OK;
}

/** Engineers: build a line of defenses (or one mine) from `from` to `to`. Cost is paid up front. */
export function issueBuild(world: World, sq: Squad, buildId: string, from: Vec2, to: Vec2): CommandResult {
  const def = BUILDABLES[buildId];
  if (!commandable(sq) || !def || !sq.def.builds.includes(buildId)) return fail('Only engineers can build that');
  if (sq.retreating) return RETREATING;
  const standing = (unitId: string | undefined) => world.squads.some((s) => !s.dead && s.team === sq.team && s.def.id === unitId);
  if (def.unique && (standing(def.unit) || world.constructions.some((c) => c.team === sq.team && c.buildId === buildId))) {
    return fail(`${def.name} is already built`);
  }
  if (def.requires && !standing(def.requires)) return fail(`Build the ${UNITS[def.requires].name} first`);
  if (def.limit !== undefined) {
    const have = world.squads.filter((s) => !s.dead && s.team === sq.team && s.def.id === def.unit).length;
    if (have >= def.limit) return fail(`At most ${def.limit} ${def.name}s at a time`);
  }
  const plan = planBuild(world, buildId, from, to, sq.team);
  const tiles = plan.tiles.filter((t) => t.valid);
  if (tiles.length === 0) {
    const anyOwn = plan.tiles.some((t) => world.map.inBounds(t.tx, t.ty) && ownGround(world, sq.team, t.tx, t.ty));
    return fail(anyOwn || def.shape !== 'structure' ? 'Cannot build there' : 'Emplacements only on ground you hold');
  }
  if (!canAfford(world.teams[sq.team].resources, plan.cost)) {
    return fail(plan.cost.munitions > world.teams[sq.team].resources.munitions ? 'Not enough munitions' : 'Not enough manpower');
  }
  pay(world.teams[sq.team].resources, plan.cost);
  // A structure is one job on its centre tile, taking up its whole footprint, facing
  // the way the placement was dragged (or away from headquarters, towards the front).
  const structure = def.shape === 'structure';
  const anchor = { tx: Math.floor(from.x / TILE), ty: Math.floor(from.y / TILE) };
  const hq = world.hqOf(sq.team);
  const facing = structure
    ? Math.hypot(to.x - from.x, to.y - from.y) > TILE * 0.75
      ? angleTo(from, to)
      : hq
        ? angleTo(hq.pos, from)
        : sq.heading
    : undefined;
  const construction = {
    id: world.nextId(),
    team: sq.team,
    buildId,
    ownerId: sq.id,
    tiles: (structure ? [anchor] : tiles).map((t) => ({ tx: t.tx, ty: t.ty, progress: 0, done: false })),
    footprint: structure ? tiles.map((t) => ({ tx: t.tx, ty: t.ty })) : undefined,
    facing,
  };
  world.constructions.push(construction);
  // A structure's frame goes up on the site straight away.
  if (structure) placeFrame(world, construction);
  sq.channel = null;
  setOrder(sq, { kind: 'build', targetId: construction.id });
  return OK;
}

/** Engineers: join another squad's construction job and speed it up. */
export function issueHelpBuild(world: World, sq: Squad, constructionId: number): CommandResult {
  const c = world.constructions.find((k) => k.id === constructionId);
  if (!commandable(sq) || !c || !sq.def.builds.includes(c.buildId)) return fail('Only engineers can help build');
  if (sq.retreating) return RETREATING;
  if (c.team !== sq.team) return fail('Not our construction');
  sq.channel = null;
  setOrder(sq, { kind: 'build', targetId: c.id });
  return OK;
}

/** Engineers: repair a friendly vehicle or structure. */
export function issueRepair(_world: World, sq: Squad, target: Squad): CommandResult {
  if (!commandable(sq) || !sq.def.canRepair) return fail('Only engineers can repair');
  if (sq.retreating) return RETREATING;
  if (target.team !== sq.team || target.dead || !target.def.armor) return fail('Nothing to repair');
  const hull = target.models.find((m) => m.alive);
  if (!hull || hull.hp >= hull.maxHp) return fail('Already at full strength');
  sq.channel = null;
  setOrder(sq, { kind: 'repair', targetId: target.id });
  return OK;
}

/** Buy a weapon upgrade. Squads pick up the new weapons at the HQ or a supplied point; one upgrade per squad. */
export function issueUpgrade(world: World, sq: Squad, upgradeId: string): CommandResult {
  const def = UPGRADES[upgradeId];
  if (!commandable(sq) || !def || !sq.def.upgrades.includes(upgradeId)) return fail('This squad cannot take that upgrade');
  if (sq.upgrades.length > 0 || sq.upgrading) return fail('Squad is already upgraded');
  if (sq.retreating) return RETREATING;
  if (!world.hasTech(sq.team, def.requires)) return fail(`Build the ${UNITS[def.requires!].name} first`);
  if (!canReinforceHere(world, sq)) return fail('Must be close to headquarters, a tier building or a bunker');
  const res = world.teams[sq.team].resources;
  if (!canAfford(res, def.cost)) return fail('Not enough munitions');
  if (squadJobs(sq) >= LOGISTICS.squadQueue) return fail('Queue full: three jobs at a time');
  pay(res, def.cost);
  sq.upgrading = { id: upgradeId, remaining: def.time };
  return OK;
}

/** Stop an upgrade on its way and get the munitions back. */
export function cancelUpgrade(world: World, sq: Squad): CommandResult {
  if (!sq.upgrading) return fail('Nothing to cancel');
  refund(world.teams[sq.team].resources, UPGRADES[sq.upgrading.id].cost);
  sq.upgrading = null;
  return OK;
}

/** Call off the last soldier waiting to join and get his manpower back. */
export function cancelReinforce(world: World, sq: Squad): CommandResult {
  if (sq.reinforceQueued <= 0) return fail('Nothing to cancel');
  sq.reinforceQueued--;
  world.teams[sq.team].resources.manpower += reinforceCost(sq.def);
  if (sq.reinforceQueued === 0) sq.reinforcing = false;
  return OK;
}

/** Jobs in a squad's own queue: soldiers waiting to join plus an upgrade on its way. */
export function squadJobs(sq: Squad): number {
  return sq.reinforceQueued + (sq.upgrading ? 1 : 0);
}

/** Engineers: patch up damaged sandbags, wire or tank traps. */
export function issueRepairDefense(world: World, sq: Squad, tx: number, ty: number): CommandResult {
  if (!commandable(sq) || !sq.def.canRepair) return fail('Only engineers can repair');
  if (sq.retreating) return RETREATING;
  const d = defenseAt(world, tx, ty);
  if (!d) return fail('Nothing to repair');
  if (d.hp >= d.maxHp) return fail('Already at full strength');
  sq.channel = null;
  setOrder(sq, { kind: 'repair', dest: world.map.tileCenter(tx, ty) });
  return OK;
}

/**
 * Recruit a unit. Headquarters can recruit anything unlocked; a tier building
 * (`producer`) recruits the units it unlocks, and they come out of it.
 */
export function queueProduction(world: World, team: TeamId, unitId: string, producer?: Squad): CommandResult {
  const t = world.teams[team];
  const def = UNITS[unitId];
  if (!def || !t.faction.roster.includes(unitId)) return fail('Not in roster');
  const hq = world.hqOf(team);
  const from = producer && !producer.dead && producer.team === team && (producer.def.role === 'hq' || producer.def.id === def.requires) ? producer : hq;
  if (!from || from.dead) return fail('Headquarters destroyed');
  if (def.doctrine && t.doctrine !== def.doctrine) return fail('Needs its doctrine');
  if (!world.hasTech(team, def.requires)) return fail(`Build the ${UNITS[def.requires!].name} first`);
  if (from.production.length >= ECONOMY.maxQueue) return fail('Production queue full');
  if (popUsed(world, team) + def.pop > ECONOMY.popCap) return fail('Population cap reached');
  if (!canAfford(t.resources, def.cost)) {
    const need = def.cost.fuel > t.resources.fuel ? 'fuel' : def.cost.munitions > t.resources.munitions ? 'munitions' : 'manpower';
    return fail(`Not enough ${need}`);
  }
  pay(t.resources, def.cost);
  from.production.push({ unitId, remaining: def.buildTime });
  return OK;
}

export function cancelProduction(world: World, team: TeamId, index: number, producer?: Squad): CommandResult {
  const hq = producer ?? world.hqOf(team);
  if (!hq || index < 0 || index >= hq.production.length) return fail('Nothing to cancel');
  const [item] = hq.production.splice(index, 1);
  refund(world.teams[team].resources, UNITS[item.unitId].cost);
  return OK;
}

function clampToMap(world: World, p: Vec2): Vec2 {
  return {
    x: Math.max(4, Math.min(world.map.pixelWidth - 4, p.x)),
    y: Math.max(4, Math.min(world.map.pixelHeight - 4, p.y)),
  };
}

export { chooseDoctrine, useCallIn } from './systems/doctrine';
