/**
 * The game's icon set: simple line drawings on a 24×24 grid, shared by the HUD
 * (as SVG) and the battlefield markers (as canvas paths). Each icon is a list
 * of path strings stroked in the current colour; `fill` paths are filled too.
 */

interface IconDef {
  stroke: string[];
  fill?: string[];
}

const ICONS: Record<string, IconDef> = {
  // ─── Unit roles ───
  line: { stroke: ['M5 10.5a7 7 0 0 1 14 0', 'M3 10.5h18', 'M8 10.5v2a4 4 0 0 0 8 0v-2', 'M4 21.5a8 5 0 0 1 16 0'], fill: ['M5 10.5a7 7 0 0 1 14 0z'] },
  mg: { stroke: ['M3 9.5h13', 'M12 7.5h6v4h-6z', 'M15 11.5l-4 8', 'M15 11.5l4 8', 'M15 11.5v8', 'M18 9.5h3'] },
  mortar: { stroke: ['M6.5 18.5L15.5 5', 'M3.5 20.5h9', 'M12.5 11l3.5 9.5', 'M14 4l3 2'] },
  at: { stroke: ['M2.5 15.5l18-6.5', 'M2 13.5l1.2 3.5', 'M8 13.5l1.2 4', 'M12 12l.8 2.6', 'M20.5 9l1.5-.5'] },
  tank: {
    stroke: ['M3 14h18l-2.5 5h-13z', 'M7.5 10h8v4h-8z', 'M15.5 11.5H22', 'M7 16.5h.01', 'M12 16.5h.01', 'M17 16.5h.01'],
    fill: ['M7.5 10h8v4h-8z'],
  },
  engineer: { stroke: ['M12 3v11', 'M9 3h6', 'M8.5 14h7l-1.2 6h-4.6z'], fill: ['M8.5 14h7l-1.2 6h-4.6z'] },
  hq: { stroke: ['M4 20V10l8-5 8 5v10z', 'M10 20v-5h4v5', 'M12 5V2h4l-1 1.2 1 1.2h-4'] },

  // ─── Structures and defenses ───
  mg_nest: { stroke: ['M3 15a9 4.5 0 0 0 18 0', 'M3 15a9 4.5 0 0 1 18 0', 'M12 14l8-5', 'M9 14h6'] },
  bunker: { stroke: ['M3 19v-7l9-5 9 5v7z', 'M8 13.5h8', 'M12 13.5l7-3'], fill: ['M8 12.5h8v2H8z'] },
  aid_tent: { stroke: ['M3 19L12 5l9 14z', 'M12 10.5v6', 'M9 13.5h6'] },
  sandbags: { stroke: ['M4.5 19a2 2 0 0 1 0-4h15a2 2 0 0 1 0 4z', 'M6.5 15a2 2 0 0 1 0-4h11a2 2 0 0 1 0 4', 'M8.5 11a2 2 0 0 1 0-4h7a2 2 0 0 1 0 4'] },
  wire: { stroke: ['M4 6v13', 'M20 6v13', 'M4 10l3 3 3-3 4 3 3-3 3 3', 'M4 15l3 3 3-3 4 3 3-3 3 3'] },
  tanktrap: { stroke: ['M5 19L19 5', 'M19 19L5 5', 'M12 3v18', 'M3 19h18'] },
  mine: { stroke: ['M5 16a7 5 0 0 1 14 0', 'M3 16h18', 'M12 11V8', 'M10 8h4'], fill: ['M5 16a7 5 0 0 1 14 0z'] },

  // ─── Tier buildings ───
  tech1: { stroke: ['M3 20V11l9-5 9 5v9z', 'M8 20v-5h8v5', 'M12 6V3', 'M7 13h10'] },
  tech2: { stroke: ['M3 20V11l9-5 9 5v9z', 'M6.5 16.5l11-4', 'M6 15.5l.6 1.8', 'M12 9V6'] },
  tech3: { stroke: ['M2 20V10h20v10', 'M5 20v-6h14v6', 'M2 10l3-4h14l3 4', 'M8 17h8'] },
  base: { stroke: ['M3 20V11l9-5 9 5v9z', 'M9 20v-6h6v6', 'M3 11h18'] },

  // ─── Commander call-ins ───
  charge: { stroke: ['M3 12h13', 'M11 6l6 6-6 6', 'M18 6v12'] },
  shield: { stroke: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z', 'M12 8v8'], fill: ['M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z'] },
  plane: { stroke: ['M2 13l20-6-6 13-3-6z', 'M13 14l-4 4', 'M9 18l-2-3'] },
  parachute: { stroke: ['M3 10a9 7 0 0 1 18 0z', 'M3 10l9 9 9-9', 'M12 10v9', 'M10.5 19h3v3h-3z'] },
  leaf: { stroke: ['M5 19c0-9 6-14 15-14 0 9-5 15-15 15', 'M5 19l8-8'] },
  doctrine: { stroke: ['M5 21V3', 'M5 4h13l-3 4 3 4H5', 'M9 8h2'] },

  // ─── Orders ───
  attack: { stroke: ['M12 5a7 7 0 1 0 .01 0', 'M12 2v6', 'M12 16v6', 'M2 12h6', 'M16 12h6'] },
  stop: { stroke: ['M6 6h12v12H6z'], fill: ['M6 6h12v12H6z'] },
  retreat: { stroke: ['M9 5L4 10l5 5', 'M4 10h10a6 6 0 0 1 0 12h-3'] },
  reinforce: { stroke: ['M9 4.5a3 3 0 1 0 .01 0', 'M3 20a6 6 0 0 1 12 0', 'M19 8v7', 'M15.5 11.5h7'] },
  repair: { stroke: ['M15 3.5a5 5 0 0 0-4.5 6.8L3.5 17.3l3.2 3.2 7-7A5 5 0 0 0 20.5 9l-3 1-2.5-2.5 1-3z'] },
  build: { stroke: ['M3 21l10-10', 'M10.5 5.5l4-2.5 6.5 6.5-2.5 4-2-2-2.5 2.5-3-3 2.5-2.5z'] },
  setup: { stroke: ['M12 4v8', 'M12 12l-6 8', 'M12 12l6 8', 'M12 12v8', 'M7 7h10'] },
  grenade: { stroke: ['M12 9a6 6 0 1 0 .01 0', 'M10 9V6h4v3', 'M14 6l3-2'] },
  barrage: { stroke: ['M12 2v8', 'M9.5 7.5L12 10l2.5-2.5', 'M4 20l3-5 3 3 2-5 2 5 3-3 3 5'] },
  upgrade: { stroke: ['M6 12l6-6 6 6', 'M6 18l6-6 6 6'] },
  back: { stroke: ['M15 5l-7 7 7 7'] },
  rally: { stroke: ['M6 21V3', 'M6 4h12l-2.5 4 2.5 4H6'], fill: ['M6 4h12l-2.5 4 2.5 4H6z'] },

  // ─── Resources ───
  manpower: { stroke: ['M12 3.5a3.5 3.5 0 1 0 .01 0', 'M5 20a7 7 0 0 1 14 0'], fill: ['M12 3.5a3.5 3.5 0 1 0 .01 0z', 'M5 20a7 7 0 0 1 14 0z'] },
  munitions: { stroke: ['M9 21V10l1.5-3.5L12 3l1.5 3.5L15 10v11z', 'M9 17h6'], fill: ['M9 21V10l1.5-3.5L12 3l1.5 3.5L15 10v11z'] },
  fuel: { stroke: ['M6 6h9l3.5 3.5V21H6z', 'M9 6V3h4v3', 'M9 12l6 6', 'M15 12l-6 6'] },
  pop: { stroke: ['M8 5a2.5 2.5 0 1 0 .01 0', 'M16 5a2.5 2.5 0 1 0 .01 0', 'M3 17a5 5 0 0 1 10 0', 'M11 17a5 5 0 0 1 10 0'] },
};

const SVG_NS = 'http://www.w3.org/2000/svg';

/** An inline SVG of the icon, drawn in the current text colour. */
export function icon(name: string, cls = 'ico'): SVGSVGElement {
  const def = ICONS[name] ?? ICONS.line;
  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('class', cls);
  svg.setAttribute('aria-hidden', 'true');
  for (const d of def.fill ?? []) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    p.setAttribute('class', 'ico-fill');
    svg.append(p);
  }
  for (const d of def.stroke) {
    const p = document.createElementNS(SVG_NS, 'path');
    p.setAttribute('d', d);
    svg.append(p);
  }
  return svg;
}

const paths = new Map<string, { stroke: Path2D[]; fill: Path2D[] }>();

/**
 * Draw an icon on a canvas, centred on (x, y) at `size` pixels. The context's
 * strokeStyle is used for lines; filled parts use `fill` if given.
 */
export function drawIcon(ctx: CanvasRenderingContext2D, name: string, x: number, y: number, size: number, fill?: string): void {
  let p = paths.get(name);
  if (!p) {
    const def = ICONS[name] ?? ICONS.line;
    p = { stroke: def.stroke.map((d) => new Path2D(d)), fill: (def.fill ?? []).map((d) => new Path2D(d)) };
    paths.set(name, p);
  }
  const s = size / 24;
  ctx.save();
  ctx.translate(x - size / 2, y - size / 2);
  ctx.scale(s, s);
  ctx.lineWidth = 2;
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  if (fill) {
    ctx.fillStyle = fill;
    for (const f of p.fill) ctx.fill(f);
  }
  for (const st of p.stroke) ctx.stroke(st);
  ctx.restore();
}

/** Icon for a unit: its role, or for structures what they are. */
export function unitIcon(def: { id: string; role: string }): string {
  if (def.role === 'tech') return `tech${def.id.slice(-1)}`;
  return def.role === 'fort' ? def.id : def.role;
}
