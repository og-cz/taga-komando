import type { WeaponDef } from './types';

const DEFAULTS: Omit<WeaponDef, 'id' | 'name'> = {
  range: 180,
  minRange: 0,
  accuracy: [0.5, 0.3],
  damage: 10,
  penetration: [1.5, 1],
  cooldown: 1,
  clip: 0,
  reload: 0,
  suppression: 0,
  moveAccuracy: 0.5,
  infantryAccuracy: 1,
  aoe: 0,
  indirect: false,
  scatter: 0,
  craterChance: 0,
  crew: false,
  arc: 360,
  turret: false,
  prefers: 'infantry',
  projectile: 'bullet',
  vs: {},
};

const weapon = (id: string, name: string, stats: Partial<WeaponDef>): WeaponDef => ({
  ...DEFAULTS,
  ...stats,
  id,
  name,
});

const LIST: WeaponDef[] = [
  // Small arms
  weapon('m1_garand', 'Riple Kalayaan', {
    vs: { team: 1.1, structure: 0.2 },
    range: 180, accuracy: [0.62, 0.36], damage: 16, cooldown: 1.15, clip: 8, reload: 2.5,
    suppression: 0.006, moveAccuracy: 0.55,
  }),
  weapon('arisaka', 'Type 99 Arisaka', {
    vs: { team: 1.1, structure: 0.2 },
    range: 180, accuracy: [0.58, 0.38], damage: 16, cooldown: 1.35, clip: 5, reload: 2.6,
    suppression: 0.006, moveAccuracy: 0.45,
  }),
  weapon('m1_carbine', 'Karabina Kalayaan', {
    vs: { team: 1.1, structure: 0.2 },
    range: 150, accuracy: [0.55, 0.3], damage: 12, cooldown: 0.95, clip: 15, reload: 2.4,
    suppression: 0.004, moveAccuracy: 0.65,
  }),
  weapon('bar', 'Ripleng Awtomatiko', {
    vs: { team: 1.0, structure: 0.2 },
    range: 180, accuracy: [0.5, 0.3], damage: 10, cooldown: 0.33, clip: 20, reload: 3,
    suppression: 0.012, moveAccuracy: 0.45,
  }),
  weapon('type99_lmg', 'Type 99 Light MG', {
    vs: { team: 1.0, structure: 0.2 },
    range: 180, accuracy: [0.5, 0.3], damage: 10, cooldown: 0.4, clip: 30, reload: 4,
    suppression: 0.014, moveAccuracy: 0.35,
  }),
  weapon('type38_carbine', 'Type 38 Carbine', {
    vs: { team: 1.1, structure: 0.2 },
    range: 160, accuracy: [0.55, 0.32], damage: 16, cooldown: 1.4, clip: 5, reload: 2.4,
    suppression: 0.004, moveAccuracy: 0.55,
  }),

  // Crew-served machine guns: must set up, narrow arc, heavy suppression
  weapon('m1917_hmg', 'Mabigat na Ametralyadora', {
    vs: { team: 0.75, structure: 0.1 },
    range: 225, accuracy: [0.42, 0.24], damage: 8, cooldown: 0.12, clip: 50, reload: 4.5,
    suppression: 0.03, moveAccuracy: 0, crew: true, arc: 70,
  }),
  weapon('type92_hmg', 'Type 92 HMG', {
    vs: { team: 0.75, structure: 0.1 },
    range: 235, accuracy: [0.45, 0.28], damage: 11, cooldown: 0.19, clip: 30, reload: 3.8,
    suppression: 0.038, moveAccuracy: 0, crew: true, arc: 70,
  }),

  // Indirect fire
  weapon('m2_mortar', 'Mortero 60mm', {
    vs: { infantry: 0.75, team: 1.8, structure: 1.5, fort: 2 },
    range: 440, minRange: 120, damage: 55, penetration: [6, 6], cooldown: 4.2, suppression: 0.22,
    moveAccuracy: 0, aoe: 26, indirect: true, scatter: 42, craterChance: 0.3, crew: true, projectile: 'mortar',
  }),
  weapon('type97_mortar', 'Type 97 81mm Mortar', {
    vs: { infantry: 0.75, team: 1.8, structure: 1.5, fort: 2 },
    range: 450, minRange: 130, damage: 70, penetration: [8, 8], cooldown: 5.6, suppression: 0.28,
    moveAccuracy: 0, aoe: 30, indirect: true, scatter: 50, craterChance: 0.4, crew: true, projectile: 'mortar',
  }),

  // Anti-tank
  weapon('bazooka', 'Kanyong Balikat', {
    vs: { infantry: 0.6, team: 0.6, fort: 2 },
    range: 230, accuracy: [0.7, 0.5], damage: 190, penetration: [110, 85], cooldown: 4.5,
    suppression: 0.05, moveAccuracy: 0, infantryAccuracy: 0.3, prefers: 'vehicle', projectile: 'rocket',
  }),
  weapon('type97_at_rifle', 'Type 97 20mm AT Rifle', {
    vs: { infantry: 0.6, team: 0.6, fort: 1.3 },
    range: 225, accuracy: [0.7, 0.5], damage: 55, penetration: [75, 55], cooldown: 2.6, clip: 7, reload: 6,
    suppression: 0.03, moveAccuracy: 0, infantryAccuracy: 0.45, prefers: 'vehicle', projectile: 'shell',
  }),

  // Tank guns
  weapon('m6_37mm', 'Kanyon 37mm', {
    vs: { infantry: 0.8, team: 0.8, fort: 2 },
    range: 210, accuracy: [0.72, 0.5], damage: 70, penetration: [85, 65], cooldown: 3.1, suppression: 0.04,
    moveAccuracy: 0.7, infantryAccuracy: 0.45, turret: true, prefers: 'any', projectile: 'shell',
  }),
  weapon('type97_57mm', 'Type 97 57mm Gun', {
    vs: { team: 1.3, vehicle: 0.9, fort: 2.5 },
    range: 205, accuracy: [0.62, 0.42], damage: 45, penetration: [62, 48], cooldown: 3.8, suppression: 0.2,
    moveAccuracy: 0.6, aoe: 15, craterChance: 0.15, turret: true, prefers: 'infantry', projectile: 'shell',
  }),
  weapon('coax_30cal', 'Kasamang Ametralyadora', {
    vs: { team: 0.9 },
    range: 190, accuracy: [0.4, 0.22], damage: 8, cooldown: 0.16, clip: 40, reload: 3.5,
    suppression: 0.012, moveAccuracy: 0.7, turret: true,
  }),
  weapon('coax_type97', 'Type 97 Coaxial MG', {
    vs: { team: 0.9 },
    range: 190, accuracy: [0.4, 0.22], damage: 9, cooldown: 0.2, clip: 30, reload: 3.5,
    suppression: 0.014, moveAccuracy: 0.7, turret: true,
  }),

  // Structures
  weapon('hq_mg', 'Base Defense MG', {
    vs: {},
    range: 200, accuracy: [0.4, 0.25], damage: 8, cooldown: 0.25, clip: 30, reload: 4, suppression: 0.02,
  }),

  // ─── Doctrine weapons ───
  weapon('riple_luma', 'Lumang Riple', {
    vs: { team: 1.1, structure: 0.2 },
    range: 160, accuracy: [0.5, 0.28], damage: 15, cooldown: 1.8, clip: 5, reload: 3, suppression: 0.005, moveAccuracy: 0.4,
  }),
  weapon('murata', 'Murata Jū', {
    vs: { team: 1.1, structure: 0.2 },
    range: 160, accuracy: [0.5, 0.28], damage: 15, cooldown: 1.8, clip: 5, reload: 3, suppression: 0.005, moveAccuracy: 0.4,
  }),
  // Blades: deadly up close, useless against armour and walls.
  weapon('bolo', 'Bolo', {
    vs: { team: 1.2, structure: 0.02, vehicle: 0, fort: 0.02 },
    range: 20, accuracy: [0.85, 0.85], damage: 30, cooldown: 1.1, moveAccuracy: 1, suppression: 0.02,
  }),
  weapon('takeyari', 'Takeyari', {
    vs: { team: 1.2, structure: 0.02, vehicle: 0, fort: 0.02 },
    range: 22, accuracy: [0.8, 0.8], damage: 27, cooldown: 1.2, moveAccuracy: 1, suppression: 0.02,
  }),
  // Submachine guns: shock troops fire on the run.
  weapon('subfusil', 'Subfusil Kidlat', {
    vs: { team: 1.1, structure: 0.15 },
    range: 115, accuracy: [0.62, 0.3], damage: 9, cooldown: 0.14, clip: 30, reload: 2.6, suppression: 0.009, moveAccuracy: 0.85,
  }),
  weapon('type100_smg', 'Type 100 Kikanshō-jū', {
    vs: { team: 1.1, structure: 0.15 },
    range: 115, accuracy: [0.6, 0.3], damage: 9, cooldown: 0.15, clip: 30, reload: 2.7, suppression: 0.009, moveAccuracy: 0.85,
  }),
  // Towed anti-tank guns: set up, then very hard on armour.
  weapon('at_gun_37', 'Kanyong Pangontra 37mm', {
    vs: { infantry: 0.5, team: 0.6, fort: 2 },
    range: 270, accuracy: [0.75, 0.55], damage: 170, penetration: [120, 95], cooldown: 4.2, suppression: 0.05,
    moveAccuracy: 0, infantryAccuracy: 0.35, crew: true, arc: 60, prefers: 'vehicle', projectile: 'shell',
  }),
  weapon('type1_47mm', 'Type 1 47mm Sokushahō', {
    vs: { infantry: 0.5, team: 0.6, fort: 2 },
    range: 270, accuracy: [0.74, 0.55], damage: 175, penetration: [125, 100], cooldown: 4.4, suppression: 0.05,
    moveAccuracy: 0, infantryAccuracy: 0.35, crew: true, arc: 60, prefers: 'vehicle', projectile: 'shell',
  }),
  // Off-map artillery for commander barrages.
  weapon('artillery', 'Artillery', {
    vs: { infantry: 0.9, team: 1.6, structure: 1.5, fort: 2.2 },
    range: 0, damage: 95, penetration: [40, 40], aoe: 34, suppression: 0.4, craterChance: 0.6, projectile: 'mortar',
  }),

  // Emplaced guns only fire through their front arc (the way they were built facing).
  weapon('nest_mg', 'Emplaced MG', {
    vs: { team: 0.75, structure: 0.1 },
    range: 220, accuracy: [0.42, 0.25], damage: 9, cooldown: 0.16, clip: 40, reload: 4.5, suppression: 0.03, arc: 120,
  }),
  weapon('bunker_mg', 'Bunker MG', {
    vs: { team: 0.75, structure: 0.1 },
    range: 230, accuracy: [0.45, 0.27], damage: 9, cooldown: 0.16, clip: 40, reload: 4.5, suppression: 0.035, arc: 90,
  }),

  // A buried mine: built by engineers, set off by enemies stepping on it.
  weapon('mine', 'Mine', {
    vs: { infantry: 0.4, team: 0.4 },
    range: 0, damage: 220, penetration: [200, 200], aoe: 22, suppression: 0.5, craterChance: 1, projectile: 'grenade',
  }),

  // Ability-only munitions
  weapon('mk2_grenade', 'Granada', {
    vs: { team: 1.5, fort: 1.6 },
    range: 110, damage: 80, penetration: [10, 10], aoe: 30, suppression: 0.35, scatter: 16,
    craterChance: 0.05, projectile: 'grenade',
  }),
  weapon('type97_grenade', 'Type 97 Grenade', {
    vs: { team: 1.5, fort: 1.6 },
    range: 110, damage: 70, penetration: [10, 10], aoe: 32, suppression: 0.4, scatter: 18,
    craterChance: 0.05, projectile: 'grenade',
  }),
];

export const WEAPONS: Readonly<Record<string, WeaponDef>> = Object.fromEntries(LIST.map((w) => [w.id, w]));
