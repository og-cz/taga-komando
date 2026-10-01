import { teamFlag } from './doctrine';
import { SUPPRESSION } from '../../data/balance';
import { isSoft, type Squad, type SuppressionState } from '../entities';
import type { World } from '../world';

export function applySuppression(world: World, sq: Squad, amount: number): void {
  if (amount <= 0 || sq.dead || !isSoft(sq)) return;
  if (teamFlag(world, sq.team, 'steady')) return;
  sq.suppression = Math.min(1, sq.suppression + amount);
  sq.lastSuppressed = world.time;
}

/** State machine with hysteresis so squads don't flicker between states. */
export function nextSuppressionState(current: SuppressionState, value: number, retreating: boolean): SuppressionState {
  if (!retreating) {
    if (value >= SUPPRESSION.pinnedAt) return 'pinned';
    if (current === 'pinned' && value > SUPPRESSION.pinnedRecover) return 'pinned';
  }
  if (value >= SUPPRESSION.suppressedAt) return 'suppressed';
  if ((current === 'suppressed' || current === 'pinned') && value > SUPPRESSION.suppressedRecover) return 'suppressed';
  return 'normal';
}

export function updateSuppression(world: World, dt: number): void {
  for (const sq of world.squads) {
    if (sq.dead || !isSoft(sq)) continue;
    if (world.time - sq.lastSuppressed > SUPPRESSION.decayDelay) {
      const rate = SUPPRESSION.decayRate * (sq.retreating ? 2 : 1);
      sq.suppression = Math.max(0, sq.suppression - rate * dt);
    }
    const next = nextSuppressionState(sq.suppState, sq.suppression, sq.retreating);
    if (next !== sq.suppState) {
      if (next === 'pinned') world.emit({ type: 'float', pos: { ...sq.pos }, text: 'PINNED', tone: 'bad' });
      else if (next === 'suppressed' && sq.suppState === 'normal') {
        world.emit({ type: 'float', pos: { ...sq.pos }, text: 'Suppressed', tone: 'bad' });
      }
      sq.suppState = next;
    }
  }
}

export function suppressionSpeed(sq: Squad): number {
  if (sq.retreating) return 1;
  if (sq.suppState === 'pinned') return SUPPRESSION.pinnedCrawl;
  if (sq.suppState === 'suppressed') return SUPPRESSION.suppressedSpeed;
  return 1;
}

export function suppressionAccuracy(sq: Squad): number {
  if (sq.suppState === 'pinned') return SUPPRESSION.pinnedAccuracy;
  if (sq.suppState === 'suppressed') return SUPPRESSION.suppressedAccuracy;
  return 1;
}
