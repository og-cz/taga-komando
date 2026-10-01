import { T } from './terrain';
import type { BuildableDef } from './types';

const TIER_TEXT: Record<string, string> = {
  '1': 'Tier 1: unlocks machine gun and mortar teams and the first rifle upgrade.',
  '2': 'Tier 2: unlocks anti-tank teams and the anti-tank rifle upgrade. Needs Tier 1.',
  '3': 'Tier 3: unlocks tanks. Needs Tier 2.',
};

const LIST: BuildableDef[] = [
  {
    id: 'sandbags', name: 'Sandbags', hotkey: 'Z',
    description: 'A wall of sandbags: heavy cover for anyone behind it. Bullets cannot hurt it; explosives wear it down and tanks can crush it.',
    cost: { manpower: 10, munitions: 0, fuel: 0 }, buildTime: 2, shape: 'line', terrain: T.Sandbag, maxLength: 8,
    hp: 600, blastResist: 1,
  },
  {
    id: 'wire', name: 'Barbed Wire', hotkey: 'X',
    description: 'Stops infantry in their tracks and funnels them into your guns. Tanks roll straight over it; explosions blow gaps in it.',
    cost: { manpower: 6, munitions: 0, fuel: 0 }, buildTime: 1.5, shape: 'line', terrain: T.Wire, maxLength: 10,
    hp: 160, blastResist: 1,
  },
  {
    id: 'tanktrap', name: 'Tank Traps', hotkey: 'C',
    description: 'Steel hedgehogs that no tank can cross. Infantry walk through and use them as light cover.',
    cost: { manpower: 15, munitions: 0, fuel: 0 }, buildTime: 3, shape: 'line', terrain: T.TankTrap, maxLength: 6,
    hp: 1000, blastResist: 0.5,
  },
  {
    id: 'mine', name: 'Mine', hotkey: 'V',
    description: 'A buried mine the enemy cannot see. Wrecks tanks and maims infantry that step on it.',
    cost: { manpower: 0, munitions: 25, fuel: 0 }, buildTime: 6, shape: 'point', terrain: null, maxLength: 1,
    hp: 0, blastResist: 0,
  },
  {
    id: 'mg_nest', name: 'MG Nest', hotkey: 'B',
    description: 'A machine gun behind a ring of sandbags that fires all round at anything in range.',
    cost: { manpower: 90, munitions: 35, fuel: 0 }, buildTime: 20, shape: 'structure', unit: 'mg_nest', limit: 4, footprint: [2, 2], terrain: null, maxLength: 1,
    hp: 0, blastResist: 0,
  },
  {
    id: 'bunker', name: 'Bunker', hotkey: 'N',
    description: 'A sturdy bunker with a machine gun. Squads nearby can reinforce and pick up upgrades there.',
    cost: { manpower: 220, munitions: 0, fuel: 0 }, buildTime: 35, shape: 'structure', unit: 'bunker', limit: 3, footprint: [2, 2], terrain: null, maxLength: 1,
    hp: 0, blastResist: 0,
  },
  {
    id: 'aid_tent', name: 'Aid Tent', hotkey: 'M',
    description: 'Heals friendly soldiers nearby while they are out of combat.',
    cost: { manpower: 150, munitions: 0, fuel: 0 }, buildTime: 25, shape: 'structure', unit: 'aid_tent', limit: 2, footprint: [2, 2], terrain: null, maxLength: 1,
    hp: 0, blastResist: 0,
  },
  // ─── Base: tier buildings, one of each per army ───
  ...[
    ['us_tech1', 'Kampo ng Suporta', 'Z', { manpower: 150, munitions: 0, fuel: 15 }, 35, undefined],
    ['us_tech2', 'Kampo Pangontra-Tangke', 'X', { manpower: 180, munitions: 0, fuel: 40 }, 45, 'us_tech1'],
    ['us_tech3', 'Garahe ng Tangke', 'C', { manpower: 200, munitions: 0, fuel: 80 }, 55, 'us_tech2'],
    ['ija_tech1', 'Shien Honbu', 'Z', { manpower: 150, munitions: 0, fuel: 15 }, 35, undefined],
    ['ija_tech2', 'Taisen Honbu', 'X', { manpower: 180, munitions: 0, fuel: 40 }, 45, 'ija_tech1'],
    ['ija_tech3', 'Sensha Shako', 'C', { manpower: 200, munitions: 0, fuel: 80 }, 55, 'ija_tech2'],
  ].map(([id, name, hotkey, cost, buildTime, requires]) => ({
    id: id as string,
    name: name as string,
    hotkey: hotkey as string,
    description: TIER_TEXT[(id as string).slice(-1)],
    cost: cost as BuildableDef['cost'],
    buildTime: buildTime as number,
    shape: 'structure' as const,
    unit: id as string,
    page: 'base' as const,
    requires: requires as string | undefined,
    unique: true,
    footprint: [3, 2] as const,
    terrain: null,
    maxLength: 1,
    hp: 0,
    blastResist: 0,
  })),

];

export const BUILDABLES: Readonly<Record<string, BuildableDef>> = Object.fromEntries(LIST.map((b) => [b.id, b]));
export const BUILDABLE_IDS = LIST.map((b) => b.id);

/** The defense a terrain tile is, if any (map-made sandbags count too). */
export const DEFENSE_BY_TERRAIN: ReadonlyMap<number, BuildableDef> = new Map(LIST.filter((b) => b.terrain !== null).map((b) => [b.terrain!, b]));
