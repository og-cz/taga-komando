import * as THREE from 'three';

/**
 * Photo-scanned surfaces and cut-outs for the 3D battlefield, from Poly Haven (CC0; see
 * licenses/PolyHaven-CC0.txt), loaded once when the game starts. Each surface
 * is a colour map with its roughness packed into alpha, and a normal map.
 * Textures handed out before the pictures arrive start blank and fill in as
 * soon as they load.
 */
export const SURFACES = ['leafy_grass', 'red_dirt_mud_01', 'brown_mud_02', 'forrest_ground_01', 'thatch_roof_angled', 'bamboo_wall_02'] as const;
export type Surface = (typeof SURFACES)[number];

interface Pixels {
  /** Colour in RGB, roughness in A. */
  color: Uint8Array;
  normal: Uint8Array;
  size: number;
}

const pixels = new Map<Surface, Pixels>();
const textures = new Map<Surface, { color: THREE.DataTexture; normal: THREE.DataTexture }>();
let loading: Promise<void> | null = null;

function image(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error(`could not load ${src}`));
    img.src = src;
  });
}

function read(img: HTMLImageElement): Uint8ClampedArray {
  const c = document.createElement('canvas');
  c.width = img.width;
  c.height = img.height;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  x.drawImage(img, 0, 0);
  return x.getImageData(0, 0, c.width, c.height).data;
}

async function loadOne(name: Surface): Promise<void> {
  const dir = 'assets/textures/';
  const [diff, rough, nor] = await Promise.all(['diff', 'rough', 'nor_gl'].map((m) => image(`${dir}${name}_${m}_1k.jpg`)));
  const d = read(diff);
  const r = read(rough);
  const color = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i += 4) {
    color[i] = d[i];
    color[i + 1] = d[i + 1];
    color[i + 2] = d[i + 2];
    color[i + 3] = r[i];
  }
  const p: Pixels = { color, normal: new Uint8Array(read(nor)), size: diff.width };
  pixels.set(name, p);
  const t = textures.get(name);
  if (t) fill(t, p);
}

/**
 * Cut-out sheets (CC0, Poly Haven): photo-scanned leaves, fern fronds and
 * grass clumps on black, with their transparency in a separate mask. Loaded
 * as colour with the mask in alpha.
 */
export const CUTOUTS = ['island_tree_02_leaves', 'fern_02', 'grass_medium_01'] as const;
export type Cutout = (typeof CUTOUTS)[number];
const cutPixels = new Map<Cutout, { data: Uint8Array; size: number; img: HTMLCanvasElement }>();
const cutTextures = new Map<Cutout, THREE.DataTexture>();

async function loadCutout(name: Cutout): Promise<void> {
  const dir = 'assets/textures/';
  const [diff, alpha] = await Promise.all(['diff', 'alpha'].map((m) => image(`${dir}${name}_${m}_1k.jpg`)));
  const d = read(diff);
  const a = read(alpha);
  const data = new Uint8Array(d.length);
  for (let i = 0; i < d.length; i += 4) {
    data[i] = d[i];
    data[i + 1] = d[i + 1];
    data[i + 2] = d[i + 2];
    data[i + 3] = a[i];
  }
  bleed(data);
  // A canvas copy too, for composing leaf sprays.
  const img = document.createElement('canvas');
  img.width = diff.width;
  img.height = diff.height;
  img.getContext('2d')!.putImageData(new ImageData(new Uint8ClampedArray(data), diff.width, diff.height), 0, 0);
  cutPixels.set(name, { data, size: diff.width, img });
  const t = cutTextures.get(name);
  if (t) fillCut(t, name);
  if (name === 'island_tree_02_leaves' && spray) paintSpray(spray);
}

/**
 * Give the see-through parts of a cut-out the average colour of its solid
 * parts. They are black on the scans, and as the texture shrinks with
 * distance that black would bleed into every leaf and blade.
 */
function bleed(data: Uint8Array): void {
  let r = 0;
  let g = 0;
  let b = 0;
  let n = 0;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] < 128) continue;
    r += data[i];
    g += data[i + 1];
    b += data[i + 2];
    n++;
  }
  if (!n) return;
  for (let i = 0; i < data.length; i += 4) {
    if (data[i + 3] >= 128) continue;
    data[i] = r / n;
    data[i + 1] = g / n;
    data[i + 2] = b / n;
  }
}

function fillCut(t: THREE.DataTexture, name: Cutout): void {
  const p = cutPixels.get(name)!;
  t.dispose();
  t.image = { data: p.data, width: p.size, height: p.size };
  t.needsUpdate = true;
}

/** A cut-out sheet as a texture (colour, transparency in alpha). Rows run top to bottom: v = y / size. */
export function cutout(name: Cutout): THREE.DataTexture {
  let t = cutTextures.get(name);
  if (!t) {
    t = blank(true, [0, 0, 0, 0]);
    t.anisotropy = 4;
    cutTextures.set(name, t);
    if (cutPixels.has(name)) fillCut(t, name);
    else void preloadSurfaces();
  }
  return t;
}

/** Where each broad leaf lies on the leaf sheet (pixels of the 1024 sheet; stalk at the bottom). */
const LEAVES: readonly [number, number, number, number][] = [
  [15, 20, 150, 410],
  [170, 20, 345, 400],
  [370, 35, 495, 370],
  [530, 50, 665, 370],
  [710, 20, 835, 420],
  [18, 645, 186, 1000],
  [222, 590, 362, 1010],
  [432, 620, 575, 1010],
];

let spray: THREE.DataTexture | null = null;
const SPRAY = 512;

/** Scanned leaves laid out as a spray, stalks to the middle, for bush and crown cards. */
function paintSpray(t: THREE.DataTexture): void {
  const sheet = cutPixels.get('island_tree_02_leaves');
  if (!sheet) return;
  const c = document.createElement('canvas');
  c.width = c.height = SPRAY;
  const x = c.getContext('2d', { willReadFrequently: true })!;
  const S = SPRAY;
  const hash = (i: number, k: number) => {
    const v = Math.sin(i * 127.1 + k * 311.7) * 43758.5453;
    return v - Math.floor(v);
  };
  for (let i = 0; i < 46; i++) {
    const [x0, y0, x1, y1] = LEAVES[Math.floor(hash(i, 1) * LEAVES.length)];
    const a = hash(i, 2) * Math.PI * 2;
    const r = Math.sqrt(i / 46) * S * 0.2;
    const len = S * (0.2 + hash(i, 3) * 0.1);
    const wid = (len * (x1 - x0)) / (y1 - y0);
    x.save();
    x.translate(S / 2 + Math.cos(a) * r, S / 2 + Math.sin(a) * r);
    // Leaves point outwards, stalk to the middle.
    x.rotate(a + Math.PI / 2 + (hash(i, 4) - 0.5) * 0.8);
    // Inner leaves are shaded by the ones over them.
    x.filter = `brightness(${(0.55 + (i / 46) * 0.5).toFixed(2)})`;
    x.drawImage(sheet.img, x0, y0, x1 - x0, y1 - y0, -wid / 2, -len, wid, len);
    x.restore();
  }
  const data = new Uint8Array(x.getImageData(0, 0, S, S).data);
  bleed(data);
  t.dispose();
  t.image = { data, width: S, height: S };
  t.needsUpdate = true;
}

/** The photo leaf spray (filled in once the leaf sheet is loaded). */
export function leafSpray(): THREE.DataTexture {
  if (!spray) {
    spray = blank(true, [0, 0, 0, 0]);
    spray.anisotropy = 4;
    paintSpray(spray);
    if (!cutPixels.has('island_tree_02_leaves')) void preloadSurfaces();
  }
  return spray;
}

/** Start loading every surface and cut-out sheet (once); resolves when all are in. */
export function preloadSurfaces(): Promise<void> {
  loading ??= Promise.all([
    ...SURFACES.map((s) => loadOne(s).catch((err) => console.warn(err))),
    ...CUTOUTS.map((s) => loadCutout(s).catch((err) => console.warn(err))),
  ]).then(() => undefined);
  return loading;
}

function fill(t: { color: THREE.DataTexture; normal: THREE.DataTexture }, p: Pixels): void {
  // The blank stand-in may already be on the GPU at 1×1: free it so the full size is allocated afresh.
  t.color.dispose();
  t.normal.dispose();
  t.color.image = { data: p.color, width: p.size, height: p.size };
  t.normal.image = { data: p.normal, width: p.size, height: p.size };
  t.color.needsUpdate = true;
  t.normal.needsUpdate = true;
}

function blank(srgb: boolean, rgba: [number, number, number, number]): THREE.DataTexture {
  const t = new THREE.DataTexture(new Uint8Array(rgba), 1, 1, THREE.RGBAFormat);
  t.colorSpace = srgb ? THREE.SRGBColorSpace : THREE.NoColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.magFilter = THREE.LinearFilter;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.generateMipmaps = true;
  t.anisotropy = 8;
  return t;
}

/** A surface's colour (roughness in alpha) and normal map, repeating. */
export function surface(name: Surface): { color: THREE.DataTexture; normal: THREE.DataTexture } {
  let t = textures.get(name);
  if (!t) {
    t = { color: blank(true, [120, 110, 80, 230]), normal: blank(false, [128, 128, 255, 255]) };
    textures.set(name, t);
    const p = pixels.get(name);
    if (p) fill(t, p);
    else void preloadSurfaces();
  }
  return t;
}

/** Free the GPU copies (when the battle ends); the pictures stay loaded for the next one. */
export function disposeSurfaces(): void {
  for (const t of textures.values()) {
    t.color.dispose();
    t.normal.dispose();
  }
  textures.clear();
  for (const t of cutTextures.values()) t.dispose();
  cutTextures.clear();
  spray?.dispose();
  spray = null;
}
