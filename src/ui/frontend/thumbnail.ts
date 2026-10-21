import type { MapDef } from '../../data/types';
import { GameMap } from '../../sim/grid';
import { drawReconMap, INK } from '../recon';

const cache = new Map<string, HTMLCanvasElement>();

/** Small top-down preview of a map with its bases and capture points. */
export function mapThumbnail(def: MapDef, owners?: Readonly<Record<number, number>>): HTMLCanvasElement {
  const key = def.id + JSON.stringify(owners ?? {});
  const cached = cache.get(key);
  if (cached) return cloneCanvas(cached);

  const scale = 4;
  const map = GameMap.fromDef(def);
  const c = document.createElement('canvas');
  c.width = def.width * scale;
  c.height = def.height * scale;
  const ctx = c.getContext('2d')!;
  drawReconMap(ctx, map, c.width, c.height);
  // Bases as inked squares, points as rings: blue ours, red theirs.
  def.bases.forEach((b, i) => {
    ctx.fillStyle = i === 0 ? INK.blue : INK.red;
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 2;
    ctx.fillRect(b.x * scale - 8, b.y * scale - 8, 16, 16);
    ctx.strokeRect(b.x * scale - 8, b.y * scale - 8, 16, 16);
  });
  def.points.forEach((p, i) => {
    const owner = owners?.[i];
    ctx.fillStyle = owner === 0 ? INK.blue : owner === 1 ? INK.red : INK.neutral;
    ctx.strokeStyle = INK.line;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(p.x * scale, p.y * scale, p.kind === 'victory' ? 8 : 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
  });
  cache.set(key, c);
  return cloneCanvas(c);
}

function cloneCanvas(src: HTMLCanvasElement): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = src.width;
  c.height = src.height;
  c.className = 'thumb';
  c.getContext('2d')!.drawImage(src, 0, 0);
  return c;
}
