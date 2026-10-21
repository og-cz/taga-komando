import { el } from './dom';

export const CONTROLS: [string, string][] = [
  ['Left-click / drag', 'Select units (Shift adds, double-click selects same type)'],
  ['Right-click', 'Move, or attack the enemy under the cursor (Shift queues)'],
  ['Right-click + drag', 'Move there and face the drag direction; weapon teams set up aimed that way'],
  ['A', 'Attack-move'],
  ['S', 'Stop'],
  ['R', 'Retreat to HQ'],
  ['E', 'Reinforce (close to headquarters, a tier building or a bunker)'],
  ['D', 'Set up / tear down weapon teams (shows the firing cone; click to aim)'],
  ['G / B', 'Grenade / mortar barrage'],
  ['Q', 'Engineers: open the Build menu (Esc closes it)'],
  ['W', 'Engineers: open the Base menu (tier buildings)'],
  ['Doctrine panel', 'Choose a doctrine, then click a call-in (click the map to aim it; Esc cancels)'],
  ['Z / X / C / V', 'In the Build menu: sandbags / barbed wire / tank traps / mine (drag to lay a line)'],
  ['Z / X / C in Base', 'Tier 1 support / Tier 2 anti-tank / Tier 3 motor pool'],
  ['B / N / M', 'In the Build menu: MG nest / bunker / aid tent'],
  ['F, then click', 'Engineers repair a damaged tank, structure or defense (right-click works too)'],
  ['Right-click an unfinished defense', 'More engineers join in and build faster'],
  ['Click a defense or mine', 'Show its health and details'],
  ['T / Y', 'Buy a weapon upgrade for the selected squad (near HQ or a supplied point)'],
  ['H', 'Select headquarters (then right-click to place the rally flag)'],
  ['Ctrl+1–9 / 1–9', 'Assign / recall control group (double-tap to jump)'],
  ['Space', 'Tap: centre camera on selection · Hold + left-drag: grab and move the map'],
  ['Arrows, screen edge, middle-drag', 'Pan camera · Mouse wheel zooms'],
  ['F11 / Alt+Enter', 'Fullscreen (desktop app)'],
  ['Esc / P', 'Pause (volume and surrender are in the pause menu)'],
];

export function controlsTable(): HTMLElement {
  return el(
    'table',
    { class: 'controls' },
    ...CONTROLS.map(([k, v]) => el('tr', {}, el('th', { text: k }), el('td', { text: v }))),
  );
}
