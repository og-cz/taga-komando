import { describe, expect, it } from 'vitest';
import { SIM_DT, TILE } from '../src/data/balance';
import { MAPS } from '../src/data/maps';
import { T } from '../src/data/terrain';
import { WEAPONS } from '../src/data/weapons';
import { issueGarrison, issueMove } from '../src/sim/commands';
import { explode } from '../src/sim/systems/combat';
import { houseAt } from '../src/sim/systems/garrison';
import { World } from '../src/sim/world';

function run(world: World, seconds: number): void {
  for (let t = 0; t < seconds; t += SIM_DT) {
    world.step(SIM_DT);
    world.events.length = 0;
  }
}

/** Open ground with one 3 × 2 house in the middle (tiles 30–32, 34–35). */
function village() {
  const w = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'], seed: 5 });
  for (let x = 14; x <= 50; x++) for (let y = 22; y <= 48; y++) w.map.set(x, y, T.Open);
  for (let x = 30; x <= 32; x++) for (let y = 34; y <= 35; y++) w.map.set(x, y, T.Building);
  w.map.changes.length = 0;
  const house = houseAt(w, { x: 31.5 * TILE, y: 34.5 * TILE })!;
  return { w, house };
}

describe('garrisoning houses', () => {
  it('infantry walk to the door, go in and take the windows', () => {
    const { w, house } = village();
    const sq = w.spawn(0, 'us_riflemen', { x: 22 * TILE, y: 35 * TILE }, 0);
    expect(issueGarrison(w, sq, house).ok).toBe(true);
    run(w, 12);
    expect(sq.garrison).toBe(house.id);
    expect(house.occupant).toBe(sq.id);
    for (const m of sq.models) if (m.alive) expect(houseAt(w, m.pos)?.id).toBe(house.id);
  });

  it('only the men at the windows facing the enemy can fire', () => {
    const { w, house } = village();
    const sq = w.spawn(0, 'us_riflemen', { x: 22 * TILE, y: 35 * TILE }, 0);
    issueGarrison(w, sq, house);
    run(w, 12);
    // An enemy squad comes up on the east side.
    w.spawn(1, 'ija_riflemen', { x: 42 * TILE, y: 35 * TILE }, Math.PI);
    const shooters = new Set<string>();
    for (let t = 0; t < 8; t += SIM_DT) {
      w.step(SIM_DT);
      for (const e of w.events) if (e.type === 'shot' && e.team === 0) shooters.add(`${Math.round(e.from.x)},${Math.round(e.from.y)}`);
      w.events.length = 0;
    }
    expect(shooters.size).toBeGreaterThan(0);
    // Every shot came from the east half of the house.
    for (const s of shooters) expect(Number(s.split(',')[0])).toBeGreaterThan(house.center.x);
  });

  it('a move order brings them out of the door', () => {
    const { w, house } = village();
    const sq = w.spawn(0, 'us_riflemen', { x: 22 * TILE, y: 35 * TILE }, 0);
    issueGarrison(w, sq, house);
    run(w, 12);
    issueMove(w, sq, { x: 22 * TILE, y: 30 * TILE });
    run(w, 1);
    expect(sq.garrison).toBeNull();
    expect(house.occupant).toBeNull();
    for (const m of sq.models) if (m.alive) expect(houseAt(w, m.pos)).toBeUndefined();
  });

  it('a house is exactly green cover, explosives included', () => {
    const inside = village();
    const a = inside.w.spawn(0, 'us_riflemen', { x: 22 * TILE, y: 35 * TILE }, 0);
    issueGarrison(inside.w, a, inside.house);
    run(inside.w, 12);
    const before = a.models.reduce((n, m) => n + m.hp, 0);
    explode(inside.w, inside.house.center, WEAPONS.m2_mortar, null);
    const lostInside = before - a.models.reduce((n, m) => n + Math.max(0, m.hp), 0);

    const outside = village();
    const b = outside.w.spawn(0, 'us_riflemen', { x: 40 * TILE, y: 26 * TILE }, 0);
    run(outside.w, 1);
    const before2 = b.models.reduce((n, m) => n + m.hp, 0);
    explode(outside.w, b.pos, WEAPONS.m2_mortar, null);
    const lostOutside = before2 - b.models.reduce((n, m) => n + Math.max(0, m.hp), 0);
    expect(lostInside).toBeGreaterThan(0);
    // The same blast in the open hurts more: the house is heavy cover.
    expect(lostInside).toBeLessThan(lostOutside);
  });
});
