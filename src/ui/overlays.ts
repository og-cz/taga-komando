import { audio, type Channel } from '../audio/audio';
import type { TeamId } from '../data/types';
import type { World } from '../sim/world';
import { el, formatTime } from './dom';
import { drawReconMap } from './recon';
import { controlsTable } from './menu';

/** Master, music and effects volume, saved between sessions. */
export function volumeControls(): HTMLElement {
  const row = (channel: Channel, label: string) => {
    const input = el('input');
    Object.assign(input, { type: 'range', min: '0', max: '100', step: '1' });
    input.value = String(Math.round(audio.getVolume(channel) * 100));
    const value = el('span', { class: 'volume-value', text: `${input.value}%` });
    input.addEventListener('input', () => {
      audio.setVolume(channel, Number(input.value) / 100);
      value.textContent = `${input.value}%`;
    });
    return el('label', { class: 'volume-row' }, el('span', { text: label }), input, value);
  };
  return el('div', { class: 'volume' }, el('h2', { text: 'Sound' }), row('master', 'Master'), row('music', 'Music'), row('effects', 'Effects'));
}

export function pauseOverlay(onResume: () => void, onQuit: () => void): HTMLElement {
  const resume = el('button', { class: 'deploy', text: 'Resume' });
  const quit = el('button', { class: 'secondary', text: 'Surrender' });
  resume.addEventListener('click', onResume);
  quit.addEventListener('click', onQuit);
  return el(
    'div',
    { class: 'overlay dim' },
    el('div', { class: 'menu-box small' }, el('h1', { text: 'Paused' }), volumeControls(), controlsTable(), el('div', { class: 'row' }, quit, resume)),
  );
}

export function helpOverlay(onClose: () => void): HTMLElement {
  const close = el('button', { class: 'deploy', text: 'Close' });
  close.addEventListener('click', onClose);
  return el('div', { class: 'overlay dim' }, el('div', { class: 'menu-box small' }, el('h1', { text: 'Controls' }), controlsTable(), close));
}

export interface EndActions {
  /** Shown on victory, e.g. next campaign mission or back to the mode screen. */
  continueLabel: string;
  onContinue(): void;
  onRetry(): void;
  onMenu(): void;
}

/**
 * Full-screen result. Defeat: black with red lettering. Victory: white with gold.
 */
export function endOverlay(world: World, player: TeamId, title: string, actions: EndActions): HTMLElement {
  const won = world.winner === player;
  const me = world.teams[player];
  const enemy = world.teams[player === 0 ? 1 : 0];
  // Head to head: our number, a bar split by who did better, theirs.
  const row = (label: string, a: number, b: number) => {
    const total = a + b;
    const mine = el('i', { class: 'me' });
    const theirs = el('i', { class: 'them' });
    mine.style.flexGrow = String(total > 0 ? a : 1);
    theirs.style.flexGrow = String(total > 0 ? b : 1);
    return el(
      'div',
      { class: 'es-row' },
      el('span', { class: 'es-val me', text: String(a) }),
      el('div', { class: 'es-mid' }, el('div', { class: 'es-label', text: label }), el('div', { class: 'es-bar' }, mine, theirs)),
      el('span', { class: 'es-val them', text: String(b) }),
    );
  };

  const stats = el(
    'div',
    { class: 'end-stats' },
    el('div', { class: 'es-head' }, el('span', { class: 'es-side me', text: me.faction.name }), el('span', { class: 'es-vs', text: 'vs' }), el('span', { class: 'es-side them', text: enemy.faction.name })),
    ...(world.objective.mode === 'skirmish' && world.win === 'points' ? [row('Tickets left', me.tickets, enemy.tickets)] : []),
    row('Units fielded', me.stats.produced, enemy.stats.produced),
    row('Enemies destroyed', me.stats.killed, enemy.stats.killed),
    row('Units lost', me.stats.lost, enemy.stats.lost),
  );

  const o = world.objective;
  const progress =
    o.mode === 'defense' ? ` · Wave ${o.wave} of ${o.totalWaves}` : o.mode === 'offensive' ? ` · ${o.sector} of ${o.totalSectors} sectors taken` : '';

  const buttons: HTMLButtonElement[] = [];
  const button = (label: string, cls: string, fn: () => void) => {
    const b = el('button', { class: cls, text: label });
    b.addEventListener('click', fn);
    buttons.push(b);
    return b;
  };
  if (won) {
    button('Return to menu', 'end-btn ghost', actions.onMenu);
    button(actions.continueLabel, 'end-btn primary', actions.onContinue);
  } else {
    button('Return to menu', 'end-btn ghost', actions.onMenu);
    button('Retry mission', 'end-btn primary', actions.onRetry);
  }

  // The battle's recon maps, clipped to boards either side of the report.
  const sideMap = (side: string) => {
    const c = document.createElement('canvas');
    c.width = 440;
    c.height = Math.round((440 * world.map.h) / world.map.w);
    drawReconMap(c.getContext('2d')!, world.map, c.width, c.height);
    return el('div', { class: `end-board ${side}` }, el('div', { class: 'end-clip' }), c);
  };

  return el(
    'div',
    { class: `end-screen ${won ? 'victory' : 'defeat'}` },
    el('div', { class: 'grain' }),
    el(
      'div',
      { class: 'end-desk' },
      sideMap('left'),
      sideMap('right'),
      el(
        'div',
        { class: 'end-box end-paper' },
        el('div', { class: 'end-clip' }),
        el('div', { class: 'end-postmark' }, el('span', { text: 'HQ LUZON' })),
        el('div', { class: 'end-kicker', text: title }),
        el('h1', { class: 'end-title', text: won ? 'Victory' : 'Defeat' }),
        el('div', { class: 'end-reason', text: world.endReason || (won ? 'The enemy has been defeated' : 'Your forces have been defeated') }),
        el('div', { class: 'end-time', text: `Battle lasted ${formatTime(world.time)}${progress}` }),
        stats,
        el('div', { class: 'end-actions' }, ...buttons),
        el('div', { class: 'end-stamp', text: 'Ulat ng Labanan' }),
      ),
    ),
  );
}
