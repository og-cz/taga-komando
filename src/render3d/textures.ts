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
  const [c, x] = canvas(256, 64);
  x.lineCap = 'round';
  for (let i = 0; i < 46; i++) {
    const t = i / 46;
    const px = 8 + t * 240;
    const len = 28 * Math.sin(Math.PI * Math.min(1, t * 1.15)) + 4;
    const shade = 0.75 + hash2(i, 1, 41) * 0.35;
    x.strokeStyle = `rgb(${Math.round(70 * shade)},${Math.round(118 * shade)},${Math.round(44 * shade)})`;
    x.lineWidth = 3.2;
    for (const s of [-1, 1]) {
      x.beginPath();
      x.moveTo(px, 32);
      x.quadraticCurveTo(px + 6, 32 + s * len * 0.5, px + 12, 32 + s * len);
      x.stroke();
    }
  }
  x.strokeStyle = '#8a8a4a';
  x.lineWidth = 3;
  x.beginPath();
  x.moveTo(4, 32);
  x.lineTo(252, 32);
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

/** Dense foliage for broadleaf crowns and bushes: clusters of sunlit and shaded leaves. */
export function foliageTexture(): THREE.Texture {
  const hit = cache.get('foliage');
  if (hit) return hit;
  const [c, x] = canvas(128, 128);
  x.fillStyle = '#2f5021';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 520; i++) {
    const shade = 0.6 + hash2(i, 1, 61) * 0.7;
    x.fillStyle = `rgb(${Math.round(64 * shade)},${Math.round(104 * shade)},${Math.round(40 * shade)})`;
    x.beginPath();
    x.ellipse(hash2(i, 2, 61) * 128, hash2(i, 3, 61) * 128, 2 + hash2(i, 4, 61) * 3, 1.2 + hash2(i, 5, 61) * 1.5, hash2(i, 6, 61) * 3, 0, Math.PI * 2);
    x.fill();
  }
  return finish('foliage', c, { repeat: true });
}

/** Tufts of tall grass on a transparent ground. */
export function grassTexture(): THREE.Texture {
  const hit = cache.get('grass');
  if (hit) return hit;
  const [c, x] = canvas(64, 64);
  x.lineCap = 'round';
  for (let i = 0; i < 26; i++) {
    const bx = 8 + hash2(i, 1, 71) * 48;
    const lean = (hash2(i, 2, 71) - 0.5) * 30;
    const shade = 0.6 + hash2(i, 3, 71) * 0.6;
    x.strokeStyle = `rgb(${Math.round(110 * shade)},${Math.round(130 * shade)},${Math.round(56 * shade)})`;
    x.lineWidth = 1.6;
    x.beginPath();
    x.moveTo(bx, 64);
    x.quadraticCurveTo(bx + lean * 0.3, 40, bx + lean, 10 + hash2(i, 4, 71) * 20);
    x.stroke();
  }
  return finish('grass', c);
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

/**
 * Fine ground detail, grey around 0.5 so it lightens and darkens the painted
 * terrain: grit, pebbles, cracked earth and blades of grass. Tiled finely
 * over the whole battlefield so the ground stays sharp close up.
 */
export function groundDetailTexture(): THREE.Texture {
  const hit = cache.get('ground-detail');
  if (hit) return hit;
  const S = 256;
  const [c, x] = canvas(S, S);
  x.fillStyle = 'rgb(128,128,128)';
  x.fillRect(0, 0, S, S);
  // Soft blotches of damp and dry earth.
  for (let i = 0; i < 70; i++) {
    const px = hash2(i, 1, 161) * S;
    const py = hash2(i, 2, 161) * S;
    const r = 8 + hash2(i, 3, 161) * 26;
    const light = hash2(i, 4, 161) < 0.5;
    for (const [ox, oy] of [[0, 0], [S, 0], [-S, 0], [0, S], [0, -S]]) {
      const g = x.createRadialGradient(px + ox, py + oy, 0, px + ox, py + oy, r);
      g.addColorStop(0, light ? 'rgba(170,170,170,0.35)' : 'rgba(80,80,80,0.35)');
      g.addColorStop(1, 'rgba(128,128,128,0)');
      x.fillStyle = g;
      x.fillRect(px + ox - r, py + oy - r, r * 2, r * 2);
    }
  }
  // Grit.
  noiseSpeckle(x, S, S, 5000, 'rgba(60,60,60,0.45)', 'rgba(200,200,200,0.4)', 162);
  // Pebbles with a lit top and a shadowed foot.
  for (let i = 0; i < 160; i++) {
    const px = hash2(i, 5, 163) * S;
    const py = hash2(i, 6, 163) * S;
    const r = 0.8 + hash2(i, 7, 163) * 1.8;
    x.fillStyle = 'rgba(40,40,40,0.55)';
    x.beginPath();
    x.ellipse(px + 0.6, py + 0.6, r, r * 0.75, 0, 0, Math.PI * 2);
    x.fill();
    x.fillStyle = 'rgba(205,205,205,0.6)';
    x.beginPath();
    x.ellipse(px - 0.2, py - 0.3, r * 0.8, r * 0.6, 0, 0, Math.PI * 2);
    x.fill();
  }
  // Cracks in dry earth.
  x.strokeStyle = 'rgba(50,50,50,0.35)';
  x.lineWidth = 0.7;
  for (let i = 0; i < 40; i++) {
    let px = hash2(i, 8, 164) * S;
    let py = hash2(i, 9, 164) * S;
    x.beginPath();
    x.moveTo(px, py);
    for (let k = 0; k < 4; k++) {
      px += (hash2(i, k, 165) - 0.5) * 14;
      py += (hash2(k, i, 165) - 0.5) * 14;
      x.lineTo(px, py);
    }
    x.stroke();
  }
  // Blades of grass.
  x.strokeStyle = 'rgba(175,175,175,0.45)';
  x.lineWidth = 0.8;
  for (let i = 0; i < 600; i++) {
    const px = hash2(i, 10, 166) * S;
    const py = hash2(i, 11, 166) * S;
    const a = -Math.PI / 2 + (hash2(i, 12, 166) - 0.5) * 1.2;
    const l = 2 + hash2(i, 13, 166) * 3;
    x.beginPath();
    x.moveTo(px, py);
    x.lineTo(px + Math.cos(a) * l, py + Math.sin(a) * l);
    x.stroke();
  }
  const t = finish('ground-detail', c, { repeat: true, srgb: false });
  return t;
}

/** Free every cached texture (when the battle ends). */
export function disposeTextures(): void {
  for (const t of cache.values()) t.dispose();
  cache.clear();
}
