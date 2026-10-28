import { describe, expect, it } from 'vitest';
import { AICommander } from '../src/ai/commander';
import { SIM_DT, TILE } from '../src/data/balance';
import { MAPS, MAP_IDS } from '../src/data/maps';
import { T } from '../src/data/terrain';
import { issueMove, issueRetreat, queueProduction } from '../src/sim/commands';
import { GameMap } from '../src/sim/grid';
import { hasLineOfSight } from '../src/sim/los';
import { findPath } from '../src/sim/pathfinding';
import { coverAt } from '../src/sim/systems/cover';
import { isRearHit, penetrationChance } from '../src/sim/systems/combat';
import { nextSuppressionState } from '../src/sim/systems/suppression';
import { World } from '../src/sim/world';

const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });

/** Advances the simulation; returns how many soldiers/vehicles died. */
function run(world: World, seconds: number, ais: AICommander[] = []): number {
  let deaths = 0;
  for (let t = 0; t < seconds; t += SIM_DT) {
    for (const ai of ais) ai.update(world, SIM_DT);
    world.step(SIM_DT);
    for (const e of world.events) if (e.type === 'death') deaths++;
    world.events.length = 0;
  }
  return deaths;
}

describe('pathfinding', () => {
  it('routes around a wall', () => {
    const map = new GameMap(20, 20);
    for (let y = 0; y < 15; y++) map.set(10, y, T.Building);
    const path = findPath(map, at(5, 5), at(15, 5), 'infantry');
    expect(path.length).toBeGreaterThan(1);
    expect(path.at(-1)).toEqual(at(15, 5));
    let prev = at(5, 5);
    for (const p of path) {
      expect(map.lineWalkable(prev, p, 'infantry')).toBe(true);
      prev = p;
    }
  });

  it('keeps vehicles out of jungle but lets infantry through', () => {
    const map = new GameMap(20, 5);
    for (let y = 0; y < 5; y++) map.set(10, y, T.Jungle);
    expect(findPath(map, at(2, 2), at(18, 2), 'infantry').at(-1)).toEqual(at(18, 2));
    const vehiclePath = findPath(map, at(2, 2), at(18, 2), 'vehicle');
    expect(vehiclePath.at(-1)!.x).toBeLessThan(10 * TILE);
  });

  it.each(MAP_IDS)('every point on %s is reachable from both bases', (id) => {
    const world = new World({ map: MAPS[id], factions: ['usaffe', 'ija'] });
    for (const team of world.teams) {
      for (const p of world.points) {
        for (const mover of ['infantry', 'vehicle'] as const) {
          const goal = world.map.nearestPassable(p.pos, mover);
          const path = findPath(world.map, team.spawn, goal, mover);
          const end = path.at(-1) ?? team.spawn;
          expect(Math.hypot(end.x - goal.x, end.y - goal.y), `${mover} ${team.id} → ${p.name}`).toBeLessThan(TILE * 2);
        }
      }
    }
  });
});

describe('line of sight and cover', () => {
  it('is blocked by buildings, and by a hedge unless one side is lining it', () => {
    const map = new GameMap(20, 5);
    map.set(10, 2, T.Building);
    expect(hasLineOfSight(map, at(2, 2), at(18, 2))).toBe(false);
    map.set(10, 2, T.Hedge);
    expect(hasLineOfSight(map, at(2, 2), at(18, 2))).toBe(false);
    // Right at the hedge, looking over it, both ways.
    expect(hasLineOfSight(map, at(9, 2), at(18, 2))).toBe(true);
    expect(hasLineOfSight(map, at(2, 2), at(11, 2))).toBe(true);
  });

  it('is blocked by a smoke screen', () => {
    const map = new GameMap(20, 5);
    expect(hasLineOfSight(map, at(2, 2), at(18, 2))).toBe(true);
    for (const x of [9, 10, 11]) map.smoke[map.idx(x, 2)] = 1.3;
    expect(hasLineOfSight(map, at(2, 2), at(18, 2))).toBe(false);
  });

  it('is blocked by deep jungle', () => {
    const map = new GameMap(20, 5);
    for (let x = 6; x < 12; x++) map.set(x, 2, T.Jungle);
    expect(hasLineOfSight(map, at(2, 2), at(18, 2))).toBe(false);
  });

  it('gives directional cover from a wall only against fire from beyond it', () => {
    const map = new GameMap(20, 5);
    map.set(10, 2, T.Sandbag);
    const soldier = at(9, 2);
    expect(coverAt(map, soldier, at(18, 2))).toBe('heavy');
    expect(coverAt(map, soldier, at(1, 2))).toBe('none');
  });

  it('treats rice paddies as negative cover', () => {
    const map = new GameMap(5, 5);
    map.set(2, 2, T.Paddy);
    expect(coverAt(map, at(2, 2), at(0, 0))).toBe('negative');
  });
});

describe('combat rules', () => {
  it('uses pen/armour as penetration chance', () => {
    expect(penetrationChance(100, 85)).toBe(1);
    expect(penetrationChance(40, 80)).toBeCloseTo(0.5);
  });

  it('detects rear armour hits', () => {
    const world = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'] });
    const tank = world.spawn(0, 'us_stuart', { x: 400, y: 400 }, 0);
    expect(isRearHit(tank, { x: 600, y: 400 })).toBe(false);
    expect(isRearHit(tank, { x: 200, y: 400 })).toBe(true);
  });

  it('suppression has hysteresis and retreating squads cannot be pinned', () => {
    expect(nextSuppressionState('normal', 0.85, false)).toBe('pinned');
    expect(nextSuppressionState('pinned', 0.6, false)).toBe('pinned');
    expect(nextSuppressionState('pinned', 0.45, false)).toBe('suppressed');
    expect(nextSuppressionState('normal', 0.3, false)).toBe('normal');
    expect(nextSuppressionState('normal', 0.95, true)).toBe('suppressed');
  });

  it('an HMG pins infantry walking into its arc', () => {
    const world = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'] });
    const hmg = world.spawn(0, 'us_hmg', { x: 800, y: 300 }, 0);
    hmg.setup = 'deployed';
    hmg.setupFacing = 0;
    const rifles = world.spawn(1, 'ija_riflemen', { x: 980, y: 300 }, Math.PI);
    world.vision.recompute(world);
    run(world, 6);
    expect(rifles.suppState).not.toBe('normal');
  });
});

describe('capture and territory', () => {
  it('captures a neutral point and cuts off supply', () => {
    const world = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'] });
    const point = world.points.find((p) => p.name === 'Crossroads')!;
    const sq = world.spawn(0, 'us_riflemen', { x: point.pos.x - 10, y: point.pos.y + 10 }, 0);
    run(world, 16);
    expect(point.owner).toBe(0);
    expect(sq.dead).toBe(false);
    // The crossroads is not adjacent to the base, so it is not supplied yet.
    expect(world.territory.isSupplied(0, point.sector)).toBe(false);
  });

  it('retreat takes a squad home and clears the flag on arrival', () => {
    const world = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'] });
    const sq = world.squads.find((s) => s.team === 0 && s.def.id === 'us_engineers')!;
    issueMove(world, sq, { x: 700, y: 560 });
    run(world, 20);
    issueRetreat(world, sq);
    run(world, 40);
    expect(sq.retreating).toBe(false);
    expect(Math.hypot(sq.pos.x - world.teams[0].retreatPoint.x, sq.pos.y - world.teams[0].retreatPoint.y)).toBeLessThan(80);
  });

  it('production spends resources and spawns the unit', () => {
    const world = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'] });
    expect(queueProduction(world, 0, 'us_hmg').reason).toMatch(/Build the/);
    world.spawn(0, 'us_tech1', at(12, 20));
    const before = world.squads.length;
    expect(queueProduction(world, 0, 'us_hmg').ok).toBe(true);
    expect(queueProduction(world, 0, 'us_stuart').ok).toBe(false);
    run(world, 26);
    expect(world.squads.length).toBe(before + 1);
  });
});

describe('AI vs AI', () => {
  it.each(MAP_IDS)('plays a full skirmish on %s without errors', (id) => {
    const world = new World({ map: MAPS[id], factions: ['usaffe', 'ija'], seed: 7 });
    const ais = [new AICommander(0), new AICommander(1)];
    const deaths = run(world, 480, ais);
    const captured = world.points.filter((p) => p.owner !== -1).length;
    expect(captured).toBeGreaterThan(2);
    expect(world.teams[0].stats.produced + world.teams[1].stats.produced).toBeGreaterThan(4);
    expect(deaths).toBeGreaterThan(5);
  }, 60000);
});

