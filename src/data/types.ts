export type TeamId = 0 | 1;
export type Owner = TeamId | -1;
export type CoverType = 'negative' | 'none' | 'light' | 'heavy';
export type UnitKind = 'infantry' | 'team' | 'vehicle' | 'structure';
export type UnitRole = 'hq' | 'line' | 'mg' | 'mortar' | 'at' | 'tank' | 'engineer' | 'fort' | 'tech';
export type PointKind = 'victory' | 'munitions' | 'fuel' | 'manpower';
export type Mover = 'infantry' | 'vehicle';
export type Difficulty = 'easy' | 'normal' | 'hard';

export interface Resources {
  manpower: number;
  munitions: number;
  fuel: number;
}

export interface TerrainDef {
  id: number;
  name: string;
  cover: CoverType;
  /** Path cost multiplier; Infinity means impassable. */
  infantryCost: number;
  vehicleCost: number;
  blocksSight: boolean;
  /** Accumulated along a sight line; too much dense foliage blocks vision. */
  sightDensity: number;
  /** Terrain a vehicle turns this tile into when driving over it, or null. */
  crushInto: number | null;
}

export type ProjectileKind = 'bullet' | 'shell' | 'rocket' | 'mortar' | 'grenade';

export interface WeaponDef {
  id: string;
  name: string;
  range: number;
  minRange: number;
  /** Hit chance at point-blank and at max range. */
  accuracy: readonly [number, number];
  damage: number;
  penetration: readonly [number, number];
  cooldown: number;
  /** Rounds per magazine; 0 means no reload cycle. */
  clip: number;
  reload: number;
  suppression: number;
  /** Accuracy multiplier while moving; 0 means the weapon cannot fire on the move. */
  moveAccuracy: number;
  /** Accuracy multiplier against man-sized targets (AT weapons are poor at this). */
  infantryAccuracy: number;
  aoe: number;
  indirect: boolean;
  scatter: number;
  craterChance: number;
  /** Crew-served: the team must set up before firing. */
  crew: boolean;
  /** Firing arc in degrees for crew weapons (360 = unrestricted). */
  arc: number;
  turret: boolean;
  prefers: 'infantry' | 'vehicle' | 'any';
  projectile: ProjectileKind;
  /**
   * Damage multiplier by target type. This is what makes the roster a web of
   * counters rather than a ladder: mortars wreck weapon teams, rifles bully
   * crews, anti-tank weapons are wasted on infantry, and so on. `fort` covers
   * engineer structures (nests, bunkers, tents); `structure` the headquarters.
   */
  vs: Readonly<Partial<Record<UnitKind | 'fort', number>>>;
}

export interface LoadoutEntry {
  weapons: readonly string[];
  count: number;
}

export interface ArmorDef {
  front: number;
  rear: number;
}

export interface VehicleDef {
  turnRate: number;
  turretRate: number;
  length: number;
  width: number;
  reverseFactor: number;
}

export interface UnitDef {
  id: string;
  /** The unit's own name, in its army's language (e.g. "Sundalo ng Maharlika"). */
  name: string;
  /** A word or two for small labels (roster cards). */
  short: string;
  /** What it is, plainly (e.g. "Rifle Squad"). */
  type: string;
  description: string;
  kind: UnitKind;
  role: UnitRole;
  models: number;
  modelHp: number;
  cost: Resources;
  pop: number;
  buildTime: number;
  speed: number;
  sight: number;
  loadout: readonly LoadoutEntry[];
  receivedAccuracy: number;
  canCapture: boolean;
  setupTime: number;
  teardownTime: number;
  abilities: readonly string[];
  armor: ArmorDef | null;
  vehicle: VehicleDef | null;
  radius: number;
  vetXp: readonly number[];
  /** Defenses this unit can construct (engineers). */
  builds: readonly string[];
  /** Can repair vehicles and structures (engineers). */
  canRepair: boolean;
  /** Weapon upgrades this squad can buy; it may own one of them. */
  upgrades: readonly string[];
  /** Structures: heals friendly soldiers within this range (hit points per second in `healRate`). */
  healRadius: number;
  healRate: number;
  /** Structures: friendly squads nearby can reinforce and upgrade here. */
  supplies: boolean;
  /** Tier building (unit id) that must be standing before this unit can be recruited. */
  requires?: string;
  /** Only for an army that chose this doctrine. */
  doctrine?: string;
  /** Hidden from the enemy while it holds still and holds fire (guerrillas). */
  camo?: boolean;
  /** Uniform seen from above, when it differs from the army's own. */
  look?: { cloth: string; helmet: string; helmetStyle: HeadGear };
}

/** What a commander call-in does. */
export type CallInEffect =
  | { kind: 'barrage'; weapon: string; shots: number; interval: number; scatter: number; delay: number }
  | { kind: 'recon'; radius: number; duration: number }
  | { kind: 'buff'; duration: number; speed?: number; accuracy?: number; received?: number; steady?: boolean; camo?: boolean; rally?: boolean }
  | { kind: 'paradrop'; unit: string }
  | { kind: 'levy'; unit: string }
  | { kind: 'mines'; count: number; radius: number };

/** A commander call-in: unlocked by command points, paid in resources, then on a cooldown. */
export interface CallInDef {
  id: string;
  name: string;
  description: string;
  /** Command points the army must have earned before it can be used. */
  cp: number;
  cost: Resources;
  cooldown: number;
  /** Aimed at a spot on the map (otherwise it acts at once). */
  targeted: boolean;
  effect: CallInEffect;
}

/** A doctrine: the army's way of fighting, with its own unit, call-ins and colours. */
/** What a soldier wears on his head. */
export type HeadGear = 'm1' | 'type90' | 'cap' | 'bandana' | 'none' | 'straw' | 'salakot' | 'pith';

/** How a commander's portrait is drawn. */
export interface PortraitLook {
  skin: string;
  hair: 'short' | 'slick' | 'peak' | 'shaved' | 'topknot';
  hairColor?: string;
  moustache?: 'thin' | 'brush' | 'handlebar';
  hat?: { kind: 'peaked' | 'field' | 'm1' | 'type90' | 'bandana' | 'straw' | 'salakot' | 'pith'; color: string; band?: string };
  /** Rayadillo: fine blue-and-white pinstripes. */
  stripes?: boolean;
  dress: 'tunic' | 'lapel' | 'camisa' | 'kimono' | 'naval' | 'jacket';
  cloth: string;
  /** Shoulder boards or collar tabs. */
  boards?: string;
  scarf?: string;
  medals?: boolean;
  sash?: boolean;
  /** A broad, heavy face. */
  heavy?: boolean;
}

/** The commander a doctrine is named after or led by. */
export interface CommanderDef {
  /** Rank or title, e.g. "Heneral", "Taishō". */
  title: string;
  name: string;
  look: PortraitLook;
}

export interface DoctrineDef {
  id: string;
  faction: string;
  name: string;
  /** Plain-language summary, e.g. "Lightning assault". */
  style: string;
  description: string;
  /** Banner colours shown on the tier buildings. */
  field: string;
  stripe: string;
  emblem: 'sun' | 'star' | 'k' | 'shield' | 'wings' | 'leaf';
  /** The special unit the doctrine adds. */
  unit: string;
  commander: CommanderDef;
  callIns: readonly CallInDef[];
}

/** A weapon upgrade: some of the squad's basic soldiers swap their rifles for something heavier. */
export interface UpgradeDef {
  id: string;
  name: string;
  hotkey: string;
  description: string;
  cost: Resources;
  /** Seconds before the new weapons arrive. */
  time: number;
  weapons: readonly string[];
  /** How many soldiers take the new weapons. */
  count: number;
  /** Tier building (unit id) that must be standing before it can be bought. */
  requires?: string;
}

/** Something engineers can build: a line of fortification tiles, or a single item such as a mine. */
export interface BuildableDef {
  id: string;
  name: string;
  hotkey: string;
  description: string;
  /** Cost per tile (lines) or per item. */
  cost: Resources;
  /** Seconds of work for a full squad, per tile or item. */
  buildTime: number;
  /** A line of tiles, a single item (mine), or a structure that becomes its own unit. */
  shape: 'line' | 'point' | 'structure';
  /** The structure's unit, for shape 'structure'. */
  unit?: string;
  /** Which page of the engineers' menu it is on: field defenses or base buildings. */
  page?: 'defense' | 'base';
  /** Tier building (unit id) that must already be standing. */
  requires?: string;
  /** Only one per army (tier buildings). */
  unique?: boolean;
  /** Structures: the tiles it takes up, wide × deep. */
  footprint?: readonly [number, number];
  /** Most an army may have standing (or going up) at once. */
  limit?: number;
  /** Terrain laid down when a tile is finished; null for mines and structures. */
  terrain: number | null;
  maxLength: number;
  /** Hit points of each finished tile (0 for mines). Only explosions wear defenses down. */
  hp: number;
  /** Multiplier on explosive damage: steel tank traps shrug off most of it. */
  blastResist: number;
}

export interface AbilityDef {
  id: string;
  name: string;
  hotkey: string;
  description: string;
  cost: Resources;
  cooldown: number;
  range: number;
  weapon: string;
  shots: number;
  interval: number;
  windup: number;
  requiresSetup: boolean;
}

export interface FactionDef {
  id: string;
  name: string;
  longName: string;
  description: string;
  hq: string;
  roster: readonly string[];
  starting: readonly string[];
}

export type MapFeature =
  | { kind: 'rect'; terrain: number; x: number; y: number; w: number; h: number }
  | { kind: 'line'; terrain: number; points: readonly (readonly [number, number])[]; width: number }
  | { kind: 'circle'; terrain: number; x: number; y: number; r: number }
  | { kind: 'scatter'; terrain: number; x: number; y: number; w: number; h: number; count: number; seed: number }
  /** A whole tile grid, one run-length encoded string per row (see gridCodec.ts). */
  | { kind: 'grid'; rows: readonly string[] };

export interface MapPointDef {
  x: number;
  y: number;
  kind: PointKind;
  name: string;
}

/** Map coordinates are in tiles (continuous); world = tiles * TILE. */
export interface MapDef {
  id: string;
  name: string;
  description: string;
  width: number;
  height: number;
  features: readonly MapFeature[];
  bases: readonly [{ x: number; y: number }, { x: number; y: number }];
  points: readonly MapPointDef[];
}

/** skirmish = open battle; defense = survive enemy waves; offensive = capture sectors in order. */
export type GameMode = 'skirmish' | 'defense' | 'offensive';

/**
 * How an open battle is won. points = victory-point tickets; annihilation =
 * destroy every enemy unit and the enemy HQ; none = no automatic victory.
 */
export type WinCondition = 'points' | 'annihilation' | 'none';

/** A unit placed on the map at the start of a scenario (tile coordinates). */
export interface PlacedUnit {
  unitId: string;
  x: number;
  y: number;
  /** Facing in degrees (0 = east, 90 = south). */
  facing?: number;
  /** Crew weapons start already set up. */
  deployed?: boolean;
}

export interface WaveDef {
  units: readonly string[];
  /** Seconds after the previous wave (or after the prep phase for the first wave). */
  delay: number;
}

export interface DefenseRules {
  /** Point indices the player must not lose. */
  hold: readonly number[];
  prepTime: number;
  waves: readonly WaveDef[];
  /** Where waves enter the map (tile coordinates). */
  spawns: readonly { x: number; y: number }[];
}

export interface OffensiveRules {
  /** Point indices to capture, in order. */
  sectors: readonly number[];
  timeLimit: number;
  bonusTime: number;
  /** Seconds between enemy counterattacks (0 = none). */
  counterattackEvery: number;
  counterattack: readonly string[];
}

export interface ScenarioDef {
  id: string;
  name: string;
  tagline: string;
  date: string;
  location: string;
  /** Briefing paragraphs shown before the mission. */
  briefing: readonly string[];
  map: string;
  mode: GameMode;
  /** Win condition for open battles (mode 'skirmish'); defaults to points. */
  win?: WinCondition;
  /** [player faction, enemy faction]. */
  factions: readonly [string, string];
  startResources?: Resources;
  /** Replaces the faction's default starting squads when set. */
  playerUnits?: readonly PlacedUnit[];
  enemyUnits?: readonly PlacedUnit[];
  /** Initial point owners by index (unlisted points start neutral). */
  owners?: Readonly<Record<number, Owner>>;
  defense?: DefenseRules;
  offensive?: OffensiveRules;
  /** Campaign: story scenes shown before the briefing (skippable). */
  story?: readonly StoryPage[];
  /** Campaign: story scenes shown after the mission is won. */
  aftermath?: readonly StoryPage[];
}

/** One scene of a campaign story: a line of narration or dialogue. */
export interface StoryPage {
  /** Who is speaking; narration when unset. */
  speaker?: string;
  text: string;
  /** Optional voice-over file in audio/story/ (e.g. "m1-01.ogg"). */
  voice?: string;
}

/** A campaign mission: one story told over two playable parts. */
export interface CampaignMission {
  id: string;
  chapter: string;
  name: string;
  date: string;
  location: string;
  tagline: string;
  parts: readonly ScenarioDef[];
}
