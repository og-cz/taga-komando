/**
 * Graphics quality. High draws everything; Low is for integrated graphics
 * (laptop and APU chips such as AMD Vega or Intel UHD): a lighter frame at a
 * slightly lower resolution, without ambient occlusion, glow or multisampling,
 * with a smaller shadow map redrawn every other frame, a coarser ground mesh
 * and half the grass. Chosen automatically from the graphics chip the first
 * time, then whatever the player picks in the pause menu (from the next battle).
 */
export type Quality = 'low' | 'high';

export interface QualitySettings {
  /** Fraction of the screen's resolution the 3D world renders at. */
  scale: number;
  /** Multisampling of the HDR frame (0 = off). */
  samples: number;
  ambientOcclusion: boolean;
  bloom: boolean;
  shadowSize: number;
  /** Redraw the sun's shadows every n-th frame. */
  shadowEvery: number;
  /** World units between vertices of the ground mesh. */
  groundStep: number;
  /** Fraction of grass clumps and rice plants drawn. */
  grass: number;
}

export const QUALITY: Record<Quality, QualitySettings> = {
  high: { scale: 1, samples: 2, ambientOcclusion: true, bloom: true, shadowSize: 2048, shadowEvery: 1, groundStep: 4, grass: 1 },
  low: { scale: 0.8, samples: 0, ambientOcclusion: false, bloom: false, shadowSize: 1024, shadowEvery: 2, groundStep: 8, grass: 0.5 },
};

const KEY = 'taga-komando.graphics';

/** Integrated graphics, software rendering and mobile chips start on Low. */
function looksLowEnd(): boolean {
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) return true;
    const info = gl.getExtension('WEBGL_debug_renderer_info');
    const name = String(info ? gl.getParameter(info.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER)).toLowerCase();
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return /vega|radeon\(tm\) graphics|radeon graphics|intel|uhd|iris|swiftshader|llvmpipe|basic render|mali|adreno|apple gpu/.test(name);
  } catch {
    return true;
  }
}

/** The quality to draw the next battle at. */
export function graphicsQuality(): Quality {
  // ?gfx=low|high forces one (for tests and captures).
  const forced = new URLSearchParams(location.search).get('gfx');
  if (forced === 'low' || forced === 'high') return forced;
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === 'low' || saved === 'high') return saved;
  } catch {
    // Storage blocked: fall through to the guess.
  }
  return looksLowEnd() ? 'low' : 'high';
}

export function setGraphicsQuality(q: Quality): void {
  try {
    localStorage.setItem(KEY, q);
  } catch {
    // Not remembered; the guess stands next time.
  }
}
