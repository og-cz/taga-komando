import { el } from '../dom';
import { controlsTable } from '../menu';
import { screenShell } from './shell';

const RULES: [string, string][] = [
  ['Victory conditions', 'Destroying the enemy headquarters always wins, in every mode. Capture Points: each side has 500 tickets, and holding more victory points (V) than the enemy drains theirs. Annihilation: wiping out the enemy army also wins. None: only the headquarters decides it.'],
  ['Supply', 'Munitions (M) and fuel (F) points only pay out while connected to your HQ through territory you own. A struck-through point is cut off.'],
  ['Cover', 'Green dots are heavy cover (sandbags, walls, buildings), yellow is light (hedges, craters, jungle), red is exposed (rice paddies). Cover only protects from the far side.'],
  ['Suppression', 'Machine guns suppress and then pin infantry. Pinned squads can only crawl or retreat. Flank the gun or throw a grenade.'],
  ['Weapon teams', 'Machine guns and mortars must set up to fire and tear down to move. Mortars need a friendly unit to see the target.'],
  ['Armour', 'Tanks have thick front plates and thin rear plates. Hit them from behind. Rifles barely scratch them.'],
  ['Retreat & reinforce', 'Retreat (R) saves a broken squad: it runs home and takes less fire, and it cannot be given other orders until it arrives. Reinforce (E) close to a base (headquarters, a tier building or a bunker): each press queues one soldier, paid up front, three jobs at a time, and he walks out of that base to join the squad. Tanks cannot retreat: drive them home and have engineers repair them. A unit stuck for a few seconds gives up its move or retreat.'],
  ['Engineers', 'Press Build (Q) for the engineers’ menu: sandbags (cover), barbed wire (stops infantry, tanks crush it), tank traps (stop tanks), mines, MG nests (fire all round), bunkers (a machine gun, and squads nearby can reinforce there) and aid tents (heal soldiers nearby). Right-click an unfinished job with other engineers selected and they help, finishing it faster. Defenses have health: only explosives wear them down, and engineers repair them, along with tanks and the HQ: press Repair (F) and click the damaged one, or right-click it. Engineers do not fight while they repair or build. Click a defense to see its health. A job is refunded if every engineer leaves it.'],
  ['Building your army', 'Every battle starts with one engineer squad. Headquarters recruits riflemen and engineers straight away; everything else is unlocked by tier buildings your engineers raise from the Base menu (W). Tier 1 (support) unlocks machine guns, mortars and the first rifle upgrade; Tier 2 (anti-tank, needs Tier 1) unlocks anti-tank teams and the anti-tank upgrade; Tier 3 (motor pool, needs Tier 2) unlocks tanks. Select a tier building to recruit its units there (they come out of its door), or recruit anything unlocked at headquarters. Lose a tier building and its units cannot be recruited until it is rebuilt. Defense and assault missions start with everything unlocked.'],
  ['Doctrines', 'Early in a battle, choose a doctrine from the panel above the orders: five per army, each led by its own commander, such as Hukbo ni Heneral Luna (lightning assault), Katipunan (people’s army), Tanggulang Bayan (defence), Hukbong Himpapawid (airborne) or Gerilya (guerrilla war). Each brings its own special unit, recruited at a tier building, and two commander call-ins (artillery, spotter planes, paratroopers, charges, ambushes…) that unlock as you earn command points in battle. Your tier buildings fly its banner.'],
  ['Building', 'Structures go up as a frame on the spot: the more is built, the more punishment it can take. Several engineers build faster; if they are killed or called away, any engineer can carry on, and the enemy can knock the frame down. MG nests, bunkers and aid stations go up only on ground your army holds; sandbags, wire, tank traps and mines can be laid anywhere. You may have at most 4 MG nests, 3 bunkers and 2 aid stations.'],
  ['Upgrades', 'Rifle squads can buy one weapon upgrade (T / Y), such as a rocket launcher or an automatic rifle, close to a base. Reinforcements replace the upgraded weapon first.'],
  ['Several units', 'Several units of the same type share their abilities, upgrades and special orders. A mixed group can only move, attack-move, stop and retreat; select one type to use its abilities.'],
  ['Queue', 'The queue slots beside the orders show the selected unit’s own jobs: the HQ’s recruits (up to three), or a squad’s weapon upgrade and reinforcements. Roster cards at the top right show squads reinforcing (+) or upgrading (⇪). Click a slot to cancel that job; purchases are refunded.'],
  ['Rally point', 'Select the HQ and right-click the map, or press Rally Point: a flag marks where new units walk once recruited.'],
  ['Campaign', 'Nine missions, each fought in two parts. Story scenes play before each part: Next (Enter or Space) reads on, Skip (Esc) goes straight to the briefing. Win Part 1 to unlock Part 2, and both to unlock the next mission.'],
  ['Theater of War', 'Defense: hold the marked point against every wave. Offensive: take the sectors in order before the clock runs out.'],
];

export function showHowToPlay(layer: HTMLElement, onBack: () => void): void {
  const { root, body } = screenShell('How to Play', 'The rules of the battlefield', onBack);
  body.append(
    el(
      'div',
      { class: 'split' },
      el('div', { class: 'panel-glass' }, el('h2', { text: 'Rules' }), el('dl', { class: 'rules-list' }, ...RULES.flatMap(([k, v]) => [el('dt', { text: k }), el('dd', { text: v })]))),
      el('div', { class: 'panel-glass' }, el('h2', { text: 'Controls' }), controlsTable()),
    ),
  );
  layer.append(root);
}
