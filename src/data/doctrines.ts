import type { DoctrineDef } from './types';

/**
 * Doctrines: each army picks one way of fighting per battle. A doctrine adds a
 * special unit (recruited at a tier building) and two commander call-ins that
 * unlock as the army earns command points in combat. The tier buildings fly
 * the doctrine's banner once it is chosen.
 */

const mp = (manpower: number) => ({ manpower, munitions: 0, fuel: 0 });
const mu = (munitions: number) => ({ manpower: 0, munitions, fuel: 0 });

const LIST: DoctrineDef[] = [
  // ─── Hukbong Maharlika ─────────────────────────────────────
  {
    id: 'luna', faction: 'usaffe', name: 'Hukbo ni Heneral Luna', style: 'Lightning assault',
    description: 'Strike first and strike fast, in the spirit of General Antonio Luna. Shock troops in rayadillo hit at lightning speed and are gone before the enemy can answer.',
    field: '#1d2a4a', stripe: '#b3261e', emblem: 'sun', unit: 'us_luna',
    callIns: [
      { id: 'luna_lusob', name: 'Lusob!', description: 'Charge! All infantry move 35% faster and cannot be pinned for 15 seconds.', cp: 2, cost: mu(35), cooldown: 90, targeted: false, effect: { kind: 'buff', duration: 15, speed: 1.35, steady: true } },
      { id: 'luna_kidlat', name: 'Kidlat na Salakay', description: 'Lightning attack: every unit fires 30% more accurately for 20 seconds.', cp: 4, cost: mu(60), cooldown: 120, targeted: false, effect: { kind: 'buff', duration: 20, accuracy: 1.3 } },
    ],
  },
  {
    id: 'katipunan', faction: 'usaffe', name: 'Katipunan', style: 'People’s army',
    description: 'The sons of the Katipunan rise again: cheap, brave and many. Ten-man Katipunero squads charge with bolo and old rifles and swamp the enemy.',
    field: '#b3261e', stripe: '#f1ece0', emblem: 'k', unit: 'us_katipunero',
    callIns: [
      { id: 'kkk_sigaw', name: 'Sigaw ng Pugad Lawin', description: 'The cry of revolt: every squad shakes off suppression, patches up a quarter of its wounds and cannot be pinned for 12 seconds.', cp: 2, cost: mu(30), cooldown: 90, targeted: false, effect: { kind: 'buff', duration: 12, steady: true, rally: true } },
      { id: 'kkk_bayan', name: 'Hukbong Bayan', description: 'The barrios answer the call: a free Katipunero squad marches out of headquarters.', cp: 4, cost: mp(120), cooldown: 150, targeted: false, effect: { kind: 'levy', unit: 'us_katipunero' } },
    ],
  },
  {
    id: 'depensa', faction: 'usaffe', name: 'Tanggulang Bayan', style: 'Defence in depth',
    description: 'Hold the ground and make the enemy pay for every step: anti-tank guns, hardened positions and the artillery behind them.',
    field: '#4b5532', stripe: '#e0c34a', emblem: 'shield', unit: 'us_at_gun',
    callIns: [
      { id: 'dep_pinatibay', name: 'Pinatibay na Linya', description: 'Hold the line: every unit is 30% harder to hit for 30 seconds.', cp: 2, cost: mu(40), cooldown: 120, targeted: false, effect: { kind: 'buff', duration: 30, received: 0.7 } },
      { id: 'dep_artilerya', name: 'Barrage ng Artilerya', description: 'Eight heavy shells from the guns in the rear land on the target after a short delay.', cp: 4, cost: mu(90), cooldown: 150, targeted: true, effect: { kind: 'barrage', weapon: 'artillery', shots: 8, interval: 0.6, scatter: 60, delay: 3 } },
    ],
  },
  {
    id: 'himpapawid', faction: 'usaffe', name: 'Hukbong Himpapawid', style: 'Airborne',
    description: 'War from the sky: spotter planes watch the enemy and paratroopers drop wherever the fight needs them.',
    field: '#3f78b5', stripe: '#f1ece0', emblem: 'wings', unit: 'us_para',
    callIns: [
      { id: 'him_manman', name: 'Pagmamanman sa Himpapawid', description: 'A spotter plane circles the target and reveals everything around it for 25 seconds.', cp: 2, cost: mu(25), cooldown: 80, targeted: true, effect: { kind: 'recon', radius: 300, duration: 25 } },
      { id: 'him_lundag', name: 'Paglundag', description: 'A squad of Paracaidista drops onto the target. It must be somewhere your army can see.', cp: 4, cost: mp(330), cooldown: 150, targeted: true, effect: { kind: 'paradrop', unit: 'us_para' } },
    ],
  },
  {
    id: 'gerilya', faction: 'usaffe', name: 'Gerilya', style: 'Guerrilla war',
    description: 'Fight from the hills and the cane fields: unseen infiltrators, ambushes and mines on every road the enemy takes.',
    field: '#2e4428', stripe: '#8a6a3a', emblem: 'leaf', unit: 'us_gerilya',
    callIns: [
      { id: 'ger_tambang', name: 'Pananambang', description: 'Ambush: every infantry squad that holds still and holds fire is hidden from the enemy for 30 seconds.', cp: 2, cost: mu(30), cooldown: 100, targeted: false, effect: { kind: 'buff', duration: 30, camo: true } },
      { id: 'ger_mina', name: 'Mina sa Daan', description: 'Four hidden mines are planted around the target.', cp: 4, cost: mu(60), cooldown: 120, targeted: true, effect: { kind: 'mines', count: 4, radius: 70 } },
    ],
  },

  // ─── Imperial Army ─────────────────────────────────────────
  {
    id: 'kirikomi', faction: 'ija', name: 'Kirikomi Butai', style: 'Lightning assault',
    description: 'Close in fast and break the line: assault troops with submachine guns lead every attack.',
    field: '#6b5b3a', stripe: '#c4302b', emblem: 'star', unit: 'ija_kirikomi',
    callIns: [
      { id: 'kir_totsugeki', name: 'Totsugeki', description: 'Charge! All infantry move 35% faster and cannot be pinned for 15 seconds.', cp: 2, cost: mu(35), cooldown: 90, targeted: false, effect: { kind: 'buff', duration: 15, speed: 1.35, steady: true } },
      { id: 'kir_shuchu', name: 'Shūchū Kōgeki', description: 'Concentrated attack: every unit fires 30% more accurately for 20 seconds.', cp: 4, cost: mu(60), cooldown: 120, targeted: false, effect: { kind: 'buff', duration: 20, accuracy: 1.3 } },
    ],
  },
  {
    id: 'giyutai', faction: 'ija', name: 'Kokumin Giyūtai', style: 'People’s army',
    description: 'The volunteer corps: ten-man militia squads with spears and old rifles, cheap and many.',
    field: '#e8e2d0', stripe: '#c4302b', emblem: 'star', unit: 'ija_giyu',
    callIns: [
      { id: 'giyu_shiki', name: 'Shiki Kōyō', description: 'Raise the spirit: every squad shakes off suppression, patches up a quarter of its wounds and cannot be pinned for 12 seconds.', cp: 2, cost: mu(30), cooldown: 90, targeted: false, effect: { kind: 'buff', duration: 12, steady: true, rally: true } },
      { id: 'giyu_doin', name: 'Kokumin Dōin', description: 'Mobilisation: a free Giyūhei squad marches out of headquarters.', cp: 4, cost: mp(120), cooldown: 150, targeted: false, effect: { kind: 'levy', unit: 'ija_giyu' } },
    ],
  },
  {
    id: 'bogyo', faction: 'ija', name: 'Bōgyo Jinchi', style: 'Defence in depth',
    description: 'Dig in and bleed the attacker: anti-tank guns, fortified positions and heavy guns behind them.',
    field: '#5d5d55', stripe: '#e0c34a', emblem: 'shield', unit: 'ija_at_gun',
    callIns: [
      { id: 'bog_kenko', name: 'Kenko Jinchi', description: 'Hold fast: every unit is 30% harder to hit for 30 seconds.', cp: 2, cost: mu(40), cooldown: 120, targeted: false, effect: { kind: 'buff', duration: 30, received: 0.7 } },
      { id: 'bog_hogeki', name: 'Hōgeki', description: 'Eight heavy shells land on the target after a short delay.', cp: 4, cost: mu(90), cooldown: 150, targeted: true, effect: { kind: 'barrage', weapon: 'artillery', shots: 8, interval: 0.6, scatter: 60, delay: 3 } },
    ],
  },
  {
    id: 'teishin', faction: 'ija', name: 'Teishin Shūdan', style: 'Airborne',
    description: 'The raiding brigade: scout planes and paratroopers dropped behind the line.',
    field: '#4a7fb8', stripe: '#f1ece0', emblem: 'wings', unit: 'ija_teishin',
    callIns: [
      { id: 'tei_teisatsu', name: 'Teisatsu Hikō', description: 'A scout plane reveals everything around the target for 25 seconds.', cp: 2, cost: mu(25), cooldown: 80, targeted: true, effect: { kind: 'recon', radius: 300, duration: 25 } },
      { id: 'tei_koka', name: 'Kōka', description: 'A squad of Teishin-hei drops onto the target. It must be somewhere your army can see.', cp: 4, cost: mp(330), cooldown: 150, targeted: true, effect: { kind: 'paradrop', unit: 'ija_teishin' } },
    ],
  },
  {
    id: 'yugeki', faction: 'ija', name: 'Yūgeki-tai', style: 'Guerrilla war',
    description: 'Raiders and infiltrators: unseen squads, ambushes and mines behind the enemy line.',
    field: '#2e3d26', stripe: '#6e5231', emblem: 'leaf', unit: 'ija_yugeki',
    callIns: [
      { id: 'yug_fukuhei', name: 'Fukuhei', description: 'Ambush: every infantry squad that holds still and holds fire is hidden from the enemy for 30 seconds.', cp: 2, cost: mu(30), cooldown: 100, targeted: false, effect: { kind: 'buff', duration: 30, camo: true } },
      { id: 'yug_jirai', name: 'Jirai', description: 'Four hidden mines are planted around the target.', cp: 4, cost: mu(60), cooldown: 120, targeted: true, effect: { kind: 'mines', count: 4, radius: 70 } },
    ],
  },
];

export const DOCTRINES: Readonly<Record<string, DoctrineDef>> = Object.fromEntries(LIST.map((d) => [d.id, d]));

/** The doctrines an army can choose from. */
export const doctrinesOf = (faction: string): DoctrineDef[] => LIST.filter((d) => d.faction === faction);

/** Every call-in, by id. */
export const CALL_INS = Object.fromEntries(LIST.flatMap((d) => d.callIns.map((c) => [c.id, c])));
