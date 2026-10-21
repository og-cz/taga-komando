import { audio } from '../../audio/audio';
import { el } from '../dom';
import { gameLogo } from './logo';
import studioLogo from './ogcz.svg?raw';

/**
 * Startup sequence: a black studio card, then the title over the live battle.
 * Any key or click skips ahead.
 */
export function playIntro(layer: HTMLElement, onDone: () => void): void {
  const logo = el('div', { class: 'splash-studio' });
  logo.innerHTML = studioLogo;
  logo.setAttribute('role', 'img');
  logo.setAttribute('aria-label', 'OGCZ');
  const splash = el('div', { class: 'splash' }, el('div', { class: 'splash-card' }, logo, el('div', { class: 'splash-presents', text: 'presents' })));
  // The card and its boom start together: wait (briefly) until the sound is ready.
  const sting = audio.prepareOnce('intro');
  let started = false;
  let timer = 0;
  const begin = () => {
    // Skipped already (a key pressed while the sound loaded): straight to the title.
    if (started || stage !== 0) return;
    started = true;
    layer.append(splash);
    void sting.play().catch(() => {});
    timer = window.setTimeout(() => showTitle(), 3200);
  };
  sting.addEventListener('canplaythrough', begin, { once: true });
  window.setTimeout(begin, 700);

  let stage = 0;

  const showTitle = () => {
    if (stage !== 0) return;
    stage = 1;
    clearTimeout(timer);
    splash.classList.add('fade-out');
    timer = window.setTimeout(() => splash.remove(), 900);
    layer.append(title);
  };

  const title = el(
    'div',
    { class: 'title-screen' },
    el('div', { class: 'vignette' }),
    el('div', { class: 'grain' }),
    el(
      'div',
      { class: 'title-wrap' },
      el('div', { class: 'title-kicker', text: 'Luzon · 1941 – 1945' }),
      gameLogo('h1', 'title-main'),
      el('div', { class: 'title-rule' }),
      el('div', { class: 'title-sub', text: 'Real-time squad tactics' }),
    ),
    el('div', { class: 'press-key', text: 'Press any key to continue' }),
  );

  const finish = () => {
    if (stage !== 1) return;
    stage = 2;
    window.removeEventListener('keydown', onInput);
    window.removeEventListener('mousedown', onInput);
    title.classList.add('fade-out');
    window.setTimeout(() => {
      title.remove();
      onDone();
    }, 600);
  };

  const onInput = (e: Event) => {
    e.preventDefault();
    if (stage === 0) showTitle();
    else finish();
  };
  window.addEventListener('keydown', onInput);
  window.addEventListener('mousedown', onInput);
}
