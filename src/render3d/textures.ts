import * as THREE from 'three';
import { hash2 } from '../core/rng';

/**
 * Original artwork for the 3D battlefield, painted procedurally at load time:
 * walls, stone, burlap, bark, foliage and the fire and smoke sprites. Nothing
 * is downloaded; everything is drawn here and cached.
 */

const cache = new Map<string, THREE.Texture>();

function canvas(w: number, h: number): [HTMLCanvasElement, CanvasRenderingContext2D] {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')!];
}

function finish(key: string, c: HTMLCanvasElement, opts: { repeat?: boolean; srgb?: boolean } = {}): THREE.Texture {
  const t = new THREE.CanvasTexture(c);
  if (opts.srgb !== false) t.colorSpace = THREE.SRGBColorSpace;
  if (opts.repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.anisotropy = 4;
  cache.set(key, t);
  return t;
}

function noiseSpeckle(x: CanvasRenderingContext2D, w: number, h: number, n: number, dark: string, light: string, seed: number): void {
  for (let i = 0; i < n; i++) {
    x.fillStyle = hash2(i, seed, 3) < 0.5 ? dark : light;
    x.fillRect(hash2(i, seed, 1) * w, hash2(i, seed, 2) * h, 1 + hash2(i, seed, 4) * 2, 1 + hash2(i, seed, 5) * 2);
  }
}

/**
 * Wall facades in a 3 × 3 atlas: rows are lime plaster, woven bamboo and
 * corrugated iron; columns are a plain bay, a bay with a shuttered window and
 * a bay with a doorway. Each cell is one tile of wall.
 */
export function wallAtlas(): THREE.Texture {
  const hit = cache.get('walls');
  if (hit) return hit;
  const CW = 128;
  const CH = 48;
  const [c, x] = canvas(CW * 3, CH * 3);
  const bases = ['#c9b994', '#9c7a4c', '#7d7468'];
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const ox = col * CW;
      const oy = row * CH;
      x.save();
      x.beginPath();
      x.rect(ox, oy, CW, CH);
      x.clip();
      x.fillStyle = bases[row];
      x.fillRect(ox, oy, CW, CH);
      if (row === 0) {
        // Lime plaster with damp stains and a few patches fallen away to brick.
        for (let i = 0; i < 9; i++) {
          const g = x.createRadialGradient(ox + hash2(i, col, 7) * CW, oy + hash2(i, col, 8) * CH, 1, ox + hash2(i, col, 7) * CW, oy + hash2(i, col, 8) * CH, 10 + hash2(i, col, 9) * 16);
          g.addColorStop(0, 'rgba(110,90,60,0.25)');
          g.addColorStop(1, 'rgba(110,90,60,0)');
          x.fillStyle = g;
          x.fillRect(ox, oy, CW, CH);
        }
        x.fillStyle = 'rgba(150,80,50,0.55)';
        if (col === 0) x.fillRect(ox + 80, oy + 10, 14, 8);
      } else if (row === 1) {
        // Woven bamboo slats on a timber frame.
        for (let i = 0; i < CW; i += 4) {
          x.fillStyle = i % 8 === 0 ? 'rgba(60,40,20,0.35)' : 'rgba(210,180,120,0.18)';
          x.fillRect(ox + i, oy, 2, CH);
        }
        x.fillStyle = '#5a3d22';
        x.fillRect(ox, oy, 4, CH);
        x.fillRect(ox + CW - 4, oy, 4, CH);
        x.fillRect(ox, oy + 4, CW, 3);
      } else {
        // Corrugated sheets, rusting at the seams and the bottom.
        for (let i = 0; i < CW; i += 3) {
          x.fillStyle = i % 6 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.12)';
          x.fillRect(ox + i, oy, 2, CH);
        }
        const g = x.createLinearGradient(0, oy + CH * 0.5, 0, oy + CH);
        g.addColorStop(0, 'rgba(120,64,30,0)');
        g.addColorStop(1, 'rgba(120,64,30,0.7)');
        x.fillStyle = g;
        x.fillRect(ox, oy, CW, CH);
        x.fillStyle = 'rgba(120,64,30,0.6)';
        x.fillRect(ox + 42, oy, 3, CH);
        x.fillRect(ox + 86, oy, 3, CH);
      }
      noiseSpeckle(x, CW, CH, 260, 'rgba(0,0,0,0.12)', 'rgba(255,255,240,0.08)', row * 3 + col);
      x.translate(ox, oy);
      if (col === 1) {
        // A window with open shutters.
        x.fillStyle = '#4a3420';
        x.fillRect(38, 10, 10, 20);
        x.fillRect(80, 10, 10, 20);
        x.fillStyle = '#17120c';
        x.fillRect(48, 10, 32, 20);
        x.strokeStyle = '#6a4e30';
        x.lineWidth = 2;
        x.strokeRect(48, 10, 32, 20);
        x.beginPath();
        x.moveTo(64, 10);
        x.lineTo(64, 30);
        x.stroke();
      } else if (col === 2) {
        // A doorway, dark inside.
        x.fillStyle = '#120d08';
        x.fillRect(50, 10, 28, CH - 10);
        x.strokeStyle = '#5a4026';
        x.lineWidth = 3;
        x.strokeRect(50, 10, 28, CH - 10);
      }
      // Grime and a stone footing along the bottom.
      const foot = x.createLinearGradient(0, CH - 12, 0, CH);
      foot.addColorStop(0, 'rgba(40,30,18,0)');
      foot.addColorStop(1, 'rgba(40,30,18,0.65)');
      x.fillStyle = foot;
      x.fillRect(0, 0, CW, CH);
      x.restore();
    }
  }
  return finish('walls', c);
}

/** Rough-dressed stone courses for walls and ramparts. */
export function stoneTexture(): THREE.Texture {
  const hit = cache.get('stone');
  if (hit) return hit;
  const [c, x] = canvas(128, 128);
  x.fillStyle = '#8f897c';
  x.fillRect(0, 0, 128, 128);
  for (let row = 0; row < 8; row++) {
    const off = row % 2 ? 16 : 0;
    for (let col = -1; col < 5; col++) {
      const bx = col * 32 + off;
      const shade = 0.82 + hash2(row, col, 2) * 0.3;
      x.fillStyle = `rgb(${Math.round(150 * shade)},${Math.round(142 * shade)},${Math.round(126 * shade)})`;
      x.fillRect(bx + 1, row * 16 + 1, 30, 14);
    }
  }
  noiseSpeckle(x, 128, 128, 900, 'rgba(0,0,0,0.15)', 'rgba(255,255,255,0.08)', 11);
  return finish('stone', c, { repeat: true });
}

/** Weathered planks for crates and fences: grey-brown boards with dark seams and grain. */
export function plankTexture(): THREE.Texture {
  const hit = cache.get('planks');
  if (hit) return hit;
  const [c, x] = canvas(64, 64);
  for (let b = 0; b < 4; b++) {
    const shade = 0.8 + hash2(b, 1, 91) * 0.35;
    x.fillStyle = `rgb(${Math.round(128 * shade)},${Math.round(108 * shade)},${Math.round(82 * shade)})`;
    x.fillRect(0, b * 16, 64, 16);
    x.strokeStyle = 'rgba(50,38,26,0.35)';
    x.lineWidth = 1;
    for (let g = 0; g < 4; g++) {
      const y = b * 16 + 3 + g * 3.5 + hash2(b, g, 92) * 2;
      x.beginPath();
      x.moveTo(0, y);
      x.bezierCurveTo(20, y + hash2(b, g, 93) * 2 - 1, 44, y - hash2(b, g, 94) * 2 + 1, 64, y);
      x.stroke();
    }
    x.fillStyle = 'rgba(30,22,14,0.7)';
    x.fillRect(0, b * 16, 64, 1.5);
  }
  noiseSpeckle(x, 64, 64, 260, 'rgba(0,0,0,0.15)', 'rgba(255,250,235,0.1)', 95);
  return finish('planks', c, { repeat: true });
}

/**
 * The straw fringe of a nipa roof's eaves: strands of weathered thatch hanging
 * down, bunched, their ends ragged, on a transparent ground. Repeats along u.
 */
export function thatchFringeTexture(): THREE.Texture {
  const hit = cache.get('thatch-fringe');
  if (hit) return hit;
  const [c, x] = canvas(256, 128);
  x.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const px = hash2(i, 1, 121) * 256;
    const len = 60 + hash2(i, 2, 121) * 66 - (hash2(Math.floor(px / 18), 3, 121) < 0.35 ? 30 : 0);
    const lean = (hash2(i, 4, 121) - 0.5) * 14;
    const v = 0.55 + hash2(i, 5, 121) * 0.5;
    const grey = hash2(i, 6, 121) < 0.4;
    x.strokeStyle = grey
      ? `rgb(${Math.round(128 * v)},${Math.round(122 * v)},${Math.round(108 * v)})`
      : `rgb(${Math.round(150 * v)},${Math.round(128 * v)},${Math.round(88 * v)})`;
    x.lineWidth = 1.2 + hash2(i, 7, 121) * 1.6;
    for (const ox of [0, 256, -256]) {
      x.beginPath();
      x.moveTo(px + ox, 0);
      x.quadraticCurveTo(px + ox + lean * 0.3, len * 0.5, px + ox + lean, len);
      x.stroke();
    }
  }
  // Shade towards the top, where the eave throws it into its own shadow.
  x.globalCompositeOperation = 'source-atop';
  const g = x.createLinearGradient(0, 0, 0, 128);
  g.addColorStop(0, 'rgba(20,16,10,0.55)');
  g.addColorStop(0.5, 'rgba(20,16,10,0.1)');
  g.addColorStop(1, 'rgba(20,16,10,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 256, 128);
  return finish('thatch-fringe', c, { repeat: true });
}

/** Burlap for sandbags. */
export function burlapTexture(): THREE.Texture {
  const hit = cache.get('burlap');
  if (hit) return hit;
  const [c, x] = canvas(64, 64);
  x.fillStyle = '#b39c6c';
  x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 64; i += 2) {
    x.fillStyle = 'rgba(80,60,30,0.18)';
    x.fillRect(i, 0, 1, 64);
    x.fillRect(0, i, 64, 1);
  }
  noiseSpeckle(x, 64, 64, 300, 'rgba(60,40,20,0.2)', 'rgba(255,240,200,0.12)', 21);
  return finish('burlap', c, { repeat: true });
}

/** Ringed palm bark. */
export function barkTexture(): THREE.Texture {
  const hit = cache.get('bark');
  if (hit) return hit;
  const [c, x] = canvas(32, 128);
  x.fillStyle = '#6b5a42';
  x.fillRect(0, 0, 32, 128);
  for (let y = 0; y < 128; y += 6) {
    x.fillStyle = 'rgba(30,22,12,0.45)';
    x.fillRect(0, y, 32, 2);
    x.fillStyle = 'rgba(180,160,120,0.15)';
    x.fillRect(0, y + 2, 32, 1);
  }
  noiseSpeckle(x, 32, 128, 200, 'rgba(0,0,0,0.2)', 'rgba(255,255,255,0.08)', 31);
  return finish('bark', c, { repeat: true });
}

/** One palm frond on a transparent ground: a midrib with leaflets either side. */
export function frondTexture(): THREE.Texture {
  const hit = cache.get('frond');
  if (hit) return hit;
  const [c, x] = canvas(512, 128);
  x.lineCap = 'round';
  // Narrow, pointed leaflets in pairs along the midrib, longest in the middle, some torn or
  // missing, sun-yellowed and browned towards the tips.
  for (let i = 0; i < 88; i++) {
    const t = i / 88;
    const px = 14 + t * 486;
    for (const s of [-1, 1]) {
      if (hash2(i, s, 42) < 0.08) continue;
      const len = (54 * Math.sin(Math.PI * Math.min(1, t * 1.12)) + 8) * (0.8 + hash2(i, s, 43) * 0.3);
      const shade = 0.7 + hash2(i, s, 41) * 0.4;
      const dry = Math.max(0, t - 0.7) * 2 * hash2(i, s, 44);
      const r = Math.round((62 + dry * 70) * shade);
      const g = Math.round((108 - dry * 10) * shade);
      const b = Math.round((40 + dry * 10) * shade);
      x.fillStyle = `rgb(${r},${g},${b})`;
      x.beginPath();
      x.moveTo(px, 64);
      x.quadraticCurveTo(px + 10, 64 + s * len * 0.45 - s * 3, px + 22, 64 + s * len);
      x.quadraticCurveTo(px + 7, 64 + s * len * 0.5 + s * 3, px - 2, 64 + s * 2);
      x.fill();
    }
  }
  x.strokeStyle = '#8f8a50';
  x.lineWidth = 5;
  x.beginPath();
  x.moveTo(6, 64);
  x.lineTo(506, 64);
  x.stroke();
  return finish('frond', c);
}

/** A broad banana leaf, slightly torn. */
export function bananaLeafTexture(): THREE.Texture {
  const hit = cache.get('banana');
  if (hit) return hit;
  const [c, x] = canvas(256, 96);
  x.fillStyle = '#6f9a3c';
  x.beginPath();
  x.moveTo(4, 48);
  x.quadraticCurveTo(128, -6, 252, 46);
  x.quadraticCurveTo(128, 102, 4, 48);
  x.fill();
  x.strokeStyle = 'rgba(30,50,15,0.4)';
  x.lineWidth = 1;
  for (let i = 10; i < 250; i += 7) {
    x.beginPath();
    x.moveTo(i, 48);
    x.lineTo(i + 10, 6 + Math.abs(i - 128) * 0.2);
    x.moveTo(i, 48);
    x.lineTo(i + 10, 90 - Math.abs(i - 128) * 0.2);
    x.stroke();
  }
  // Tears where the wind has split it.
  x.globalCompositeOperation = 'destination-out';
  for (let i = 0; i < 6; i++) {
    const tx = 40 + hash2(i, 2, 51) * 180;
    x.fillRect(tx, hash2(i, 3, 51) < 0.5 ? 0 : 60, 2, 36);
  }
  x.globalCompositeOperation = 'source-over';
  x.strokeStyle = '#c8d48a';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(4, 48);
  x.lineTo(252, 47);
  x.stroke();
  return finish('banana', c);
}

/** Soft, lumpy smoke puff (white, tinted per particle). */
export function smokeSprite(): THREE.Texture {
  const hit = cache.get('smoke');
  if (hit) return hit;
  const [c, x] = canvas(128, 128);
  for (let i = 0; i < 14; i++) {
    const a = hash2(i, 1, 81) * Math.PI * 2;
    const d = hash2(i, 2, 81) * 26;
    const r = 22 + hash2(i, 3, 81) * 18;
    const cx = 64 + Math.cos(a) * d;
    const cy = 64 + Math.sin(a) * d;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.32)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 128, 128);
  }
  return finish('smoke', c, { srgb: false });
}

/** A tongue of flame: hot core, ragged edge. */
export function flameSprite(): THREE.Texture {
  const hit = cache.get('flame');
  if (hit) return hit;
  const [c, x] = canvas(64, 128);
  for (let i = 0; i < 10; i++) {
    const cx = 32 + (hash2(i, 1, 91) - 0.5) * 16;
    const cy = 70 + (hash2(i, 2, 91) - 0.5) * 40;
    const r = 14 + hash2(i, 3, 91) * 16;
    const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
    g.addColorStop(0, 'rgba(255,255,255,0.5)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    x.fillStyle = g;
    x.fillRect(0, 0, 64, 128);
  }
  // Taper to a tip at the top.
  const fade = x.createLinearGradient(0, 0, 0, 128);
  fade.addColorStop(0, 'rgba(0,0,0,1)');
  fade.addColorStop(0.35, 'rgba(0,0,0,0.4)');
  fade.addColorStop(0.6, 'rgba(0,0,0,0)');
  x.globalCompositeOperation = 'destination-out';
  x.fillStyle = fade;
  x.fillRect(0, 0, 64, 128);
  return finish('flame', c, { srgb: false });
}

/** A small glowing point for sparks and embers. */
export function sparkSprite(): THREE.Texture {
  const hit = cache.get('spark');
  if (hit) return hit;
  const [c, x] = canvas(32, 32);
  const g = x.createRadialGradient(16, 16, 0, 16, 16, 16);
  g.addColorStop(0, 'rgba(255,255,255,1)');
  g.addColorStop(0.25, 'rgba(255,255,255,0.6)');
  g.addColorStop(1, 'rgba(255,255,255,0)');
  x.fillStyle = g;
  x.fillRect(0, 0, 32, 32);
  return finish('spark', c, { srgb: false });
}

/**
 * Uniform cloth, white so each soldier's colour tints it: a twill weave, seams,
 * a webbing belt and a cross strap with pouches. `plain` leaves out the kit
 * (for legs and arms).
 */
export function clothTexture(plain = false): THREE.Texture {
  const key = plain ? 'cloth-plain' : 'cloth';
  const hit = cache.get(key);
  if (hit) return hit;
  const [c, x] = canvas(64, 64);
  x.fillStyle = '#eeeeee';
  x.fillRect(0, 0, 64, 64);
  // Twill: fine diagonal weave.
  for (let i = -64; i < 64; i += 3) {
    x.strokeStyle = 'rgba(0,0,0,0.07)';
    x.lineWidth = 1;
    x.beginPath();
    x.moveTo(i, 0);
    x.lineTo(i + 64, 64);
    x.stroke();
  }
  noiseSpeckle(x, 64, 64, 240, 'rgba(0,0,0,0.12)', 'rgba(255,255,255,0.18)', plain ? 151 : 152);
  // Folds and seams.
  x.fillStyle = 'rgba(0,0,0,0.14)';
  x.fillRect(31, 0, 1.5, 64);
  for (let i = 0; i < 5; i++) {
    const g = x.createLinearGradient(0, 8 + i * 12, 0, 14 + i * 12);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(1, 'rgba(0,0,0,0.1)');
    x.fillStyle = g;
    x.fillRect(0, 8 + i * 12, 64, 6);
  }
  if (!plain) {
    // Webbing belt with pouches, and a strap over the shoulder.
    x.fillStyle = '#5b4a30';
    x.fillRect(0, 36, 64, 6);
    x.fillStyle = '#4a3b26';
    for (const px of [8, 22, 40, 54]) x.fillRect(px, 33, 7, 9);
    x.strokeStyle = '#5b4a30';
    x.lineWidth = 4;
    x.beginPath();
    x.moveTo(4, 0);
    x.lineTo(60, 36);
    x.stroke();
    // Buttons down the front.
    x.fillStyle = 'rgba(40,30,20,0.6)';
    for (let y = 6; y < 34; y += 7) x.fillRect(30, y, 3, 2);
  }
  return finish(key, c);
}

/** Size of the ground detail tile, in texels. */
const GD = 512;

/** Draw something at a point and again across the edges it overlaps, so the tile repeats without seams. */
function wrapped(S: number, px: number, py: number, r: number, draw: (x: number, y: number) => void): void {
  for (const ox of [0, S, -S]) {
    if (ox !== 0 && (ox > 0 ? px > r : px < S - r)) continue;
    for (const oy of [0, S, -S]) {
      if (oy !== 0 && (oy > 0 ? py > r : py < S - r)) continue;
      draw(px + ox, py + oy);
    }
  }
}

/** Grey grass layer: tufts and blades, light tips over dark roots. */
function grassLayer(): Uint8ClampedArray {
  const S = GD;
  const [, x] = canvas(S, S);
  x.fillStyle = 'rgb(128,128,128)';
  x.fillRect(0, 0, S, S);
  // Soft patches where the grass grows thicker or thinner.
  for (let i = 0; i < 90; i++) {
    const px = hash2(i, 1, 171) * S;
    const py = hash2(i, 2, 171) * S;
    const r = 10 + hash2(i, 3, 171) * 34;
    const light = hash2(i, 4, 171) < 0.5;
    wrapped(S, px, py, r, (cx, cy) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, light ? 'rgba(160,160,160,0.4)' : 'rgba(92,92,92,0.4)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      x.fillStyle = g;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
  }
  // Tufts: a dark root with blades fanning up from it.
  for (let i = 0; i < 900; i++) {
    const px = hash2(i, 5, 172) * S;
    const py = hash2(i, 6, 172) * S;
    const n = 3 + Math.floor(hash2(i, 7, 172) * 5);
    wrapped(S, px, py, 8, (cx, cy) => {
      x.fillStyle = 'rgba(40,40,40,0.35)';
      x.beginPath();
      x.ellipse(cx, cy + 0.8, 2.2, 1.1, 0, 0, Math.PI * 2);
      x.fill();
      for (let k = 0; k < n; k++) {
        const a = -Math.PI / 2 + (hash2(i, k, 173) - 0.5) * 1.6;
        const l = 3 + hash2(k, i, 173) * 5;
        const v = 150 + Math.floor(hash2(i, k, 174) * 90);
        x.strokeStyle = `rgba(${v},${v},${v},0.7)`;
        x.lineWidth = 0.9;
        x.beginPath();
        x.moveTo(cx + (k - n / 2) * 0.5, cy);
        x.quadraticCurveTo(cx + Math.cos(a) * l * 0.5, cy + Math.sin(a) * l * 0.6, cx + Math.cos(a) * l, cy + Math.sin(a) * l);
        x.stroke();
      }
    });
  }
  // Loose single blades between the tufts.
  for (let i = 0; i < 2600; i++) {
    const px = hash2(i, 10, 175) * S;
    const py = hash2(i, 11, 175) * S;
    const a = -Math.PI / 2 + (hash2(i, 12, 175) - 0.5) * 1.4;
    const l = 2 + hash2(i, 13, 175) * 3.5;
    const v = hash2(i, 14, 175) < 0.35 ? 70 : 180;
    x.strokeStyle = `rgba(${v},${v},${v},0.5)`;
    x.lineWidth = 0.7;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  return x.getImageData(0, 0, S, S).data;
}

/** Grey earth layer: damp and dry blotches, grit, pebbles and cracks. */
function earthLayer(): Uint8ClampedArray {
  const S = GD;
  const [, x] = canvas(S, S);
  x.fillStyle = 'rgb(128,128,128)';
  x.fillRect(0, 0, S, S);
  for (let i = 0; i < 110; i++) {
    const px = hash2(i, 1, 161) * S;
    const py = hash2(i, 2, 161) * S;
    const r = 10 + hash2(i, 3, 161) * 40;
    const light = hash2(i, 4, 161) < 0.5;
    wrapped(S, px, py, r, (cx, cy) => {
      const g = x.createRadialGradient(cx, cy, 0, cx, cy, r);
      g.addColorStop(0, light ? 'rgba(172,172,172,0.35)' : 'rgba(78,78,78,0.35)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      x.fillStyle = g;
      x.fillRect(cx - r, cy - r, r * 2, r * 2);
    });
  }
  noiseSpeckle(x, S, S, 16000, 'rgba(60,60,60,0.45)', 'rgba(200,200,200,0.4)', 162);
  // Cracks in dry earth.
  x.lineWidth = 0.8;
  for (let i = 0; i < 80; i++) {
    let px = hash2(i, 8, 164) * S;
    let py = hash2(i, 9, 164) * S;
    x.strokeStyle = 'rgba(46,46,46,0.4)';
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 5; k++) {
      px += (hash2(i, k, 165) - 0.5) * 18;
      py += (hash2(k, i, 165) - 0.5) * 18;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // Pebbles and small stones, with a lit top and a shadowed foot.
  for (let i = 0; i < 520; i++) {
    const px = hash2(i, 5, 163) * S;
    const py = hash2(i, 6, 163) * S;
    const r = 0.8 + Math.pow(hash2(i, 7, 163), 2.2) * 4;
    const rot = hash2(i, 15, 163) * 3;
    wrapped(S, px, py, r + 2, (cx, cy) => {
      x.fillStyle = 'rgba(34,34,34,0.6)';
      x.beginPath();
      x.ellipse(cx + 0.8, cy + 0.9, r, r * 0.72, rot, 0, Math.PI * 2);
      x.fill();
      const v = 150 + Math.floor(hash2(i, 16, 163) * 80);
      x.fillStyle = `rgba(${v},${v},${v},0.85)`;
      x.beginPath();
      x.ellipse(cx - 0.2, cy - 0.3, r * 0.85, r * 0.6, rot, 0, Math.PI * 2);
      x.fill();
    });
  }
  return x.getImageData(0, 0, S, S).data;
}

/** Tileable value noise over the detail tile, for broad patches. */
function macroLayer(): Float32Array {
  const S = GD;
  const out = new Float32Array(S * S);
  const octave = (cells: number, seed: number) => {
    const at = (ix: number, iy: number) => hash2(((ix % cells) + cells) % cells, ((iy % cells) + cells) % cells, seed);
    for (let y = 0; y < S; y++) {
      for (let xx = 0; xx < S; xx++) {
        const u = (xx / S) * cells;
        const v = (y / S) * cells;
        const ix = Math.floor(u);
        const iy = Math.floor(v);
        const fx = u - ix;
        const fy = v - iy;
        const sx = fx * fx * (3 - 2 * fx);
        const sy = fy * fy * (3 - 2 * fy);
        const a = at(ix, iy);
        const b = at(ix + 1, iy);
        const c = at(ix, iy + 1);
        const d = at(ix + 1, iy + 1);
        out[y * S + xx] += (a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy) / (cells === 4 ? 1.6 : cells === 8 ? 3.2 : 6.4);
      }
    }
  };
  octave(4, 181);
  octave(8, 182);
  octave(16, 183);
  return out;
}

let detailLayers: { grass: Uint8ClampedArray; earth: Uint8ClampedArray } | null = null;
const layers = () => (detailLayers ??= { grass: grassLayer(), earth: earthLayer() });

/**
 * Ground detail, three greys packed in one tile: red is grass (tufts and
 * blades), green is bare earth (grit, pebbles, cracks), blue is broad
 * patches of lush and dry ground. The ground shader picks grass or earth by
 * the colour of the painted ground underneath.
 */
export function groundDetailTexture(): THREE.Texture {
  const hit = cache.get('ground-detail');
  if (hit) return hit;
  const S = GD;
  const { grass, earth } = layers();
  const macro = macroLayer();
  const [c, x] = canvas(S, S);
  const img = x.createImageData(S, S);
  for (let i = 0; i < S * S; i++) {
    img.data[i * 4] = grass[i * 4];
    img.data[i * 4 + 1] = earth[i * 4];
    img.data[i * 4 + 2] = Math.max(0, Math.min(255, macro[i] * 255));
    img.data[i * 4 + 3] = 255;
  }
  x.putImageData(img, 0, 0);
  return finish('ground-detail', c, { repeat: true, srgb: false });
}

/** Free every cached texture (when the battle ends). */
export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
  detailLayers = null;
}
