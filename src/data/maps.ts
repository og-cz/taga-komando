import { LUZON_MAPS } from './luzonMaps';
import { T } from './terrain';
import type { MapDef, MapFeature, MapPointDef } from './types';

/**
 * Maps are authored for one half and point-reflected through the centre,
 * which guarantees both starting positions are exactly equal.
 */
function mirrorFeature(f: MapFeature, W: number, H: number): MapFeature {
  switch (f.kind) {
    case 'rect':
    case 'scatter':
      return { ...f, x: W - f.x - f.w, y: H - f.y - f.h, ...(f.kind === 'scatter' ? { seed: f.seed + 1000 } : {}) };
    case 'circle':
      return { ...f, x: W - f.x, y: H - f.y };
    case 'line':
      return { ...f, points: f.points.map(([x, y]) => [W - x, H - y] as const) };
    case 'grid':
      return f;
  }
}

const mirrorPoint = (p: MapPointDef, W: number, H: number, name: string): MapPointDef => ({
  ...p,
  x: W - p.x,
  y: H - p.y,
  name,
});

/** Each layer is emitted together with its mirror so draw order stays consistent. */
function layered(W: number, H: number, layers: MapFeature[][], shared: MapFeature[] = []): MapFeature[] {
  const out: MapFeature[] = [];
  for (const layer of layers) {
    out.push(...layer, ...layer.map((f) => mirrorFeature(f, W, H)));
  }
  out.push(...shared);
  return out;
}

export const rect = (terrain: number, x: number, y: number, w: number, h: number): MapFeature => ({ kind: 'rect', terrain, x, y, w, h });
export const circle = (terrain: number, x: number, y: number, r: number): MapFeature => ({ kind: 'circle', terrain, x, y, r });
export const line = (terrain: number, width: number, ...points: [number, number][]): MapFeature => ({ kind: 'line', terrain, width, points });
export const scatter = (terrain: number, x: number, y: number, w: number, h: number, count: number, seed: number): MapFeature => ({
  kind: 'scatter', terrain, x, y, w, h, count, seed,
});

// ─── Bataan Crossroads ─────────────────────────────────────────────
const BW = 100;
const BH = 70;

const bataanPoints: MapPointDef[] = [
  { x: 50, y: 35, kind: 'victory', name: 'Crossroads' },
  { x: 50, y: 12, kind: 'victory', name: 'Hill 92' },
  { x: 28, y: 18, kind: 'munitions', name: 'Supply Barn' },
  { x: 72, y: 20, kind: 'fuel', name: 'Motor Depot' },
];

const BATAAN: MapDef = {
  id: 'bataan',
  name: 'Bataan Crossroads',
  description: 'A barrio crossroads between rice paddies and jungle. Three victory points; the centre is the key.',
  width: BW,
  height: BH,
  bases: [
    { x: 8, y: 35 },
    { x: 92, y: 35 },
  ],
  points: [
    bataanPoints[0],
    bataanPoints[1],
    mirrorPoint(bataanPoints[1], BW, BH, 'Old Church'),
    bataanPoints[2],
    mirrorPoint(bataanPoints[2], BW, BH, 'Rice Mill'),
    bataanPoints[3],
    mirrorPoint(bataanPoints[3], BW, BH, 'Sugar Central'),
  ],
  features: layered(
    BW,
    BH,
    [
      // ground
      [
        rect(T.Paddy, 14, 9, 11, 7),
        rect(T.Paddy, 57, 22, 9, 6),
        circle(T.Jungle, 4, 4, 7),
        circle(T.Jungle, 22, 3, 4),
        circle(T.Jungle, 64, 4, 5),
        circle(T.Jungle, 92, 9, 7),
        circle(T.Jungle, 36, 27, 3),
        rect(T.Jungle, 80, 23, 6, 5),
        line(T.Water, 2, [38, 0], [40, 8], [42, 15], [39, 24], [34, 31]),
      ],
      // battle damage
      [scatter(T.Crater, 44, 5, 12, 10, 10, 1), scatter(T.Crater, 30, 26, 12, 6, 5, 2)],
      // hedgerows
      [
        line(T.Hedge, 1, [22, 14], [33, 14]),
        line(T.Hedge, 1, [22, 22], [33, 22]),
        line(T.Hedge, 1, [36, 33], [44, 33]),
        line(T.Hedge, 1, [56, 30], [64, 30]),
        line(T.Hedge, 1, [60, 7], [60, 16]),
        line(T.Hedge, 1, [14, 28], [24, 28]),
        line(T.Hedge, 1, [67, 27], [77, 27]),
      ],
      // sandbags
      [
        line(T.Sandbag, 1, [45, 9], [45, 12]),
        line(T.Sandbag, 1, [55, 12], [55, 15]),
        line(T.Sandbag, 1, [46, 31], [48.5, 31]),
        line(T.Sandbag, 1, [51.5, 31], [54, 31]),
        line(T.Sandbag, 1, [26, 19.5], [30, 19.5]),
        line(T.Sandbag, 1, [69, 23], [72, 23]),
      ],
      // walls
      [line(T.Wall, 1, [70, 14], [76, 14], [76, 18]), line(T.Wall, 1, [41, 26], [41, 30])],
      // buildings
      [
        rect(T.Building, 43, 27, 3, 3),
        rect(T.Building, 54, 26, 4, 3),
        rect(T.Building, 73, 16, 3, 3),
        rect(T.Building, 23, 16, 2, 3),
        rect(T.Building, 57, 9, 2, 3),
        rect(T.Building, 16, 20, 2, 2),
        rect(T.Building, 30, 8, 2, 2),
        rect(T.Building, 66, 31, 3, 2),
      ],
      // roads
      [
        line(T.Road, 1, [10, 34], [22, 26], [34, 19], [46, 13]),
        line(T.Road, 1, [54, 13], [66, 19], [78, 26], [90, 34]),
      ],
    ],
    [rect(T.Road, 0, 34, 100, 2), rect(T.Road, 49, 0, 2, 70)],
  ),
};

// ─── Barrio San Roque ──────────────────────────────────────────────
const SW = 90;
const SH = 76;

const roquePoints: MapPointDef[] = [
  { x: 45, y: 38, kind: 'victory', name: 'Stone Bridge' },
  { x: 18, y: 24, kind: 'victory', name: 'San Roque Church' },
  { x: 70, y: 22, kind: 'munitions', name: 'Ammo Dump' },
  { x: 56, y: 25, kind: 'fuel', name: 'Fuel Cache' },
];

const ROQUE: MapDef = {
  id: 'san-roque',
  name: 'Barrio San Roque',
  description: 'A river town split by the Pampanga. Hold the stone bridge and your own church to bleed the enemy dry.',
  width: SW,
  height: SH,
  bases: [
    { x: 45, y: 7 },
    { x: 45, y: 69 },
  ],
  points: [
    roquePoints[0],
    roquePoints[1],
    mirrorPoint(roquePoints[1], SW, SH, 'Municipal Hall'),
    roquePoints[2],
    mirrorPoint(roquePoints[2], SW, SH, 'Rail Yard'),
    roquePoints[3],
    mirrorPoint(roquePoints[3], SW, SH, 'Pumping Station'),
  ],
  features: layered(
    SW,
    SH,
    [
      [
        // The river is itself point-symmetric, so its mirror is a harmless duplicate.
        line(T.Water, 3, [0, 40], [30, 36], [60, 40], [90, 36]),
        rect(T.Paddy, 50, 8, 14, 9),
        rect(T.Paddy, 22, 29, 10, 5),
        circle(T.Jungle, 4, 12, 7),
        circle(T.Jungle, 84, 22, 6),
        circle(T.Jungle, 36, 27, 3),
        circle(T.Jungle, 62, 31, 3),
      ],
      [scatter(T.Crater, 36, 30, 16, 5, 6, 3)],
      [
        line(T.Hedge, 1, [26, 10], [26, 16]),
        line(T.Hedge, 1, [38, 24], [42, 24]),
        line(T.Hedge, 1, [48, 29], [54, 30]),
        line(T.Hedge, 1, [76, 12], [84, 12]),
        line(T.Hedge, 1, [65, 18], [65, 26]),
      ],
      [
        line(T.Sandbag, 1, [40, 34], [43, 34]),
        line(T.Sandbag, 1, [47, 34], [50, 34]),
        line(T.Sandbag, 1, [67, 25], [73, 25]),
        line(T.Sandbag, 1, [53, 22], [56, 22]),
      ],
      [
        line(T.Wall, 1, [12, 19], [24, 19], [24, 22]),
        line(T.Wall, 1, [12, 19], [12, 29]),
        line(T.Wall, 1, [30, 31], [34, 31]),
      ],
      [
        rect(T.Building, 21, 26, 3, 3),
        rect(T.Building, 30, 12, 3, 2),
        rect(T.Building, 36, 17, 2, 3),
        rect(T.Building, 51, 18, 3, 2),
        rect(T.Building, 60, 14, 2, 2),
        rect(T.Building, 59, 22, 3, 2),
        rect(T.Building, 73, 18, 2, 3),
      ],
      [rect(T.Road, 14, 0, 2, 76), line(T.Road, 1, [16, 21], [30, 17], [44, 14]), line(T.Road, 1, [46, 14], [60, 17], [74, 21])],
    ],
    [rect(T.Road, 44, 0, 2, 76)],
  ),
};

/**
 * The graphics benchmark (development only, not in any menu): a small barrio
 * crossroads with two huts, a paddy, palms and jungle, two sandbag positions
 * and room for one squad, always shot from the same camera (see main.ts, ?bench=1).
 */
const BENCH: MapDef = {
  id: 'benchmark',
  name: 'Benchmark Crossroads',
  description: 'A fixed scene for judging the battlefield graphics.',
  width: 40,
  height: 30,
  bases: [
    { x: 4, y: 25 },
    { x: 36, y: 4 },
  ],
  points: [{ x: 20, y: 14, kind: 'victory', name: 'Crossroads' }],
  features: [
    circle(T.Jungle, 6, 4, 4),
    circle(T.Jungle, 33, 26, 4),
    rect(T.Paddy, 25, 18, 10, 7),
    line(T.Hedge, 1, [7, 10], [15, 10]),
    line(T.Hedge, 1, [27, 10], [33, 11]),
    line(T.Road, 2, [0, 15], [10, 15], [19, 14], [29, 13], [40, 12]),
    line(T.Road, 2, [19, 0], [20, 8], [20, 14], [22, 22], [23, 30]),
    rect(T.Building, 23, 7, 3, 2),
    rect(T.Building, 12, 17, 3, 2),
    line(T.Sandbag, 1, [16, 11], [18, 11]),
    line(T.Sandbag, 1, [23, 16], [26, 16]),
  ],
};

export const MAPS: Readonly<Record<string, MapDef>> = {
  [BATAAN.id]: BATAAN,
  [ROQUE.id]: ROQUE,
  [BENCH.id]: BENCH,
  ...Object.fromEntries(LUZON_MAPS.map((m) => [m.id, m])),
};
export const MAP_IDS = [BATAAN.id, ROQUE.id, ...LUZON_MAPS.map((m) => m.id)];
