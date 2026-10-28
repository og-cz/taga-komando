import { describe, expect, it } from 'vitest';
import { SIM_DT, TILE } from '../src/data/balance';
import { MAPS } from '../src/data/maps';
import { T } from '../src/data/terrain';
import { WEAPONS } from '../src/data/weapons';
import { issueAbility } from '../src/sim/commands';
import { hasLineOfSight } from '../src/sim/los';
import { explode } from '../src/sim/systems/combat';
import { World } from '../src/sim/world';

function run(world: World, seconds: number): void {
  for (let t = 0; t < seconds; t += SIM_DT) {
    world.step(SIM_DT);
    world.events.length = 0;
  }
}

const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });

/** Open ground in the middle of the map. */
function field() {
  const w = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'], seed: 3 });
  for (let x = 10; x <= 60; x++) for (let y = 20; y <= 50; y++) w.map.set(x, y, T.Open);
  w.map.changes.length = 0;
  return w;
}

describe('smoke screens', () => {
  it('a smoke round hurts nobody, blocks sight and fire, then thins away', () => {
    const w = field();
    const sq = w.spawn(1, 'ija_riflemen', at(35, 35), 0);
    const hp = sq.models.reduce((n, m) => n + m.hp, 0);
    expect(hasLineOfSight(w.map, at(20, 35), at(50, 35))).toBe(true);
    explode(w, at(35, 35), WEAPONS.smoke_mortar_us, null);
    run(w, 2);
    expect(sq.models.reduce((n, m) => n + m.hp, 0)).toBe(hp);
    expect(hasLineOfSight(w.map, at(20, 35), at(50, 35))).toBe(false);
    run(w, WEAPONS.smoke_mortar_us.smoke! + 1);
    expect(w.smokes.length).toBe(0);
    expect(hasLineOfSight(w.map, at(20, 35), at(50, 35))).toBe(true);
  });

  it('a squad inside the cloud cannot be seen from outside it', () => {
    const w = field();
    w.spawn(0, 'us_riflemen', at(20, 35), 0);
    const hidden = w.spawn(1, 'ija_riflemen', at(32, 35), 0);
    run(w, 0.5);
    expect(w.canSee(0, hidden)).toBe(true);
    explode(w, hidden.pos, WEAPONS.smoke_grenade_ija, null);
    run(w, 2);
    expect(w.canSee(0, hidden)).toBe(false);
  });

  it('rifle squads throw smoke, for munitions', () => {
    const w = field();
    const sq = w.spawn(0, 'us_riflemen', at(20, 35), 0);
    const before = w.teams[0].resources.munitions;
    expect(issueAbility(w, sq, 'smoke_us', at(24, 35)).ok).toBe(true);
    run(w, 3);
    // Paid 15 (a little income comes in meanwhile).
    expect(w.teams[0].resources.munitions).toBeLessThan(before - 13);
    expect(w.smokes.length).toBe(1);
  });
});

describe('true sight past hedgerows', () => {
  /** A hedgerow running north–south at x = 30. */
  function hedge() {
    const w = field();
    for (let y = 20; y <= 50; y++) w.map.set(30, y, T.Hedge);
    w.map.changes.length = 0;
    return w;
  }

  it('hides the field beyond it, but not the men hugging its far side', () => {
    const w = hedge();
    w.spawn(0, 'us_riflemen', at(20, 35), 0);
    const far = w.spawn(1, 'ija_riflemen', at(36, 30), 0);
    const close = w.spawn(1, 'ija_riflemen', at(31, 40), 0);
    run(w, 0.5);
    expect(w.canSee(0, far)).toBe(false);
    expect(w.canSee(0, close)).toBe(true);
  });

  it('a squad lining the hedge sees over it', () => {
    const w = hedge();
    w.spawn(0, 'us_riflemen', at(29, 35), 0);
    const far = w.spawn(1, 'ija_riflemen', at(38, 35), 0);
    run(w, 0.5);
    expect(w.canSee(0, far)).toBe(true);
  });
});
