import { describe, expect, it } from 'vitest';
import { MAPS } from '../src/data/maps';
import { issueAttackMove, issueStop } from '../src/sim/commands';
import { World } from '../src/sim/world';

interface DuelOptions {
  gap?: number;
  /** Attacker starts beside the defender's firing arc instead of in front of it. */
  flank?: boolean;
  /** A passive friendly squad that only provides vision (mortars need eyes on target). */
  spotter?: boolean;
}

/**
 * Attacker vs defender on open ground, alternating sides. Weapon teams start
 * set up, the defender's facing the attacker's approach along the road.
 * Returns the attacker's win and loss rates (the rest ran out of time).
 */
function duel(attacker: string, defender: string, o: DuelOptions = {}, trials = 12): { win: number; loss: number } {
  let wins = 0;
  let losses = 0;
  const gap = o.gap ?? 440;
  for (let seed = 1; seed <= trials; seed++) {
    const w = new World({ map: MAPS.bataan, factions: ['usaffe', 'ija'], seed });
    const left = seed % 2 === 0;
    const bx = left ? 560 + gap : 560;
    const ax = o.flank ? bx : left ? 560 : 560 + gap;
    const ay = o.flank ? 560 - 260 : 560;
    const A = w.spawn(0, attacker, { x: ax, y: ay }, 0);
    const B = w.spawn(1, defender, { x: bx, y: 560 }, 0);
    if (B.def.kind === 'team') {
      B.setup = 'deployed';
      B.setupFacing = left ? Math.PI : 0;
    }
    if (A.def.kind === 'team') {
      A.setup = 'deployed';
      A.setupFacing = Math.atan2(560 - ay, bx - ax);
    }
    if (o.spotter) {
      // On the road behind the gun, out of its arc: hedgerows elsewhere would hide it.
      const s = w.spawn(0, 'us_riflemen', { x: bx + (left ? 70 : -70), y: 560 }, 0);
      issueStop(w, s);
      for (const m of s.models) m.weapons = [];
    }
    if (A.def.kind !== 'team') issueAttackMove(w, A, { x: bx, y: 560 });
    if (B.def.kind !== 'team') issueAttackMove(w, B, { x: ax, y: ay });
    for (let t = 0; t < 150 && !A.dead && !B.dead; t += 1 / 30) {
      w.step(1 / 30);
      w.events.length = 0;
    }
    if (B.dead) wins++;
    else if (A.dead) losses++;
  }
  return { win: wins / trials, loss: losses / trials };
}

const winRate = (attacker: string, defender: string, o?: DuelOptions, trials?: number): number => duel(attacker, defender, o, trials).win;

// Each case simulates a dozen full fights; allow for a busy machine.
describe('unit counters', { timeout: 60_000 }, () => {
  it('a machine gun beats infantry charging it head-on', () => {
    expect(winRate('us_riflemen', 'ija_hmg')).toBeLessThanOrEqual(0.25);
    expect(winRate('ija_riflemen', 'us_hmg')).toBeLessThanOrEqual(0.3);
  });

  it('infantry beat a machine gun from the flank', () => {
    expect(winRate('us_riflemen', 'ija_hmg', { flank: true })).toBeGreaterThanOrEqual(0.6);
    expect(winRate('ija_riflemen', 'us_hmg', { flank: true })).toBeGreaterThanOrEqual(0.5);
  });

  it('a spotted mortar outranges a set-up machine gun', () => {
    // The gun can never reach the mortar; it can only kill the spotter and blind it.
    const r = duel('us_mortar', 'ija_hmg', { gap: 380, spotter: true });
    expect(r.loss).toBe(0);
    expect(r.win).toBeGreaterThanOrEqual(0.4);
  });

  it('infantry overrun a mortar', () => {
    expect(winRate('us_riflemen', 'ija_mortar')).toBeGreaterThanOrEqual(0.6);
    expect(winRate('ija_riflemen', 'us_mortar')).toBeGreaterThanOrEqual(0.55);
  });

  it('anti-tank squads kill tanks', () => {
    expect(winRate('us_bazooka', 'ija_chiha')).toBeGreaterThanOrEqual(0.6);
    expect(winRate('ija_at', 'us_stuart')).toBeGreaterThanOrEqual(0.75);
  });

  it('anti-tank squads lose to infantry', () => {
    expect(winRate('us_bazooka', 'ija_riflemen')).toBeLessThanOrEqual(0.2);
    expect(winRate('ija_at', 'us_riflemen')).toBeLessThanOrEqual(0.2);
  });

  it('tanks beat infantry and weapon teams', () => {
    expect(winRate('ija_chiha', 'us_riflemen')).toBeGreaterThanOrEqual(0.8);
    expect(winRate('us_stuart', 'ija_hmg')).toBeGreaterThanOrEqual(0.8);
  });

  it('rifle squads of both factions are evenly matched', () => {
    const r = winRate('us_riflemen', 'ija_riflemen', {}, 20);
    expect(r).toBeGreaterThanOrEqual(0.3);
    expect(r).toBeLessThanOrEqual(0.7);
  });
});
