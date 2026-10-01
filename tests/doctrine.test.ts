import { describe, expect, it } from 'vitest';
import { RETREAT, SIM_DT, TILE } from '../src/data/balance';
import { doctrinesOf } from '../src/data/doctrines';
import { MAPS, MAP_IDS } from '../src/data/maps';
import { T } from '../src/data/terrain';
import { issueBuild, issueReinforce, queueProduction } from '../src/sim/commands';
import { applyDamage } from '../src/sim/systems/combat';
import { callInBlock, chooseDoctrine, useCallIn } from '../src/sim/systems/doctrine';
import { World } from '../src/sim/world';
import { findPath } from '../src/sim/pathfinding';

const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });

function run(world: World, seconds: number): void {
  for (let t = 0; t < seconds; t += SIM_DT) {
    world.step(SIM_DT);
    world.events.length = 0;
  }
}

function battle() {
  const w = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'] });
  for (let x = 18; x <= 30; x++) for (let y = 28; y <= 33; y++) w.map.set(x, y, T.Open);
  w.map.changes.length = 0;
  for (const p of w.points) p.owner = 0;
  w.teams[0].resources = { manpower: 3000, munitions: 500, fuel: 300 };
  return w;
}

describe('fair skirmish maps', () => {
  it.each(MAP_IDS)('%s: bases and points mirror each other', (id) => {
    const map = MAPS[id];
    const [a, b] = map.bases;
    // The two bases are each other's mirror image through the centre.
    expect(Math.abs(a.x + b.x - (map.width - 1))).toBeLessThanOrEqual(1);
    expect(Math.abs(a.y + b.y - (map.height - 1))).toBeLessThanOrEqual(1);
    // Every point has a mirrored twin, except the heart of the village, which is
    // the same driving distance from both bases.
    const world = new World({ map, factions: ['usaffe', 'ija'] });
    let middle = 0;
    for (const p of map.points) {
      const twin = map.points.find((q) => q !== p && q.kind === p.kind && Math.abs(q.x + p.x - map.width) <= 1.5 && Math.abs(q.y + p.y - map.height) <= 1.5);
      if (twin) continue;
      middle++;
      expect(p.kind, `${id}: ${p.name}`).toBe('victory');
      const pos = { x: p.x * TILE, y: p.y * TILE };
      const reach = (from: { x: number; y: number }) => findPath(world.map, from, world.map.nearestPassable(pos, 'infantry'), 'infantry').reduce((s, q, i, arr) => s + (i ? Math.hypot(q.x - arr[i - 1].x, q.y - arr[i - 1].y) : Math.hypot(q.x - from.x, q.y - from.y)), 0);
      const da = reach(world.teams[0].spawn);
      const db = reach(world.teams[1].spawn);
      expect(Math.abs(da - db) / Math.max(da, db), `${id}: ${p.name} is as far from both sides`).toBeLessThan(0.12);
    }
    expect(middle).toBeLessThanOrEqual(1);
  });
});

describe('doctrines', () => {
  it('one doctrine per battle, and its unit needs it', () => {
    const w = battle();
    expect(queueProduction(w, 0, 'us_katipunero').reason).toMatch(/doctrine/);
    expect(chooseDoctrine(w, 0, 'kirikomi').ok).toBe(false);
    expect(chooseDoctrine(w, 0, 'katipunan').ok).toBe(true);
    expect(chooseDoctrine(w, 0, 'luna').ok).toBe(false);
    expect(queueProduction(w, 0, 'us_katipunero').ok).toBe(true);
    run(w, 26);
    const kat = w.squads.find((s) => s.def.id === 'us_katipunero')!;
    expect(kat.models).toHaveLength(10);
  });

  it('call-ins wait for command points, then work', () => {
    const w = battle();
    chooseDoctrine(w, 0, 'depensa');
    expect(callInBlock(w, 0, 'dep_artilerya')).toMatch(/command points/);
    w.teams[0].cp = 5;
    const enemy = w.spawn(1, 'ija_riflemen', at(26, 30), 0);
    const hp = enemy.models.reduce((s, m) => s + m.hp, 0);
    expect(useCallIn(w, 0, 'dep_artilerya', enemy.pos).ok).toBe(true);
    expect(callInBlock(w, 0, 'dep_artilerya')).toMatch(/Ready in/);
    run(w, 9);
    expect(enemy.dead || enemy.models.reduce((s, m) => s + (m.alive ? m.hp : 0), 0) < hp).toBe(true);
  });

  it('every army has five doctrines, each with a unit and two call-ins', () => {
    for (const f of ['usaffe', 'ija']) {
      const list = doctrinesOf(f);
      expect(list).toHaveLength(5);
      for (const d of list) expect(d.callIns).toHaveLength(2);
    }
  });

  it('a spotter plane reveals the target', () => {
    const w = battle();
    chooseDoctrine(w, 0, 'himpapawid');
    w.teams[0].cp = 3;
    const far = w.hqOf(1)!.pos;
    expect(w.vision.isVisible(0, far)).toBe(false);
    expect(useCallIn(w, 0, 'him_manman', far).ok).toBe(true);
    expect(w.vision.isVisible(0, far)).toBe(true);
  });
});

describe('frames, reinforcements and retreat', () => {
  it('a structure goes up as a frame whose progress is its health, and waits if left', () => {
    const w = battle();
    const eng = w.spawn(0, 'us_engineers', at(20, 32), 0);
    expect(issueBuild(w, eng, 'bunker', at(24, 30), at(27, 30)).ok).toBe(true);
    const frame = w.squads.find((s) => s.def.id === 'bunker')!;
    expect(frame.building).toBe(0);
    run(w, 10);
    const part = frame.building!;
    expect(part).toBeGreaterThan(0);
    // The engineers are called away: the frame stays, unfinished.
    eng.order = { kind: 'idle' };
    run(w, 5);
    expect(frame.dead).toBe(false);
    expect(frame.building).toBeCloseTo(part, 5);
    // A frame does not fight.
    expect(frame.targetId).toBeNull();
  });

  it('reinforcements pause away from a base instead of being cancelled', () => {
    const w = battle();
    const hq = w.hqOf(0)!;
    const rifles = w.spawn(0, 'us_riflemen', { x: hq.pos.x + 60, y: hq.pos.y }, 0);
    rifles.models[0].alive = false;
    rifles.models[1].alive = false;
    expect(issueReinforce(w, rifles).ok).toBe(true);
    expect(issueReinforce(w, rifles).ok).toBe(true);
    rifles.pos = { x: hq.pos.x + 600, y: hq.pos.y };
    for (const m of rifles.models) m.pos = { ...rifles.pos };
    run(w, 3);
    expect(rifles.reinforceQueued).toBe(2);
    expect(rifles.reinforcePaused).toBe(true);
  });

  it('retreating troops take only part of the damage', () => {
    const w = battle();
    const a = w.spawn(0, 'us_riflemen', at(20, 30), 0);
    const b = w.spawn(0, 'us_riflemen', at(22, 30), 0);
    b.retreating = true;
    applyDamage(w, a, a.models[0], 40, null);
    applyDamage(w, b, b.models[0], 40, null);
    expect(b.models[0].hp - a.models[0].hp).toBeCloseTo(40 * (1 - RETREAT.damage), 5);
  });
});
