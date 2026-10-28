import type { TerrainDef } from './types';

export const T = {
  Open: 0,
  Road: 1,
  Paddy: 2,
  Hedge: 3,
  Crater: 4,
  Sandbag: 5,
  Wall: 6,
  Building: 7,
  Jungle: 8,
  Water: 9,
  Rampart: 10,
  Wire: 11,
  TankTrap: 12,
  /** Ground taken up by a structure: nothing passes through it. */
  Emplacement: 13,
  /** What is left of a house that was shelled down: broken walls to crouch behind. */
  Rubble: 14,
} as const;

export type TerrainId = (typeof T)[keyof typeof T];

const X = Infinity;

export const TERRAIN: readonly TerrainDef[] = [
  { id: T.Open, name: 'Grass', cover: 'none', infantryCost: 1, vehicleCost: 1, blocksSight: false, sightDensity: 0, crushInto: null },
  { id: T.Road, name: 'Road', cover: 'none', infantryCost: 0.85, vehicleCost: 0.7, blocksSight: false, sightDensity: 0, crushInto: null },
  // Flooded rice paddies leave troops exposed and slow: negative cover.
  { id: T.Paddy, name: 'Rice Paddy', cover: 'negative', infantryCost: 1.5, vehicleCost: 1.8, blocksSight: false, sightDensity: 0, crushInto: null },
  { id: T.Hedge, name: 'Hedgerow', cover: 'light', infantryCost: 1.3, vehicleCost: 1.4, blocksSight: false, sightDensity: 0.6, crushInto: T.Open },
  { id: T.Crater, name: 'Shell Crater', cover: 'light', infantryCost: 1.2, vehicleCost: 1.3, blocksSight: false, sightDensity: 0, crushInto: null },
  { id: T.Sandbag, name: 'Sandbags', cover: 'heavy', infantryCost: 1.6, vehicleCost: 1.6, blocksSight: false, sightDensity: 0, crushInto: T.Open },
  { id: T.Wall, name: 'Stone Wall', cover: 'heavy', infantryCost: 2, vehicleCost: X, blocksSight: false, sightDensity: 0.4, crushInto: null },
  { id: T.Building, name: 'Building', cover: 'heavy', infantryCost: X, vehicleCost: X, blocksSight: true, sightDensity: 0, crushInto: null },
  { id: T.Jungle, name: 'Jungle', cover: 'light', infantryCost: 1.6, vehicleCost: X, blocksSight: false, sightDensity: 1, crushInto: null },
  { id: T.Water, name: 'River', cover: 'none', infantryCost: X, vehicleCost: X, blocksSight: false, sightDensity: 0, crushInto: null },
  // Massive fortress walls (Intramuros): nothing climbs over or sees through them.
  { id: T.Rampart, name: 'Fortress Wall', cover: 'heavy', infantryCost: X, vehicleCost: X, blocksSight: true, sightDensity: 0, crushInto: null },
  // Built by engineers. Wire stops infantry but tanks roll over it; tank traps are the reverse.
  { id: T.Wire, name: 'Barbed Wire', cover: 'none', infantryCost: X, vehicleCost: 1.2, blocksSight: false, sightDensity: 0, crushInto: T.Open },
  { id: T.TankTrap, name: 'Tank Traps', cover: 'light', infantryCost: 1.3, vehicleCost: X, blocksSight: false, sightDensity: 0, crushInto: null },
  { id: T.Emplacement, name: 'Emplacement', cover: 'heavy', infantryCost: X, vehicleCost: X, blocksSight: false, sightDensity: 0, crushInto: null },
  { id: T.Rubble, name: 'Rubble', cover: 'light', infantryCost: 1.5, vehicleCost: 2.2, blocksSight: false, sightDensity: 0.35, crushInto: null },
];

/** Lowest per-tile cost of any terrain; keeps the A* heuristic admissible. */
export const MIN_TERRAIN_COST = 0.7;
