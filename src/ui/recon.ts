import { T } from '../data/terrain';
import { hash2 } from '../core/rng';
import type { GameMap } from '../sim/grid';

/** Ink colours for the recon maps. */
export const INK = {
  paper: '#d6c7a0',
  line: '#2a2014',
  blue: '#1f4f8e',
  red: '#8e1f16',
  neutral: '#e8dcb8',
};

/**
 * A battlefield drawn as a recon map: terrain inked on stained, folded paper
 * with a grid, darkening at the edges like an old print. Used by the minimap
 * and the map previews in the menus, so they always look the same.
 */
export function drawReconMap(c: CanvasRenderingContext2D, map: GameMap, W: number, H: number): void {
  const s = W / map.w;
  c.fillStyle = INK.paper;
  c.fillRect(0, 0, W, H);
  // Stains.
  const stains = Math.round((W * H) / 1400);
  for (let i = 0; i < stains; i++) {
    const x = hash2(i, 1, 31) * W;
    const y = hash2(i, 2, 31) * H;
    const r = (6 + hash2(i, 3, 31) * 26) * Math.max(1, W / 220);
    const g = c.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, `rgba(${hash2(i, 4, 31) < 0.5 ? '150,120,70' : '240,230,200'},0.18)`);
    g.addColorStop(1, 'rgba(0,0,0,0)');
    c.fillStyle = g;
    c.fillRect(x - r, y - r, r * 2, r * 2);
  }
  const cell = (tx: number, ty: number, color: string, inset = 0) => {
    c.fillStyle = color;
    c.fillRect(tx * s + inset, ty * s + inset, s - inset * 2 + 0.4, s - inset * 2 + 0.4);
  };
  for (let ty = 0; ty < map.h; ty++) {
    for (let tx = 0; tx < map.w; tx++) {
      const t = map.get(tx, ty);
      if (t === T.Jungle) {
        cell(tx, ty, 'rgba(96,112,70,0.55)');
        if ((tx + ty) % 2 === 0) cell(tx, ty, 'rgba(60,74,44,0.45)', s * 0.3);
      } else if (t === T.Hedge) cell(tx, ty, 'rgba(96,112,70,0.4)', s * 0.15);
      else if (t === T.Paddy) {
        cell(tx, ty, 'rgba(140,160,130,0.45)');
        if (ty % 2 === 0) cell(tx, ty, 'rgba(90,110,90,0.35)', s * 0.35);
      } else if (t === T.Water) cell(tx, ty, 'rgba(92,120,128,0.85)');
      else if (t === T.Road) cell(tx, ty, 'rgba(128,96,60,0.75)', s * 0.12);
      else if (t === T.Building) cell(tx, ty, 'rgba(70,52,34,0.9)');
      else if (t === T.Wall || t === T.Rampart) cell(tx, ty, 'rgba(60,54,46,0.85)', s * 0.2);
      else if (t === T.Crater) cell(tx, ty, 'rgba(90,70,46,0.45)', s * 0.2);
    }
  }
  // Grid and folds.
  c.strokeStyle = 'rgba(110,80,40,0.22)';
  c.lineWidth = Math.max(0.6, W / 360);
  c.beginPath();
  for (let i = 1; i < 8; i++) {
    const x = Math.round((W / 8) * i) + 0.5;
    c.moveTo(x, 0);
    c.lineTo(x, H);
  }
  for (let i = 1; i < 6; i++) {
    const y = Math.round((H / 6) * i) + 0.5;
    c.moveTo(0, y);
    c.lineTo(W, y);
  }
  c.stroke();
  c.strokeStyle = 'rgba(255,250,230,0.35)';
  c.lineWidth = Math.max(1.4, W / 200);
  c.beginPath();
  c.moveTo(W / 2, 0);
  c.lineTo(W / 2, H);
  c.moveTo(0, H / 2);
  c.lineTo(W, H / 2);
  c.stroke();
  // Aged edges.
  const g = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.72);
  g.addColorStop(0, 'rgba(90,60,25,0)');
  g.addColorStop(1, 'rgba(90,60,25,0.38)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);
}
