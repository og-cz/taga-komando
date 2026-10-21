import { describe, expect, it } from 'vitest';
import { SIM_DT, TILE } from '../src/data/balance';
import { MAPS } from '../src/data/maps';
import { T } from '../src/data/terrain';
import { WEAPONS } from '../src/data/weapons';
import { issueBuild, issueHelpBuild, issueMove, issueReinforce, issueRepair, issueRepairDefense, queueProduction } from '../src/sim/commands';
import { SCENARIOS } from '../src/data/scenarios';
import { explode } from '../src/sim/systems/combat';
import { defenseAt } from '../src/sim/systems/defenses';
import { ownGround, planBuild } from '../src/sim/systems/engineering';
import { canReinforceHere } from '../src/sim/systems/logistics';
import { World } from '../src/sim/world';
import { AICommander } from '../src/ai/commander';
import { fortPriority } from '../src/sim/systems/combat';

const at = (tx: number, ty: number) => ({ x: (tx + 0.5) * TILE, y: (ty + 0.5) * TILE });

function run(world: World, seconds: number): void {
  for (let t = 0; t < seconds; t += SIM_DT) {
    world.step(SIM_DT);
    world.events.length = 0;
  }
}

/** Open ground north of the Bataan crossroads, clear of buildings. */
function battle() {
  const w = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'] });
  for (let x = 18; x <= 30; x++) for (let y = 28; y <= 33; y++) w.map.set(x, y, T.Open);
  w.map.changes.length = 0;
  // Engineers build only on ground their army holds: give us the field.
  for (const p of w.points) p.owner = 0;
  return w;
}

describe('engineers', () => {
  it('plans a straight line capped at the maximum length', () => {
    const w = battle();
    const plan = planBuild(w, 'sandbags', at(18, 30), at(30, 30));
    expect(plan.tiles).toHaveLength(8);
    expect(plan.tiles.every((t) => t.valid)).toBe(true);
    expect(plan.cost.manpower).toBe(80);
  });

  it('lays wire anywhere but raises emplacements only on ground it holds', () => {
    const w = battle();
    for (const p of w.points) p.owner = 1;
    // Find open ground we do not hold.
    let spot: { tx: number; ty: number } | undefined;
    for (let ty = 2; ty < w.map.h - 4 && !spot; ty++) {
      for (let tx = 2; tx < w.map.w - 4 && !spot; tx++) {
        if (!ownGround(w, 0, tx, ty) && !ownGround(w, 0, tx + 3, ty + 1)) spot = { tx, ty };
      }
    }
    expect(spot).toBeDefined();
    const { tx, ty } = spot!;
    for (let x = tx; x <= tx + 3; x++) for (let y = ty; y <= ty + 1; y++) w.map.set(x, y, T.Open);
    expect(planBuild(w, 'mg_nest', at(tx, ty), at(tx, ty), 0).tiles.some((t) => t.valid)).toBe(false);
    expect(planBuild(w, 'wire', at(tx, ty), at(tx + 3, ty), 0).tiles.every((t) => t.valid)).toBe(true);
    expect(planBuild(w, 'mine', at(tx, ty + 1), at(tx, ty + 1), 0).tiles.every((t) => t.valid)).toBe(true);
  });

  it('will not build on buildings or water', () => {
    const w = battle();
    w.map.set(20, 30, T.Building);
    w.map.set(21, 30, T.Water);
    const plan = planBuild(w, 'wire', at(19, 30), at(22, 30));
    expect(plan.tiles.map((t) => t.valid)).toEqual([true, false, false, true]);
  });

  it('builds sandbags tile by tile and charges for them', () => {
    const w = battle();
    const eng = w.spawn(0, 'us_engineers', at(20, 32), 0);
    const before = w.teams[0].resources.manpower;
    expect(issueBuild(w, eng, 'sandbags', at(19, 30), at(22, 30)).ok).toBe(true);
    expect(w.teams[0].resources.manpower).toBeLessThan(before - 39);
    run(w, 20);
    expect([19, 20, 21, 22].map((x) => w.map.get(x, 30))).toEqual([T.Sandbag, T.Sandbag, T.Sandbag, T.Sandbag]);
    expect(eng.order.kind).toBe('idle');
    expect(w.constructions).toHaveLength(0);
  });

  it('refunds unbuilt tiles when the engineers are given another order', () => {
    const w = battle();
    const eng = w.spawn(0, 'us_engineers', at(20, 32), 0);
    const start = w.teams[0].resources.manpower;
    issueBuild(w, eng, 'tanktrap', at(19, 30), at(24, 30));
    issueMove(w, eng, at(25, 33));
    run(w, 0.1);
    expect(w.constructions).toHaveLength(0);
    expect(w.teams[0].resources.manpower).toBeGreaterThanOrEqual(start - 1);
  });

  it('a second engineer squad helps and the job finishes faster', () => {
    const timeToBuild = (helpers: number) => {
      const w = battle();
      const lead = w.spawn(0, 'us_engineers', at(20, 32), 0);
      issueBuild(w, lead, 'tanktrap', at(19, 30), at(24, 30));
      const id = lead.order.targetId!;
      for (let i = 0; i < helpers; i++) expect(issueHelpBuild(w, w.spawn(0, 'us_engineers', at(22, 32), 0), id).ok).toBe(true);
      let t = 0;
      while (w.constructions.length > 0 && t < 60) {
        run(w, 0.5);
        t += 0.5;
      }
      expect([19, 20, 21, 22, 23, 24].every((x) => w.map.get(x, 30) === T.TankTrap)).toBe(true);
      return t;
    };
    expect(timeToBuild(1)).toBeLessThan(timeToBuild(0) * 0.75);
  });

  it('a job is only cancelled when every squad on it leaves', () => {
    const w = battle();
    const lead = w.spawn(0, 'us_engineers', at(20, 32), 0);
    const helper = w.spawn(0, 'us_engineers', at(22, 32), 0);
    issueBuild(w, lead, 'sandbags', at(19, 30), at(24, 30));
    issueHelpBuild(w, helper, lead.order.targetId!);
    issueMove(w, lead, at(25, 33));
    run(w, 0.2);
    expect(w.constructions).toHaveLength(1);
    issueMove(w, helper, at(25, 33));
    run(w, 0.2);
    expect(w.constructions).toHaveLength(0);
  });

  it('wire stops infantry but tanks crush it; tank traps stop tanks', () => {
    const w = battle();
    w.map.set(24, 30, T.Wire);
    w.map.set(25, 30, T.TankTrap);
    expect(w.map.passable(24, 30, 'infantry')).toBe(false);
    expect(w.map.passable(24, 30, 'vehicle')).toBe(true);
    expect(w.map.passable(25, 30, 'infantry')).toBe(true);
    expect(w.map.passable(25, 30, 'vehicle')).toBe(false);
  });

  it('a mine is laid, stays hidden in the mine list and wrecks an enemy tank', () => {
    const w = battle();
    const eng = w.spawn(0, 'us_engineers', at(20, 32), 0);
    issueBuild(w, eng, 'mine', at(22, 30), at(22, 30));
    run(w, 12);
    expect(w.mines).toHaveLength(1);
    const tank = w.spawn(1, 'ija_chiha', at(28, 30), Math.PI);
    issueMove(w, tank, at(18, 30));
    run(w, 10);
    expect(w.mines).toHaveLength(0);
    expect(tank.dead || tank.models[0].hp < tank.models[0].maxHp * 0.7).toBe(true);
  });

  it('repairs a damaged friendly tank', () => {
    const w = battle();
    const tank = w.spawn(0, 'us_stuart', at(24, 30), 0);
    tank.models[0].hp = 200;
    const eng = w.spawn(0, 'us_engineers', at(20, 32), 0);
    expect(issueRepair(w, eng, tank).ok).toBe(true);
    run(w, 25);
    expect(tank.models[0].hp).toBe(tank.models[0].maxHp);
    expect(eng.order.kind).toBe('idle');
  });

  it('sandbags shrug off bullets and single blasts, but a bombardment breaks them', () => {
    const w = battle();
    w.map.set(24, 30, T.Sandbag);
    const centre = w.map.tileCenter(24, 30);
    explode(w, centre, WEAPONS.type97_grenade, null);
    const hit = defenseAt(w, 24, 30)!;
    expect(hit.hp).toBeLessThan(hit.maxHp);
    expect(w.map.get(24, 30)).toBe(T.Sandbag);
    let shells = 1;
    while (w.map.get(24, 30) === T.Sandbag && shells < 50) {
      explode(w, centre, WEAPONS.type97_mortar, null);
      shells++;
    }
    expect(w.map.get(24, 30)).toBe(T.Crater);
    // Sturdy: it takes several direct mortar hits.
    expect(shells).toBeGreaterThanOrEqual(5);
  });

  it('tank traps take far less from explosions than sandbags', () => {
    const w = battle();
    w.map.set(22, 30, T.Sandbag);
    w.map.set(26, 30, T.TankTrap);
    explode(w, w.map.tileCenter(22, 30), WEAPONS.type97_mortar, null);
    explode(w, w.map.tileCenter(26, 30), WEAPONS.type97_mortar, null);
    const bags = defenseAt(w, 22, 30)!;
    const trap = defenseAt(w, 26, 30)!;
    expect((trap.maxHp - trap.hp) / trap.maxHp).toBeLessThan((bags.maxHp - bags.hp) / bags.maxHp);
  });

  it('engineers repair damaged sandbags', () => {
    const w = battle();
    w.map.set(24, 30, T.Sandbag);
    for (let i = 0; i < 3; i++) explode(w, w.map.tileCenter(24, 30), WEAPONS.type97_mortar, null);
    const eng = w.spawn(0, 'us_engineers', at(20, 32), 0);
    const rifles = w.spawn(0, 'us_riflemen', at(20, 33), 0);
    expect(issueRepairDefense(w, rifles, 24, 30).ok).toBe(false);
    expect(issueRepairDefense(w, eng, 24, 30).ok).toBe(true);
    run(w, 30);
    const d = defenseAt(w, 24, 30)!;
    expect(d.hp).toBe(d.maxHp);
    expect(eng.order.kind).toBe('idle');
  });

  it('engineers do not fight while they repair', () => {
    const w = battle();
    const tank = w.spawn(0, 'us_stuart', at(24, 30), 0);
    tank.models[0].hp = 150;
    const eng = w.spawn(0, 'us_engineers', at(23, 32), 0);
    const enemy = w.spawn(1, 'ija_riflemen', at(24, 38), Math.PI);
    for (const m of enemy.models) m.weapons = [];
    issueRepair(w, eng, tank);
    let fired = false;
    for (let t = 0; t < 5; t += SIM_DT) {
      w.step(SIM_DT);
      if (w.events.some((e) => e.type === 'shot' && e.team === 0 && eng.lastFired > 0)) fired = true;
      w.events.length = 0;
    }
    expect(eng.lastFired).toBe(-Infinity);
    expect(fired).toBe(false);
    expect(tank.models[0].hp).toBeGreaterThan(150);
  });

  it('only engineers build or repair', () => {
    const w = battle();
    const rifles = w.spawn(0, 'us_riflemen', at(20, 32), 0);
    const tank = w.spawn(0, 'us_stuart', at(24, 30), 0);
    tank.models[0].hp = 100;
    expect(issueBuild(w, rifles, 'sandbags', at(19, 30), at(22, 30)).ok).toBe(false);
    expect(issueRepair(w, rifles, tank).ok).toBe(false);
  });
});

describe('engineer structures', () => {
  it('builds an MG nest that fires on enemies by itself', () => {
    const w = battle();
    w.teams[0].resources.manpower = 2000;
    w.teams[0].resources.munitions = 200;
    const eng = w.spawn(0, 'us_engineers', at(20, 32), 0);
    expect(issueBuild(w, eng, 'mg_nest', at(22, 30), at(22, 30)).ok).toBe(true);
    // No second structure on top of the first.
    expect(planBuild(w, 'bunker', at(23, 30), at(23, 30)).tiles[0].valid).toBe(false);
    run(w, 25);
    const nest = w.squads.find((s) => s.def.id === 'mg_nest');
    expect(nest?.team).toBe(0);
    expect(eng.order.kind).toBe('idle');
    const enemy = w.spawn(1, 'ija_riflemen', at(28, 30), 0);
    const hp = enemy.models.reduce((s, m) => s + m.hp, 0);
    run(w, 4);
    expect(enemy.models.reduce((s, m) => s + (m.alive ? m.hp : 0), 0)).toBeLessThan(hp);
  });

  it('lets squads near a bunker reinforce, and heals soldiers near an aid tent', () => {
    const w = battle();
    // No friendly points or HQ nearby: only the bunker supplies this spot.
    for (const p of w.points) p.owner = -1;
    w.hqOf(0)!.pos = { x: 0, y: 0 };
    const bunker = w.spawn(0, 'bunker', at(24, 30), 0);
    const tent = w.spawn(0, 'aid_tent', at(20, 30), 0);
    const far = w.spawn(0, 'us_riflemen', at(24, 32), 0);
    expect(canReinforceHere(w, far)).toBe(true);
    bunker.dead = true;
    expect(canReinforceHere(w, far)).toBe(false);
    const hurt = w.spawn(0, 'us_riflemen', at(21, 31), 0);
    hurt.models[0].hp = 20;
    run(w, 12);
    expect(hurt.models[0].hp).toBeGreaterThan(40);
    expect(tent.dead).toBe(false);
  });

  it('only the headquarters takes a rally point', () => {
    const w = battle();
    const nest = w.spawn(0, 'mg_nest', at(22, 30), 0);
    expect(issueMove(w, nest, at(25, 30)).ok).toBe(false);
    const hq = w.hqOf(0)!;
    expect(issueMove(w, hq, at(25, 30)).ok).toBe(true);
    expect(hq.rally).toEqual(at(25, 30));
  });
});

describe('structure toughness', () => {
  const hullOf = (sq: { models: { hp: number }[] }) => sq.models[0].hp;

  it('a tank knocks out an MG nest in a few shots', () => {
    const w = battle();
    const nest = w.spawn(1, 'mg_nest', at(26, 30), 0);
    w.spawn(0, 'us_stuart', at(16, 30), 0);
    run(w, 15);
    expect(nest.dead).toBe(true);
  });

  it('rifles barely scratch a bunker, a bazooka squad breaks it', () => {
    const w = battle();
    const bunker = w.spawn(1, 'bunker', at(26, 30), 0);
    bunker.models[0].weapons.length = 0;
    w.spawn(0, 'us_riflemen', at(18, 30), 0);
    run(w, 20);
    expect(hullOf(bunker)).toBeGreaterThan(1000);
    w.spawn(0, 'us_bazooka', at(19, 32), 0);
    run(w, 40);
    expect(bunker.dead).toBe(true);
  });

  it('an aid tent goes down quickly under rifle fire', () => {
    const w = battle();
    const tent = w.spawn(1, 'aid_tent', at(24, 30), 0);
    w.spawn(0, 'us_riflemen', at(18, 30), 0);
    run(w, 30);
    expect(tent.dead).toBe(true);
  });
});

describe('emplacements as targets', () => {
  it('weapons that can break an emplacement go for it; rifles leave a bunker alone', () => {
    const w = battle();
    const bunker = w.spawn(0, 'bunker', at(24, 30), 0);
    const nest = w.spawn(0, 'mg_nest', at(22, 30), 0);
    const tank = w.spawn(1, 'ija_chiha', at(30, 30), 0);
    const rifles = w.spawn(1, 'ija_riflemen', at(30, 32), 0);
    expect(fortPriority(tank, nest)).toBeLessThan(1);
    expect(fortPriority(rifles, bunker)).toBeGreaterThan(1);
  });

  it('the enemy commander sends its tank after a nest it can see', () => {
    const w = battle();
    const nest = w.spawn(0, 'mg_nest', at(22, 30), 0);
    w.spawn(1, 'ija_chiha', at(32, 30), Math.PI);
    const ai = new AICommander(1);
    for (let t = 0; t < 25 && !nest.dead; t += SIM_DT) {
      ai.update(w, SIM_DT);
      w.step(SIM_DT);
      w.events.length = 0;
    }
    expect(nest.dead).toBe(true);
  });
});

describe('tier buildings', () => {
  it('lock units and upgrades until the engineers raise them, in order', () => {
    const w = battle();
    w.teams[0].resources = { manpower: 5000, munitions: 500, fuel: 500 };
    expect(queueProduction(w, 0, 'us_hmg').ok).toBe(false);
    expect(queueProduction(w, 0, 'us_riflemen').ok).toBe(true);
    const eng = w.spawn(0, 'us_engineers', at(20, 32), 0);
    // Tier 2 needs Tier 1 first.
    expect(issueBuild(w, eng, 'us_tech2', at(24, 30), at(24, 30)).reason).toMatch(/Build the/);
    expect(issueBuild(w, eng, 'us_tech1', at(24, 30), at(24, 30)).ok).toBe(true);
    run(w, 45);
    expect(w.hasTech(0, 'us_tech1')).toBe(true);
    expect(queueProduction(w, 0, 'us_hmg').ok).toBe(true);
    expect(queueProduction(w, 0, 'us_bazooka').ok).toBe(false);
    // Only one of each.
    expect(issueBuild(w, eng, 'us_tech1', at(20, 29), at(20, 29)).reason).toMatch(/already built/);
  });

  it('missions that drop you into a fight have everything unlocked', () => {
    const w = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'], scenario: { ...SCENARIOS['tow-summit'] } });
    expect(w.hasTech(0, 'us_tech3')).toBe(true);
  });
});

describe('bases and emplacements', () => {
  it('an MG nest only fires through its front arc', () => {
    const w = battle();
    // Headquarters' gun and the starting engineers are in range here; keep them out of this.
    w.hqOf(0)!.models[0].weapons.length = 0;
    for (const s of w.squads) if (s.def.id === 'us_engineers') for (const m of s.models) m.weapons.length = 0;
    const nest = w.spawn(0, 'mg_nest', at(24, 30), 0); // facing east
    const behind = w.spawn(1, 'ija_riflemen', at(18, 30), 0);
    run(w, 6);
    expect(behind.models.every((m) => m.hp === m.maxHp || !m.alive)).toBe(true);
    const front = w.spawn(1, 'ija_riflemen', at(30, 30), 0);
    run(w, 6);
    expect(front.models.some((m) => m.hp < m.maxHp || !m.alive)).toBe(true);
    expect(nest.dead).toBe(false);
  });

  it('a finished structure takes up its footprint, and frees it when destroyed', () => {
    const w = battle();
    w.teams[0].resources = { manpower: 2000, munitions: 200, fuel: 200 };
    const eng = w.spawn(0, 'us_engineers', at(20, 32), 0);
    expect(issueBuild(w, eng, 'bunker', at(24, 30), at(27, 30)).ok).toBe(true);
    run(w, 45);
    const bunker = w.squads.find((s) => s.def.id === 'bunker')!;
    expect(bunker.footprint).toHaveLength(4);
    expect(Math.abs(bunker.heading)).toBeLessThan(0.1);
    for (const f of bunker.footprint) expect(w.map.passable(f.tx, f.ty, 'infantry')).toBe(false);
    const tiles = [...bunker.footprint];
    bunker.models[0].alive = false;
    bunker.dead = true;
    run(w, 0.1);
    for (const f of tiles) expect(w.map.passable(f.tx, f.ty, 'infantry')).toBe(true);
  });

  it('a tier building recruits its own units and they come out of it', () => {
    const w = battle();
    w.teams[0].resources = { manpower: 2000, munitions: 200, fuel: 200 };
    const tech = w.spawn(0, 'us_tech1', at(24, 30), 0);
    expect(queueProduction(w, 0, 'us_hmg', tech).ok).toBe(true);
    expect(tech.production).toHaveLength(1);
    expect(queueProduction(w, 0, 'us_riflemen', tech).ok).toBe(true);
    expect(w.hqOf(0)!.production).toHaveLength(1);
    run(w, 30);
    const hmg = w.squads.find((s) => s.def.id === 'us_hmg')!;
    expect(Math.hypot(hmg.pos.x - tech.pos.x, hmg.pos.y - tech.pos.y)).toBeLessThan(TILE * 5);
  });

  it('squads reinforce only close to a base, and the soldier comes from that base', () => {
    const w = battle();
    for (const p of w.points) p.owner = -1;
    w.hqOf(0)!.pos = { x: 0, y: 0 };
    const rifles = w.spawn(0, 'us_riflemen', at(24, 32), 0);
    expect(canReinforceHere(w, rifles)).toBe(false);
    const tech = w.spawn(0, 'us_tech1', at(28, 30), 0);
    expect(canReinforceHere(w, rifles)).toBe(true);
    rifles.models[0].alive = false;
    w.teams[0].resources.manpower = 500;
    expect(issueReinforce(w, rifles).ok).toBe(true);
    run(w, 5.6);
    const recruit = rifles.models[rifles.models.length - 1];
    expect(recruit.alive).toBe(true);
    expect(Math.hypot(recruit.pos.x - tech.pos.x, recruit.pos.y - tech.pos.y)).toBeLessThan(Math.hypot(rifles.pos.x - tech.pos.x, rifles.pos.y - tech.pos.y) + TILE);
  });
});
