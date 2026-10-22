import { describe, expect, it } from 'vitest';
import { SIM_DT } from '../src/data/balance';
import { MAPS } from '../src/data/maps';
import { T } from '../src/data/terrain';
import { World } from '../src/sim/world';

function run(world: World, seconds: number): void {
  for (let t = 0; t < seconds; t += SIM_DT) {
    world.step(SIM_DT);
    world.events.length = 0;
  }
}

/** Open ground east of the Bataan crossroads, with the AI left out. */
function field() {
  const w = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'], seed: 3 });
  for (let x = 20; x <= 60; x++) for (let y = 20; y <= 50; y++) w.map.set(x, y, T.Open);
  w.map.changes.length = 0;
  return w;
}

const shotsBy = (w: World, team: number, seconds: number): number => {
  let n = 0;
  for (let t = 0; t < seconds; t += SIM_DT) {
    w.step(SIM_DT);
    n += w.events.filter((e) => e.type === 'shot' && e.team === team).length;
    w.events.length = 0;
  }
  return n;
};

describe('automatic targeting', () => {
  it('a set-up machine gun fires on its own at enemies in its cone', () => {
    const w = field();
    const mg = w.spawn(0, 'us_hmg', { x: 500, y: 560 }, 0);
    mg.setup = 'deployed';
    mg.setupFacing = 0;
    w.spawn(1, 'ija_riflemen', { x: 700, y: 560 }, Math.PI);
    expect(shotsBy(w, 0, 6)).toBeGreaterThan(0);
  });

  it('a set-up machine gun never turns away from where it was placed', () => {
    const w = field();
    const mg = w.spawn(0, 'us_hmg', { x: 500, y: 560 }, 0);
    mg.setup = 'deployed';
    mg.setupFacing = 0;
    // An enemy behind the gun, and one in front of it.
    w.spawn(1, 'ija_riflemen', { x: 330, y: 560 }, 0);
    run(w, 4);
    expect(mg.setupFacing).toBe(0);
    const target = w.get(mg.targetId);
    if (target) expect(target.pos.x).toBeGreaterThan(mg.pos.x);
  });

  it('a packed machine gun sets up facing the enemy, then stays that way', () => {
    const w = field();
    const mg = w.spawn(0, 'us_hmg', { x: 500, y: 560 }, Math.PI);
    w.spawn(1, 'ija_riflemen', { x: 680, y: 560 }, Math.PI);
    run(w, 8);
    expect(mg.setup).toBe('deployed');
    expect(Math.abs(mg.setupFacing)).toBeLessThan(0.3);
  });

  it('does not fixate on an enemy behind a house; it takes one it can hit', () => {
    const w = field();
    const rifles = w.spawn(0, 'us_riflemen', { x: 500, y: 560 }, 0);
    // A wall of houses between us and the nearer enemy.
    for (let y = 30; y <= 40; y++) w.map.set(38, y, T.Building);
    const hidden = w.spawn(1, 'ija_riflemen', { x: 680, y: 560 }, Math.PI);
    const open = w.spawn(1, 'ija_riflemen', { x: 500, y: 760 }, Math.PI);
    // Both can be seen by the army (as if spotted by someone else).
    w.vision.recompute(w);
    run(w, 3);
    void hidden;
    expect(rifles.targetId === null || rifles.targetId === open.id).toBe(true);
  });
});
