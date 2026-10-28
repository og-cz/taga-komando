import { T } from '../data/terrain';
import type { CoverType } from '../data/types';

/** Team 0 is always the player (blue), team 1 the enemy (red), as placeholder colours. */
export const TEAM = [
  { main: '#4f94e8', dark: '#1a3a66', light: '#a9cdf7', glow: 'rgba(79,148,232,' },
  { main: '#e3564b', dark: '#6b1f19', light: '#f6aaa3', glow: 'rgba(227,86,75,' },
] as const;

export const NEUTRAL = '#b8b2a0';

export const TERRAIN_BASE: Record<number, string> = {
  [T.Open]: '#5f7b3c',
  [T.Road]: '#9c8a60',
  [T.Paddy]: '#6d8f63',
  [T.Hedge]: '#5f7b3c',
  [T.Crater]: '#5f7b3c',
  [T.Sandbag]: '#5f7b3c',
  [T.Wall]: '#5f7b3c',
  [T.Building]: '#6e4b31',
  [T.Jungle]: '#2c4f22',
  [T.Water]: '#3b6e8c',
  [T.Rampart]: '#7d7668',
  [T.Wire]: '#5f7b3c',
  [T.TankTrap]: '#5f7b3c',
  [T.Emplacement]: '#6b5e44',
  [T.Rubble]: '#6f6252',
};

export const COVER_COLOR: Record<CoverType, string> = {
  negative: '#e0463c',
  none: '#b8b8b8',
  light: '#f2c94c',
  heavy: '#4cd964',
};
