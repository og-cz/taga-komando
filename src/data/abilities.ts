import type { AbilityDef } from './types';

const LIST: AbilityDef[] = [
  {
    id: 'grenade_us', name: 'Granada', hotkey: 'G',
    description: 'Throw a fragmentation grenade. Flushes infantry out of cover and knocks out crew weapons.',
    cost: { manpower: 0, munitions: 25, fuel: 0 }, cooldown: 30, range: 110, weapon: 'mk2_grenade',
    shots: 1, interval: 0, windup: 0.8, requiresSetup: false,
  },
  {
    id: 'grenade_ija', name: 'Teryūdan', hotkey: 'G',
    description: 'Throw a Type 97 grenade. Flushes infantry out of cover and knocks out crew weapons.',
    cost: { manpower: 0, munitions: 20, fuel: 0 }, cooldown: 30, range: 110, weapon: 'type97_grenade',
    shots: 1, interval: 0, windup: 0.9, requiresSetup: false,
  },
  {
    id: 'barrage_us', name: 'Barrage ng Mortero', hotkey: 'B',
    description: 'Fire six rounds on a target area. Does not need vision of the target.',
    cost: { manpower: 0, munitions: 30, fuel: 0 }, cooldown: 45, range: 440, weapon: 'm2_mortar',
    shots: 6, interval: 1, windup: 0.5, requiresSetup: true,
  },
  {
    id: 'barrage_ija', name: 'Hakugeki Hōgeki', hotkey: 'B',
    description: 'Fire five heavy rounds on a target area. Does not need vision of the target.',
    cost: { manpower: 0, munitions: 30, fuel: 0 }, cooldown: 45, range: 450, weapon: 'type97_mortar',
    shots: 5, interval: 1.3, windup: 0.5, requiresSetup: true,
  },
];

export const ABILITIES: Readonly<Record<string, AbilityDef>> = Object.fromEntries(LIST.map((a) => [a.id, a]));
