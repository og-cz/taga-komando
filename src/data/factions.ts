import type { FactionDef } from './types';

const LIST: FactionDef[] = [
  {
    id: 'usaffe',
    name: 'Hukbong Maharlika',
    longName: 'Maharlika Army',
    description:
      'Filipino defenders of Luzon. Fewer but tougher riflemen, the fast Tamaraw light tank and rocket teams to hunt armour.',
    hq: 'us_hq',
    roster: ['us_riflemen', 'us_engineers', 'us_hmg', 'us_mortar', 'us_bazooka', 'us_stuart', 'us_luna', 'us_katipunero', 'us_at_gun', 'us_para', 'us_gerilya'],
    starting: ['us_engineers'],
  },
  {
    id: 'ija',
    name: 'Imperial Army',
    longName: 'Imperial Japanese Army — 14th Army',
    description:
      'Six-man rifle squads, a heavy 81mm mortar, AT rifle teams and the Chi-Ha tank whose HE shells shred infantry.',
    hq: 'ija_hq',
    roster: ['ija_riflemen', 'ija_engineers', 'ija_hmg', 'ija_mortar', 'ija_at', 'ija_chiha', 'ija_kirikomi', 'ija_giyu', 'ija_at_gun', 'ija_teishin', 'ija_yugeki'],
    starting: ['ija_engineers'],
  },
];

export const FACTIONS: Readonly<Record<string, FactionDef>> = Object.fromEntries(LIST.map((f) => [f.id, f]));
export const FACTION_IDS = LIST.map((f) => f.id);
