/**
 * Which sound each weapon makes. Names refer to clips in ./sfx (name_1.ogg,
 * name_2.ogg… are variations picked at random). `gain` is the loudness at the
 * centre of the screen, `gap` the shortest time in seconds between two plays of
 * the same sound, so rapid fire never swamps the mix.
 */
export interface SoundSpec {
  name: string;
  gain: number;
  gap: number;
}

const s = (name: string, gain: number, gap = 0.03): SoundSpec => ({ name, gain, gap });

/** Firing sounds, by weapon id. */
export const FIRE: Readonly<Record<string, SoundSpec>> = {
  m1_garand: s('garand', 0.55),
  arisaka: s('arisaka', 0.55),
  m1_carbine: s('carbine', 0.45),
  type38_carbine: s('carbine38', 0.45),
  bar: s('bar', 0.45, 0.06),
  type99_lmg: s('lmg', 0.45, 0.07),
  m1917_hmg: s('hmg', 0.45, 0.07),
  type92_hmg: s('hmg92', 0.45, 0.09),
  coax_30cal: s('coax', 0.4, 0.08),
  coax_type97: s('coax', 0.4, 0.08),
  hq_mg: s('hmg', 0.4, 0.1),
  nest_mg: s('hmg', 0.45, 0.08),
  riple_luma: s('arisaka', 0.5),
  murata: s('arisaka', 0.5),
  subfusil: s('coax', 0.4, 0.07),
  type100_smg: s('coax', 0.4, 0.07),
  // Anti-tank guns have their own sharp, ringing crack, not the tanks' boom.
  at_gun_37: s('atgun', 0.75, 0.2),
  type94_37mm: s('atgun', 0.75, 0.2),
  at_gun_57: s('atgun', 0.85, 0.2),
  type1_47mm: s('atgun', 0.8, 0.2),
  bunker_mg: s('hmg', 0.45, 0.08),
  bazooka: s('bazooka', 0.6, 0.2),
  type97_at_rifle: s('atrifle', 0.6, 0.15),
  m6_37mm: s('tankgun', 0.75, 0.2),
  type97_57mm: s('tankgun', 0.8, 0.2),
  m2_mortar: s('mortar', 0.6, 0.15),
  type97_mortar: s('mortar', 0.7, 0.15),
  smoke_mortar_us: s('mortar', 0.55, 0.15),
  smoke_mortar_ija: s('mortar', 0.6, 0.15),
};

/** Rockets and HE shells that burst on impact (bazooka, tank guns). */
export const IMPACT: Readonly<Record<string, SoundSpec>> = {
  bazooka: s('explode_small', 0.65, 0.05),
  m6_37mm: s('explode_small', 0.4, 0.05),
  type97_57mm: s('explode_small', 0.5, 0.05),
};

/** Blast sounds, by weapon id; anything unlisted uses the small blast. */
export const BLAST: Readonly<Record<string, SoundSpec>> = {
  artillery: s('explode_big', 0.85, 0.08),
  mine: s('explode_big', 0.9, 0.1),
  type97_mortar: s('explode_big', 0.75, 0.08),
  m2_mortar: s('explode_small', 0.75, 0.06),
  type97_57mm: s('explode_small', 0.7, 0.06),
  mk2_grenade: s('explode_small', 0.7, 0.06),
  type97_grenade: s('explode_small', 0.7, 0.06),
};
export const DEFAULT_BLAST = s('explode_small', 0.65, 0.06);

/** A tank or vehicle destroyed. */
export const WRECK = s('explode_big', 1, 0.2);

/** Engine loop for vehicles. */
export const ENGINE = 'engine_loop';

/** A house falling in: beams cracking, walls roaring down, bricks clattering. */
export const COLLAPSE = s('collapse', 0.95, 0.3);
/** A smoke round or grenade bursting: a dull thump and a long hiss. */
export const SMOKE_POP = s('smoke_pop', 0.6, 0.1);
/** Burning houses: a roar with crackling timber, louder the more there are on screen. */
export const FIRE_LOOP = 'fire_loop';

/** The world around the battle: wind always, birds when it is quiet, guns far away now and then. */
export const WIND_LOOP = 'wind_loop';
export const BIRDS = s('birds', 0.2, 3);
export const DISTANT_GUNS = s('distant_boom', 0.32, 3);
