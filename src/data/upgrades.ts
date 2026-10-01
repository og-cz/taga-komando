import type { UpgradeDef } from './types';

const LIST: UpgradeDef[] = [
  // ─── Hukbong Maharlika ─────────────────────────────────────
  {
    id: 'us_bazooka_kit', name: 'Kanyong Balikat', hotkey: 'T',
    description: 'One rifleman takes a shoulder-fired rocket launcher, so the squad can fight back against tanks.',
    cost: { manpower: 0, munitions: 60, fuel: 0 }, time: 12, weapons: ['bazooka'], count: 1, requires: 'us_tech2',
  },
  {
    id: 'us_bar', name: 'Ripleng Awtomatiko', hotkey: 'Y',
    description: 'One rifleman takes an automatic rifle: much more firepower against infantry at mid range.',
    cost: { manpower: 0, munitions: 50, fuel: 0 }, time: 12, weapons: ['bar'], count: 1, requires: 'us_tech1',
  },

  // ─── Imperial Army ─────────────────────────────────────────
  {
    id: 'ija_lmg', name: 'Type 99 Light MG', hotkey: 'T',
    description: 'One rifleman takes a Type 99 light machine gun: heavy fire and suppression against infantry.',
    cost: { manpower: 0, munitions: 50, fuel: 0 }, time: 12, weapons: ['type99_lmg'], count: 1, requires: 'ija_tech1',
  },
  {
    id: 'ija_at_rifle', name: 'Type 97 AT Rifle', hotkey: 'Y',
    description: 'One rifleman takes a 20mm anti-tank rifle, so the squad can hurt light tanks.',
    cost: { manpower: 0, munitions: 55, fuel: 0 }, time: 12, weapons: ['type97_at_rifle'], count: 1, requires: 'ija_tech2',
  },
];

export const UPGRADES: Readonly<Record<string, UpgradeDef>> = Object.fromEntries(LIST.map((u) => [u.id, u]));
