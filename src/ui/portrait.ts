import type { CommanderDef, PortraitLook } from '../data/types';

/**
 * Painted commander portraits: head and shoulders against a warm studio
 * backdrop, all drawn the same way so every commander reads as one set.
 */

let serial = 0;

/** Lighten (k > 0) or darken (k < 0) a #rrggbb colour. */
function shade(hex: string, k: number): string {
  const n = parseInt(hex.slice(1), 16);
  const ch = (v: number) => Math.round(k >= 0 ? v + (255 - v) * k : v * (1 + k));
  const r = ch((n >> 16) & 255);
  const g = ch((n >> 8) & 255);
  const b = ch(n & 255);
  return `#${((1 << 24) | (r << 16) | (g << 8) | b).toString(16).slice(1)}`;
}

function dress(l: PortraitLook, id: string): string {
  const c = l.cloth;
  const dark = shade(c, -0.3);
  const body = `<path d="M-2 122 L-2 104 Q2 86 30 80 L70 80 Q98 86 102 104 L102 122 Z" fill="url(#${id}-cloth)"/>`;
  const boards = (col: string) =>
    `<path d="M14 90 L32 82 L34 87 L17 95 Z" fill="${col}" stroke="${shade(col, -0.4)}" stroke-width="0.6"/>` +
    `<path d="M86 90 L68 82 L66 87 L83 95 Z" fill="${col}" stroke="${shade(col, -0.4)}" stroke-width="0.6"/>`;
  const buttons = (ys: number[]) => ys.map((y) => `<circle cx="50" cy="${y}" r="1.6" fill="#c9a640" stroke="#6d5718" stroke-width="0.4"/>`).join('');
  switch (l.dress) {
    case 'tunic':
      return (
        body +
        `<path d="M50 86 L50 122" stroke="${dark}" stroke-width="0.8"/>` +
        `<path d="M39 76 L61 76 L63 87 Q50 90 37 87 Z" fill="${shade(c, -0.12)}" stroke="${dark}" stroke-width="0.6"/>` +
        (l.boards ? `<rect x="38.5" y="80" width="5" height="5" fill="${l.boards}"/><rect x="56.5" y="80" width="5" height="5" fill="${l.boards}"/>` : '') +
        `<path d="M28 104 L42 104 L42 110 L28 110 Z M58 104 L72 104 L72 110 L58 110 Z" fill="none" stroke="${dark}" stroke-width="0.7"/>` +
        buttons([94, 104, 114]) +
        (l.boards ? boards(shade(c, -0.08)) : '')
      );
    case 'lapel':
      return (
        body +
        `<path d="M41 78 L59 78 L50 104 Z" fill="#d8d1bd"/>` +
        `<path d="M48.5 84 L51.5 84 L53 103 L50 107 L47 103 Z" fill="#4f5340"/>` +
        `<path d="M40 78 L50 104 L45 110 L31 85 Z" fill="${shade(c, -0.1)}" stroke="${dark}" stroke-width="0.6"/>` +
        `<path d="M60 78 L50 104 L55 110 L69 85 Z" fill="${shade(c, -0.1)}" stroke="${dark}" stroke-width="0.6"/>` +
        `<path d="M60 96 Q66 100 74 104" stroke="#5a3a20" stroke-width="3" fill="none"/>` +
        buttons([112]) +
        (l.boards ? boards(l.boards) : '')
      );
    case 'camisa':
      return (
        body +
        [22, 30, 38, 62, 70, 78].map((x) => `<path d="M${x} 84 L${x - 3} 122" stroke="${shade(c, -0.15)}" stroke-width="1.6" opacity="0.6"/>`).join('') +
        `<path d="M42 78 L58 78 L50 96 Z" fill="url(#${id}-skin)"/>`
      );
    case 'kimono':
      return (
        body +
        `<path d="M41 77 L50 101 L59 77" stroke="#cfc8b5" stroke-width="5" fill="none"/>` +
        `<path d="M37 78 L52 110 L52 122 L40 122 L30 84 Z" fill="${shade(c, 0.06)}"/>` +
        [28, 72]
          .map((x) => `<circle cx="${x}" cy="97" r="4.2" fill="#e8e3d6"/><circle cx="${x}" cy="97" r="2.4" fill="none" stroke="${c}" stroke-width="1"/><path d="M${x - 2.4} 97 L${x + 2.4} 97" stroke="${c}" stroke-width="0.9"/>`)
          .join('')
      );
    case 'naval': {
      const fringe = (x: number, dir: number) =>
        Array.from({ length: 6 }, (_, i) => `<path d="M${x + dir * i * 2.2} 88 L${x + dir * i * 2.2 + dir * 0.5} 96" stroke="#d8b54a" stroke-width="1.3"/>`).join('');
      return (
        body +
        fringe(16, 1) +
        fringe(84, -1) +
        `<ellipse cx="22" cy="86" rx="10" ry="4.5" fill="#d8b54a" transform="rotate(-18 22 86)"/>` +
        `<ellipse cx="78" cy="86" rx="10" ry="4.5" fill="#d8b54a" transform="rotate(18 78 86)"/>` +
        `<path d="M38 76 L62 76 L63 87 Q50 90 37 87 Z" fill="#b8963a" stroke="#6d5718" stroke-width="0.6"/>` +
        `<path d="M40 80 Q44 84 48 80 M52 80 Q56 84 60 80" stroke="#e8d07a" stroke-width="0.8" fill="none"/>` +
        buttons([96, 106, 116])
      );
    }
    case 'jacket':
      return (
        body +
        `<path d="M41 78 L59 78 L50 98 Z" fill="#c9b98f"/>` +
        `<path d="M38 77 L50 98 L40 106 L26 86 Z" fill="#c8b48a" stroke="#7d6a46" stroke-width="0.6"/>` +
        `<path d="M62 77 L50 98 L60 106 L74 86 Z" fill="#c8b48a" stroke="#7d6a46" stroke-width="0.6"/>` +
        `<path d="M50 98 L50 122" stroke="${dark}" stroke-width="1.2"/>`
      );
  }
}

function hair(l: PortraitLook, w: number): string {
  const col = l.hairColor ?? '#1b1611';
  const L = 50 - w;
  const R = 50 + w;
  if (l.hat && l.hat.kind !== 'bandana') {
    // Under a cap only the sides show.
    return `<path d="M${L} 50 Q${L - 0.5} 40 ${L + 2} 38 L${L + 3} 50 Z M${R} 50 Q${R + 0.5} 40 ${R - 2} 38 L${R - 3} 50 Z" fill="${col}"/>`;
  }
  const cap = `M${L} 49 Q${L - 2} 25 50 26 Q${R + 2} 25 ${R} 49`;
  switch (l.hair) {
    case 'short':
      return `<path d="${cap} Q${R - 3} 36 50 35 Q${L + 3} 36 ${L} 49 Z" fill="${col}"/>`;
    case 'slick':
      return `<path d="${cap} Q${R - 2} 33 46 33 Q${L + 3} 35 ${L} 49 Z" fill="${col}"/><path d="M44 28 Q42 31 43 34" stroke="${shade(col, 0.35)}" stroke-width="0.8" fill="none"/>`;
    case 'peak':
      return `<path d="${cap} Q${R - 4} 35 56 35 L50 41 L44 35 Q${L + 4} 35 ${L} 49 Z" fill="${col}"/>`;
    case 'shaved':
      return `<path d="${cap} Q${R - 2} 36 50 34 Q${L + 2} 36 ${L} 49 Z" fill="${col}" opacity="0.4"/>`;
    case 'topknot':
      return (
        `<path d="${cap} Q${R + 1} 40 ${R - 2} 37 Q${R - 6} 35 56 37 Q50 33 44 37 Q${L + 6} 35 ${L + 2} 37 Q${L - 1} 40 ${L} 49 Z" fill="${col}"/>` +
        `<path d="M${L + 1} 44 Q${L - 3} 52 ${L - 1} 58 M${R - 1} 44 Q${R + 3} 52 ${R + 1} 58 M46 26 Q50 18 56 21" stroke="${col}" stroke-width="1.6" fill="none"/>` +
        `<ellipse cx="54" cy="22" rx="4" ry="3" fill="${col}"/>`
      );
  }
}

function moustache(l: PortraitLook): string {
  const col = l.hairColor ?? '#1b1611';
  switch (l.moustache) {
    case 'thin':
      return `<path d="M45.5 64.6 Q50 63 54.5 64.6" stroke="${col}" stroke-width="1.3" fill="none" stroke-linecap="round"/>`;
    case 'brush':
      return `<path d="M43 65.5 Q50 60.5 57 65.5 Q50 64.2 43 65.5 Z" fill="${col}"/>`;
    case 'handlebar':
      return `<path d="M37 62.5 Q43 66.5 50 62.2 Q57 66.5 63 62.5 Q58 69 50 65.4 Q42 69 37 62.5 Z" fill="${col}"/>`;
    default:
      return '';
  }
}

function hat(l: PortraitLook, id: string): string {
  const h = l.hat;
  if (!h) return '';
  if (h.kind === 'm1') {
    // A steel helmet: deep dome, rim all round, chin strap.
    return (
      `<path d="M25 46 Q24 17 50 16 Q76 17 75 46 Q50 41 25 46 Z" fill="url(#${id}-hat)" stroke="${shade(h.color, -0.45)}" stroke-width="0.7"/>` +
      `<path d="M24 46 Q50 40 76 46 Q50 43 24 46 Z" fill="${shade(h.color, -0.3)}"/>` +
      `<path d="M36 24 Q44 19 54 20" stroke="${shade(h.color, 0.3)}" stroke-width="1.6" fill="none" opacity="0.6"/>` +
      `<path d="M31 46 Q33 60 40 68 M69 46 Q67 60 60 68" stroke="#2d2618" stroke-width="1.1" fill="none" opacity="0.8"/>`
    );
  }
  if (h.kind === 'type90') {
    // A rounder, shallower helmet with a star on the front.
    return (
      `<path d="M28 44 Q27 19 50 18 Q73 19 72 44 Q50 39 28 44 Z" fill="url(#${id}-hat)" stroke="${shade(h.color, -0.45)}" stroke-width="0.7"/>` +
      `<path d="M28 44 Q50 39.5 72 44 Q50 42 28 44 Z" fill="${shade(h.color, -0.32)}"/>` +
      `<path d="M50 26.5 L51.2 29.4 L54.2 29.5 L51.8 31.3 L52.7 34.2 L50 32.5 L47.3 34.2 L48.2 31.3 L45.8 29.5 L48.8 29.4 Z" fill="#e0c34a"/>` +
      `<path d="M38 23 Q45 19.5 54 20" stroke="${shade(h.color, 0.3)}" stroke-width="1.4" fill="none" opacity="0.55"/>`
    );
  }
  if (h.kind === 'bandana') {
    // A cloth band tied round the head, its ends hanging at the side.
    return (
      `<path d="M32 37 Q50 31 68 37 L68.5 42 Q50 36.5 31.5 42 Z" fill="${h.color}"/>` +
      `<path d="M67 39 L76 46 L73 48 Z M67 40 L73 51 L70 52 Z" fill="${shade(h.color, -0.2)}"/>`
    );
  }
  if (h.kind === 'peaked') {
    return (
      `<path d="M26 37 Q27 21 50 19 Q73 21 74 37 Q50 41 26 37 Z" fill="url(#${id}-hat)" stroke="${shade(h.color, -0.35)}" stroke-width="0.6"/>` +
      `<path d="M31 35 Q50 38 69 35 L69 41 Q50 44 31 41 Z" fill="${h.band ?? shade(h.color, -0.4)}"/>` +
      `<path d="M32 41 Q50 50 68 41 Q50 45 32 41 Z" fill="#141312"/>` +
      `<circle cx="50" cy="31" r="2.6" fill="#c9a640" stroke="#6d5718" stroke-width="0.5"/>`
    );
  }
  return (
    `<path d="M31 41 Q30 23 50 22 Q70 23 69 41 Q50 44 31 41 Z" fill="url(#${id}-hat)" stroke="${shade(h.color, -0.35)}" stroke-width="0.6"/>` +
    `<path d="M33 41 Q50 47 67 41 Q50 44 33 41 Z" fill="#3a2a1a"/>` +
    `<path d="M50 30.5 L51.2 33.4 L54.2 33.5 L51.8 35.3 L52.7 38.2 L50 36.5 L47.3 38.2 L48.2 35.3 L45.8 33.5 L48.8 33.4 Z" fill="#e0c34a"/>`
  );
}

function medals(l: PortraitLook): string {
  let out = '';
  if (l.sash) out += `<path d="M18 86 L30 81 L82 122 L64 122 Z" fill="#ece5d2"/><path d="M24 83.5 L74 122 L70 122 L21 85 Z" fill="#9c3b34" opacity="0.7"/>`;
  if (l.medals) {
    const cols = ['#b3261e', '#e0c34a', '#2f4f8a', '#e8e3d6', '#3b7a3b', '#9c3b34'];
    for (let row = 0; row < 2; row++) {
      for (let i = 0; i < 4; i++) out += `<rect x="${58 + i * 4.4}" y="${96 + row * 3.4}" width="4.2" height="3" fill="${cols[(i + row * 2) % cols.length]}" stroke="#2a2418" stroke-width="0.3"/>`;
    }
  }
  return out;
}

function scarf(l: PortraitLook): string {
  if (!l.scarf) return '';
  const s = l.scarf;
  return (
    `<path d="M39 76 Q50 84 61 76 L62 81 Q50 90 38 81 Z" fill="${s}"/>` +
    `<path d="M47 83 L53 83 L58 100 L50 95 L44 101 Z" fill="${shade(s, -0.12)}"/>` +
    `<circle cx="50" cy="84" r="3" fill="${shade(s, -0.2)}"/>`
  );
}

/** Draw a commander's portrait as an SVG string. */
export function portraitSvg(c: CommanderDef): string {
  const l = c.look;
  const id = `pt${serial++}`;
  const w = l.heavy ? 19 : 17;
  const skin = l.skin;
  return `<svg viewBox="0 0 100 120" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="${c.title} ${c.name}">
<defs>
  <radialGradient id="${id}-bg" cx="45%" cy="38%" r="75%"><stop offset="0" stop-color="#eee9dc"/><stop offset="0.6" stop-color="#cfc8b6"/><stop offset="1" stop-color="#8f8876"/></radialGradient>
  <radialGradient id="${id}-skin" cx="40%" cy="36%" r="70%"><stop offset="0" stop-color="${shade(skin, 0.22)}"/><stop offset="0.55" stop-color="${skin}"/><stop offset="1" stop-color="${shade(skin, -0.35)}"/></radialGradient>
  <linearGradient id="${id}-cloth" x1="0" y1="0" x2="1" y2="0.4"><stop offset="0" stop-color="${shade(l.cloth, 0.12)}"/><stop offset="0.5" stop-color="${l.cloth}"/><stop offset="1" stop-color="${shade(l.cloth, -0.35)}"/></linearGradient>
  <linearGradient id="${id}-hat" x1="0" y1="0" x2="1" y2="0.3"><stop offset="0" stop-color="${shade(l.hat?.color ?? '#777777', 0.12)}"/><stop offset="1" stop-color="${shade(l.hat?.color ?? '#777777', -0.3)}"/></linearGradient>
  <radialGradient id="${id}-vig" cx="50%" cy="45%" r="70%"><stop offset="0.6" stop-color="#000" stop-opacity="0"/><stop offset="1" stop-color="#000" stop-opacity="0.38"/></radialGradient>
  <filter id="${id}-paint" x="-5%" y="-5%" width="110%" height="110%"><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed="${serial % 9}"/><feDisplacementMap in="SourceGraphic" scale="1.4"/></filter>
  <filter id="${id}-grain"><feTurbulence type="fractalNoise" baseFrequency="1.6" numOctaves="2" seed="3"/><feColorMatrix values="0 0 0 0 0.35  0 0 0 0 0.3  0 0 0 0 0.22  0 0 0 0.5 0"/></filter>
</defs>
<rect width="100" height="120" fill="url(#${id}-bg)"/>
<g filter="url(#${id}-paint)" transform="translate(-14 -4) scale(1.28)">
  ${dress(l, id)}
  ${medals(l)}
  <path d="M42 62 L58 62 L59 80 Q50 84 41 80 Z" fill="${shade(skin, -0.25)}"/>
  <path d="M42 70 Q50 76 58 70 L58 74 Q50 80 42 74 Z" fill="${shade(skin, -0.42)}" opacity="0.6"/>
  ${scarf(l)}
  <ellipse cx="${50 - w}" cy="53" rx="3" ry="5.6" fill="${shade(skin, -0.1)}"/>
  <path d="M${50 - w - 1} 50 Q${50 - w - 2} 53 ${50 - w} 56" stroke="${shade(skin, -0.4)}" stroke-width="0.6" fill="none"/>
  <ellipse cx="${50 + w}" cy="53" rx="3" ry="5.6" fill="${shade(skin, -0.25)}"/>
  <path d="M${50 - w} 46 Q${50 - w} 28 50 28 Q${50 + w} 28 ${50 + w} 46 Q${50 + w} 62 ${50 + w * 0.55} 69 Q50 75 ${50 - w * 0.55} 69 Q${50 - w} 62 ${50 - w} 46 Z" fill="url(#${id}-skin)"/>
  <path d="M52 30 Q${50 + w} 32 ${50 + w} 46 Q${50 + w} 62 ${50 + w * 0.55} 69 Q53 73 51 73 Q${50 + w * 0.7} 60 ${50 + w * 0.65} 46 Q${50 + w * 0.6} 36 52 30 Z" fill="${shade(skin, -0.45)}" opacity="0.35"/>
  <ellipse cx="${50 - w * 0.55}" cy="58" rx="3.6" ry="2.4" fill="${shade(skin, 0.25)}" opacity="0.35"/>
  <ellipse cx="44" cy="40" rx="6" ry="3" fill="${shade(skin, 0.3)}" opacity="0.3"/>
  ${hair(l, w)}
  <path d="M39 47.6 Q43 45.2 47.2 46.8" stroke="${l.hairColor ?? '#1b1611'}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
  <path d="M52.8 46.8 Q57 45.2 61 47.6" stroke="${l.hairColor ?? '#1b1611'}" stroke-width="1.7" fill="none" stroke-linecap="round"/>
  <path d="M40.5 50.2 Q43.6 49 46.8 50.6" fill="${shade(skin, -0.3)}" opacity="0.6"/>
  <path d="M53.2 50.6 Q56.4 49 59.5 50.2" fill="${shade(skin, -0.3)}" opacity="0.6"/>
  <path d="M40.6 51.4 Q43.6 49.6 46.6 51.4 Q43.6 52.9 40.6 51.4 Z" fill="#e6ddcf"/>
  <path d="M53.4 51.4 Q56.4 49.6 59.4 51.4 Q56.4 52.9 53.4 51.4 Z" fill="#e6ddcf"/>
  <circle cx="44" cy="51.3" r="1.25" fill="#2a1d14"/>
  <circle cx="56.8" cy="51.3" r="1.25" fill="#2a1d14"/>
  <circle cx="43.6" cy="50.9" r="0.35" fill="#fff" opacity="0.8"/>
  <circle cx="56.4" cy="50.9" r="0.35" fill="#fff" opacity="0.8"/>
  <path d="M40.4 51.4 Q43.6 49.3 46.8 51.2 M53.2 51.2 Q56.4 49.3 59.6 51.4" stroke="#1e1712" stroke-width="0.8" fill="none"/>
  <path d="M41 53.6 Q43.6 54.6 46 53.6 M54 53.6 Q56.4 54.6 59 53.6" stroke="${shade(skin, -0.35)}" stroke-width="0.5" fill="none" opacity="0.7"/>
  <path d="M49.4 51 Q48.6 56 48.4 58.5" stroke="${shade(skin, 0.3)}" stroke-width="1.1" fill="none" opacity="0.5"/>
  <path d="M51.2 51.5 Q52.4 56 53.6 59.4" stroke="${shade(skin, -0.35)}" stroke-width="1" fill="none" opacity="0.7"/>
  <path d="M46 59.8 Q47.2 61.6 50 61.6 Q52.8 61.6 54 59.8 Q52.8 60.6 50 60.8 Q47.2 60.6 46 59.8 Z" fill="${shade(skin, -0.4)}"/>
  <ellipse cx="47.6" cy="60.6" rx="0.9" ry="0.5" fill="#2a1d14" opacity="0.6"/>
  <ellipse cx="52.4" cy="60.6" rx="0.9" ry="0.5" fill="#2a1d14" opacity="0.6"/>
  <path d="M44.6 67.2 Q47 66.2 50 66.8 Q53 66.2 55.4 67.2 Q50 68 44.6 67.2 Z" fill="${shade(skin, -0.42)}"/>
  <path d="M45.6 67.6 Q50 70.4 54.4 67.6 Q50 68.6 45.6 67.6 Z" fill="${shade(skin, -0.15)}"/>
  <path d="M47 71.6 Q50 72.6 53 71.6" stroke="${shade(skin, -0.3)}" stroke-width="0.6" fill="none" opacity="0.6"/>
  ${moustache(l)}
  ${hat(l, id)}
</g>
<rect width="100" height="120" fill="url(#${id}-vig)"/>
<rect width="100" height="120" filter="url(#${id}-grain)" opacity="0.35"/>
</svg>`;
}

/** A framed portrait element. */
export function portrait(c: CommanderDef, cls = 'cmdr'): HTMLElement {
  const frame = document.createElement('div');
  frame.className = cls;
  frame.innerHTML = portraitSvg(c);
  return frame;
}
