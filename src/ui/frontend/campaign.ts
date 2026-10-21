import { CAMPAIGN } from '../../data/campaign';
import { ALL_MAPS } from '../../data/theaterMaps';
import type { Difficulty } from '../../data/types';
import type { MatchSetup } from '../../game';
import { el } from '../dom';
import { objectiveLines } from './briefing';
import { isCampaignComplete, isCampaignUnlocked, isMissionComplete, isPartUnlocked } from './progress';
import { difficultyPicker, modeBadge, screenShell } from './shell';
import { setupFor } from './theater';
import { mapThumbnail } from './thumbnail';

/** Where the player is in the campaign: a mission and one of its parts. */
export interface CampaignSpot {
  mission: number;
  part: number;
}

/** The first part not yet won in a mission (the last one if all are). */
export function nextPart(mission: number): number {
  const i = CAMPAIGN[mission].parts.findIndex((p) => !isCampaignComplete(p.id));
  return i < 0 ? CAMPAIGN[mission].parts.length - 1 : i;
}

/** Campaign: chapters of missions that unlock one by one, each fought in two parts. */
export function showCampaign(layer: HTMLElement, onStart: (setup: MatchSetup, spot: CampaignSpot) => void, onBack: () => void, focus?: number): void {
  const firstOpen = CAMPAIGN.findIndex((_, i) => isCampaignUnlocked(i) && !isMissionComplete(i));
  let mission = focus ?? (firstOpen >= 0 ? firstOpen : 0);
  let part = nextPart(mission);
  let difficulty: Difficulty = 'normal';
  const { root, body, close } = screenShell('Campaign', 'The Defence and Liberation of Luzon · 1941 – 1945', onBack);

  const detail = el('div', { class: 'panel-glass detail-pane' });
  const timeline = el('ol', { class: 'timeline' });

  const renderDetail = () => {
    const m = CAMPAIGN[mission];
    const unlocked = isCampaignUnlocked(mission);
    const s = m.parts[part];
    const partOpen = isPartUnlocked(mission, part);
    const won = isCampaignComplete(s.id);
    const begin = el('button', { class: 'deploy', text: !partOpen ? 'Locked' : won ? `Replay part ${part + 1}` : `Begin part ${part + 1}` });
    begin.disabled = !partOpen;
    begin.addEventListener('click', () => {
      close();
      onStart(setupFor(s, difficulty), { mission, part });
    });

    const parts = el(
      'div',
      { class: 'mission-parts' },
      ...m.parts.map((p, i) => {
        const done = isCampaignComplete(p.id);
        const open = isPartUnlocked(mission, i);
        const b = el(
          'button',
          { class: `mission-part ${done ? 'done' : ''} ${i === part ? 'picked' : ''}` },
          el('span', { class: 'mp-no', text: `Part ${i + 1}` }),
          el('span', {}, el('div', { class: 'mp-name', text: p.name }), el('div', { class: 'mp-tag', text: `${p.date} · ${p.location}` })),
          el('span', { class: 'mp-state', text: done ? '✓ Won' : open ? 'Ready' : 'Locked' }),
        );
        b.disabled = !open;
        b.addEventListener('click', () => {
          part = i;
          renderDetail();
        });
        return b;
      }),
    );

    detail.replaceChildren(
      el('div', { class: 'detail-thumb' }, mapThumbnail(ALL_MAPS[s.map], s.owners)),
      el('div', { class: 'detail-meta' }, el('span', { class: 'chapter-no', text: `Mission ${mission + 1}` }), modeBadge(s.mode), el('span', { class: 'detail-loc', text: `${m.date} · ${m.location}` })),
      el('h2', { class: 'detail-title', text: m.name }),
      el('p', { class: 'detail-text', text: m.tagline }),
      ...(unlocked
        ? [
            parts,
            // The part's orders, typed on a sheet of paper.
            el(
              'div',
              { class: 'briefing-paper' },
              el('h3', { class: 'detail-sub', text: `Part ${part + 1}: ${s.name}` }),
              ...s.briefing.map((p) => el('p', { class: 'detail-text', text: p })),
              el('ul', { class: 'briefing-obj' }, ...objectiveLines(s).map((t) => el('li', { text: t }))),
            ),
          ]
        : [el('p', { class: 'detail-text locked-note', text: `Complete “${CAMPAIGN[mission - 1].name}” to unlock this mission.` })]),
      el('div', { class: 'row' }, el('h3', { text: 'Difficulty' }), difficultyPicker(difficulty, (d) => (difficulty = d)), begin),
    );
  };

  const items: HTMLElement[] = [];
  let chapter = '';
  CAMPAIGN.forEach((m, i) => {
    if (m.chapter !== chapter) {
      chapter = m.chapter;
      timeline.append(el('li', { class: 'tl-chapter', text: `Chapter ${m.chapter}` }));
    }
    const done = isMissionComplete(i);
    const open = isCampaignUnlocked(i);
    const won = m.parts.filter((p) => isCampaignComplete(p.id)).length;
    const item = el(
      'li',
      { class: `tl-item ${done ? 'done' : open ? 'open' : 'locked'}` },
      el('div', { class: 'tl-dot', text: done ? '✓' : open ? String(i + 1) : '🔒' }),
      el(
        'div',
        { class: 'tl-text' },
        el('div', { class: 'tl-date', text: `${m.date} · ${won}/${m.parts.length} parts` }),
        el('div', { class: 'tl-name', text: m.name }),
        el('div', { class: 'tl-tag', text: m.tagline }),
      ),
    );
    item.addEventListener('click', () => {
      mission = i;
      part = nextPart(i);
      items.forEach((x, j) => x.classList.toggle('picked', j === i));
      renderDetail();
    });
    timeline.append(item);
    items.push(item);
  });
  items[mission].classList.add('picked');
  renderDetail();
  body.append(el('div', { class: 'split' }, timeline, detail));
  layer.append(root);
}
