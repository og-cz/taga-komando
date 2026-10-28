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
  {
    id: 'smoke_us', name: 'Granadang Usok', hotkey: 'N',
    description: 'Throw a smoke grenade. For about twenty seconds nobody sees or shoots through the cloud: cover a dash across open ground, or blind a machine gun.',
    cost: { manpower: 0, munitions: 15, fuel: 0 }, cooldown: 35, range: 110, weapon: 'smoke_grenade_us',
    shots: 1, interval: 0, windup: 0.8, requiresSetup: false,
  },
  {
    id: 'smoke_ija', name: 'Hatsuendan', hotkey: 'N',
    description: 'Throw a smoke candle. For about twenty seconds nobody sees or shoots through the cloud: cover a dash across open ground, or blind a machine gun.',
    cost: { manpower: 0, munitions: 15, fuel: 0 }, cooldown: 35, range: 110, weapon: 'smoke_grenade_ija',
    shots: 1, interval: 0, windup: 0.9, requiresSetup: false,
  },
  {
    id: 'smoke_barrage_us', name: 'Usok ng Mortero', hotkey: 'N',
    description: 'Fire three smoke rounds on a target area: a wall of smoke that blinds machine guns and covers an advance. Does not need vision of the target.',
    cost: { manpower: 0, munitions: 20, fuel: 0 }, cooldown: 50, range: 440, weapon: 'smoke_mortar_us',
    shots: 3, interval: 0.8, windup: 0.5, requiresSetup: true,
  },
  {
    id: 'smoke_barrage_ija', name: 'Enmaku Hōgeki', hotkey: 'N',
    description: 'Fire three smoke rounds on a target area: a wall of smoke that blinds machine guns and covers an advance. Does not need vision of the target.',
    cost: { manpower: 0, munitions: 20, fuel: 0 }, cooldown: 50, range: 450, weapon: 'smoke_mortar_ija',
    shots: 3, interval: 1, windup: 0.5, requiresSetup: true,
  },
];

export const ABILITIES: Readonly<Record<string, AbilityDef>> = Object.fromEntries(LIST.map((a) => [a.id, a]));
