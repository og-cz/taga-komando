import type { CoverType, Difficulty, PointKind, Resources } from './types';

/** World units per map tile. */
export const TILE = 16;
export const SIM_DT = 1 / 30;
export const MAX_SIGHT_DENSITY = 2.5;
export const VISION_INTERVAL = 0.2;

export const COVER: Record<CoverType, { accuracy: number; suppression: number; explosive: number; rank: number }> = {
  negative: { accuracy: 1.25, suppression: 1.25, explosive: 1.15, rank: -1 },
  none: { accuracy: 1, suppression: 1, explosive: 1, rank: 0 },
  light: { accuracy: 0.72, suppression: 0.7, explosive: 0.9, rank: 1 },
  heavy: { accuracy: 0.5, suppression: 0.45, explosive: 0.7, rank: 2 },
};

export const SUPPRESSION = {
  suppressedAt: 0.4,
  suppressedRecover: 0.2,
  pinnedAt: 0.8,
  pinnedRecover: 0.5,
  decayDelay: 1.6,
  decayRate: 0.14,
  suppressedSpeed: 0.6,
  pinnedCrawl: 0.25,
  suppressedAccuracy: 0.7,
  pinnedAccuracy: 0.35,
};

/** Retreating squads run faster, are harder to hit and take only part of the damage. */
export const RETREAT = { speed: 1.4, receivedAccuracy: 0.55, damage: 0.55, arriveRadius: 60 };

export const LOGISTICS = {
  healRadius: 180,
  healRate: 5,
  /** Squads reinforce only close to headquarters, a tier building or a bunker. */
  reinforceHqRadius: 190,
  reinforceBaseRadius: 130,
  reinforcePointRadius: 110,
  reinforceTime: 5.5,
  /** A squad's own queue: reinforcements and an upgrade, this many jobs at a time. */
  squadQueue: 3,
  reinforceCostMult: 1.1,
  combatCooldown: 4,
};

export const CAPTURE = { radius: 56, time: 14, extraSquadBonus: 0.25, maxBonus: 1.5 };

export const ECONOMY: {
  start: Resources;
  base: Resources;
  points: Record<PointKind, Resources>;
  upkeepPerPop: number;
  minManpowerIncome: number;
  popCap: number;
  maxQueue: number;
} = {
  start: { manpower: 600, munitions: 60, fuel: 25 },
  base: { manpower: 340, munitions: 14, fuel: 8 },
  points: {
    victory: { manpower: 0, munitions: 10, fuel: 0 },
    munitions: { manpower: 0, munitions: 32, fuel: 0 },
    fuel: { manpower: 0, munitions: 0, fuel: 24 },
    manpower: { manpower: 45, munitions: 0, fuel: 0 },
  },
  upkeepPerPop: 2,
  minManpowerIncome: 60,
  popCap: 100,
  maxQueue: 3,
};

export const VICTORY = { tickets: 500, drainInterval: 2 };

export const VETERANCY = {
  accuracy: [1, 1.1, 1.2, 1.3],
  receivedAccuracy: [1, 0.92, 0.85, 0.78],
  killBonus: 60,
};

/** AI income multiplier per difficulty. */
/** Squads holding a house: green cover from every side (the house tiles), and a better view. */
export const GARRISON = {
  /** Sight from the windows. */
  sight: 1.25,
};

export const DIFFICULTY: Record<Difficulty, number> = { easy: 0.75, normal: 1, hard: 1.3 };

