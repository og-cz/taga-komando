<img src="docs/logo.svg" alt="Taga Komando" width="420">

### Latest Release <a href="https://github.com/og-cz/taga-komando/releases/latest"><img src="https://img.shields.io/github/v/release/og-cz/taga-komando?style=for-the-badge&color=green" align="top"></a>
[![Downloads](https://img.shields.io/github/downloads/og-cz/taga-komando/total?label=Downloads&color=6b5b3a)](https://github.com/og-cz/taga-komando/releases) [![Platform](https://img.shields.io/badge/Platform-Windows%2010%20%7C%2011-0078D6)](#system-requirements) [![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=white)](https://www.typescriptlang.org/) [![Electron](https://img.shields.io/badge/Electron-47848F?logo=electron&logoColor=white)](https://www.electronjs.org/) [![Single player](https://img.shields.io/badge/Single%20player-Offline-556b2f)](#game-modes)
##### **English** | [Tagalog](README.tl.md) | [Español](README.es.md) | [Português](README.pt-BR.md) | [日本語](README.ja.md) | [简体中文](README.zh-CN.md) | [Bahasa Indonesia](README.id.md)
----

Squad-based real-time tactics game for Windows, set on Luzon.

Version 0.9.2 · Campaign, Theater of War and Skirmish vs. AI · Offline

<picture>![Taga Komando](docs/screenshot.jpg)</picture>
<sub>Concept of the look the game is heading toward.</sub>

---

## Where to get things

- **The game (Windows):** [Releases page](https://github.com/og-cz/taga-komando/releases)
  - `TagaKomando-Setup-<version>.exe`: installer (Start menu shortcut, uninstaller)
  - `TagaKomando-Portable-<version>.exe`: single file, no install, runs from anywhere
- **Source code:** https://github.com/og-cz/taga-komando
- **Node.js 22 or newer** (only needed to build from source): https://nodejs.org (choose "LTS")
- **Git** (only needed to build from source): https://git-scm.com/downloads
- **Bug reports / suggestions:** https://github.com/og-cz/taga-komando/issues

## System requirements

- Windows 10 or 11, 64-bit
- 4 GB RAM
- 400 MB disk space
- Screen 1280×720 or larger
- Graphics with WebGL 2 for the 3D battlefield (any card or integrated graphics from the last ten years; without it the game draws the flat battlefield)
- Mouse with right button (middle button optional)

## Install

**Installer:** run `TagaKomando-Setup-<version>.exe`, choose a folder, finish. Start from the Start menu.

**Portable:** put `TagaKomando-Portable-<version>.exe` anywhere and double-click it.

**"Windows protected your PC" warning:** the app isn't code-signed yet. Click **More info → Run anyway**.

**Uninstall:** Settings → Apps → Taga Komando → Uninstall. The portable version: delete the file.

## Game modes

Pick a mode from the main menu.

**Campaign**: the defence and liberation of Luzon, told through one company. Nine missions in four chapters, each fought in two parts, with story scenes before every part (skip them with Esc). Win Part 1 to unlock Part 2, and both to unlock the next mission.

| # | Chapter | Mission | Part 1 | Part 2 |
| --- | --- | --- | --- | --- |
| 1 | The Invasion | The Beaches of Lingayen | Stand at the Plaza (defense) | Break Contact (annihilation) |
| 2 | The Invasion | Withdrawal to Bataan | The Calumpit Bridges (annihilation) | Plaridel Crossroads (points) |
| 3 | The Invasion | Rearguard | The Walled City (defense) | The Last Bridge at Guagua (defense) |
| 4 | The Invasion | The Door to Bataan | Delaying Action at Lubao (points) | Layac Junction (defense) |
| 5 | Bataan | The Abucay Line | Hold the Line (defense) | Counterattack at Pilar (offensive) |
| 6 | Bataan | The Fall of Bataan | Mount Samat (defense) | The Last Boats (defense) |
| 7 | The Hills | Mga Gerilya | Raid on Porac (annihilation) | Ambush at Dinalupihan (points) |
| 8 | Liberation | The Return | Back to Lingayen (offensive) | The Road to Manila (offensive) |
| 9 | Liberation | San Fernando | Take the Town (offensive) | The Counterattack (defense) |

**Theater of War**: four operations you can replay on any difficulty. Win on Easy, Normal and Hard for Bronze, Silver and Gold medals.

- **Defend the City** (City Defense): hold the Plaza de Roma inside the walls of Intramuros against 8 waves coming through three gates.
- **Hold the Summit** (Hill Defense): defend a hilltop against 8 waves.
- **Highway 3 Assault** (Highway Assault): break 4 fortified positions along a highway before time runs out.
- **Battle for Luzon** (Historical Skirmish): a full battle on historical ground with the victory condition of your choice.

**Skirmish**: a match against the AI on a map of your choice, with a victory condition of your choice:

- **Capture Points:** holding more victory points drains the enemy's 500 tickets.
- **Annihilation:** wipe out the enemy army (every unit, nothing left in production).
- **None:** no tickets or time limit.

Whatever the condition, destroying the enemy headquarters always wins.

How the mission types work:

- **Defense:** keep the marked **HOLD** point. Waves come on a timer and get stronger. You lose if the point falls.
- **Offensive:** capture the marked **OBJECTIVE** sectors in order. Each one adds 3 minutes and moves your reinforcement point forward. The enemy counterattacks.
- **Battle / Skirmish:** won by the chosen victory condition (Capture Points, Annihilation or None).

## How to play

1. Choose a mode, then a mission or map and the difficulty, then press **Deploy**.
2. Capture points with infantry. Vehicles can't capture.
3. Complete the mission objective shown at the top of the screen.
4. Destroying the enemy HQ always wins; losing yours always loses.

**Resources**

- **Manpower (MP):** builds and reinforces units. Comes from the base; upkeep grows with army size.
- **Munitions (MU):** grenades and barrages. From munitions points (**M**).
- **Fuel (FU):** tanks. From fuel points (**F**).
- A point only pays out while it is connected to your HQ through territory you own. A struck-through point is cut off.

**Cover** (the dots under the cursor show where soldiers will stand):

- Green = heavy cover (sandbags, stone walls, buildings)
- Yellow = light cover (hedgerows, craters, jungle)
- Red = exposed (rice paddies make soldiers easier to hit)
- Cover only protects against fire from the far side of it.

**Building your army** (like a real company, you earn your heavy weapons):

- Every battle starts with **one engineer squad**. Headquarters recruits **riflemen and engineers** from the start.
- Engineers raise **tier buildings** from the **Base** menu (**W**), one of each:
  - **Tier 1 · Support Command** (150 MP, 15 FU): machine gun and mortar teams, BAR / light MG upgrade.
  - **Tier 2 · Anti-Tank Command** (180 MP, 40 FU, needs Tier 1): towed anti-tank guns, bazooka and anti-tank rifle upgrades.
  - **Tier 3 · Motor Pool** (200 MP, 80 FU, needs Tier 2): tanks.
- Select a tier building to recruit its units right there (they come out of its door); headquarters can recruit anything unlocked. Lose a tier building and its units can't be recruited until it is rebuilt. Defense and assault missions start with everything unlocked.
- Squads reinforce only **close to a base**: headquarters, a tier building or a bunker. The new soldiers walk out of that base to join them.
- Buildings take up their real ground (MG nests, bunkers and aid stations 2×2 tiles, tier buildings 3×2), shown when you place them. MG nests (120°) and bunkers (90°) only fire to their front: **drag** while placing to choose which way they face.

**Tips**

- Machine guns pin infantry inside their firing cone. Once set up, a machine gun or anti-tank gun keeps the direction you gave it and fires on its own at anything in its cone: flank it, or throw a grenade.
- Hold houses: a squad inside has green cover from every side and sees further, and each man fires from his own window, so only the windows facing the enemy can shoot. Grenades and shells still reach them.
- The cursor shows what a click will do: attack, repair, build or go into a house.
- Mortars need a friendly unit to see the target.
- Tanks have thin rear armour. Hit them from behind.
- Retreat (**R**) damaged squads before they're wiped out, then reinforce (**E**) at the HQ. A retreat can't be cancelled: the squad takes no other orders until it gets home. Tanks can't retreat: drive them back and have engineers repair them.
- Engineers fortify ground from the **Build** menu (**Q**): sandbags give heavy cover, barbed wire stops infantry (tanks crush it), tank traps stop tanks, mines wreck whatever steps on them, MG nests cover the arc they face, bunkers hold a machine gun and let squads reinforce, and aid tents heal soldiers nearby. Engineers also repair tanks, structures and the HQ.
- Give a rifle squad one weapon upgrade (**T / Y**, or the upgrade slots beside its card) near the HQ: a bazooka or AT rifle against tanks, a BAR or light MG against infantry.

## Controls

| Key / mouse | Action |
| --- | --- |
| Left-click / drag | Select units (Shift adds; double-click selects the same unit type) |
| Right-click | Move, or attack the enemy under the cursor (Shift queues) |
| Right-click a house | The nearest selected infantry squad goes in and holds it; any move order brings them out |
| Right-click + drag | Move there and face the drag direction. Machine gun and mortar teams set up aimed that way; the firing cone shows while you drag |
| A | Attack-move |
| S | Stop |
| R | Retreat to HQ |
| E | Reinforce |
| D | Set up / tear down machine gun and mortar teams (shows the firing cone; click to aim) |
| G | Grenade |
| B | Mortar barrage |
| Q | Engineers: open the Build menu (Esc closes it) |
| W | Engineers: open the Base menu: Z / X / C build Tier 1 / Tier 2 / Tier 3 |
| Z / X / C / V | Build menu: sandbags / barbed wire / tank traps / mine (drag to lay a line; Shift keeps placing) |
| B / N / M | Build menu: MG nest / bunker / aid tent |
| F, then click a damaged tank, HQ or defense | Engineers repair it (right-click works too) |
| Right-click an unfinished defense | Selected engineers help build it |
| Click a defense or mine | Show its health and details |
| T / Y | Weapon upgrade for the selected rifle squad (near HQ or a supplied point) |
| H | Select HQ (right-click then moves the rally flag) |
| Ctrl + 1–9 / 1–9 | Assign / select control group (double-tap to jump) |
| Space | Tap: centre on selection. Hold + left-drag: grab and move the map |
| Arrow keys, screen edge, middle-drag | Scroll |
| Mouse wheel | Zoom |
| F11 or Alt+Enter | Fullscreen |
| Esc or P | Pause menu |
| F1 | Controls |

## Units

| Role | Hukbong Maharlika | Imperial Army |
| --- | --- | --- |
| Rifle squad | Sundalo ng Maharlika: 5 men, grenades; upgrade Kanyong Balikat or Ripleng Awtomatiko | Teikoku Hohei: 6 men, grenades; upgrade Type 99 LMG or AT rifle |
| Engineers | Inhinyero ng Maharlika | Teikoku Kōhei |
| Machine gun | Ametralyadora ng Maharlika | Teikoku Kikanjū-han |
| Mortar | Mortero ng Maharlika | Teikoku Hakugeki-han |
| Anti-tank gun | Pangontra-Tangke ng Maharlika: towed 37mm gun | Teikoku Taisensha-han: Type 94 37mm gun |
| Tank | Tangke Tamaraw | Teikoku Sensha Chi-Ha |

### Doctrines

Each army chooses one doctrine per battle. It adds a special unit and two commander call-ins that unlock with command points (earned in combat).

| Hukbong Maharlika | Imperial Army | Style | Special unit |
| --- | --- | --- | --- |
| Hukbo ni Heneral Luna (Heneral Antonio Luna) | Kirikomi Butai (Homma Masaharu) | Lightning assault | Shock infantry with submachine guns |
| Katipunan (Andrés Bonifacio) | Kokumin Giyūtai (Saigō Takamori) | People’s army | 10-man militia with blades and old rifles |
| Tanggulang Bayan (Vicente Lim) | Bōgyo Jinchi (Yamashita Tomoyuki) | Defence in depth | Heavy 57mm anti-tank gun |
| Hukbong Himpapawid (Jesús Villamor) | Teishin Shūdan (Yamamoto Isoroku) | Airborne | Paratroopers (also dropped by call-in) |
| Gerilya (Miguel Malvar) | Yūgeki-tai (Sakamoto Ryōma) | Guerrilla war | Camouflaged infiltrators |

**Maps:**
- Skirmish: Bataan Crossroads, Barrio San Roque, and thirteen Luzon towns: Calumpit, Plaridel, Pilar, Orani, Porac, Abucay, San Fernando, Dinalupihan, Hermosa, Guagua, Lingayen, Baliuag and Lubao (river towns, coast, jungle and open farmland).
- Missions: Intramuros (a walled city on the bay), Mount Samat, Route 3 and Layac Junction, plus Calumpit and San Fernando for the open battles.

## Changelog

What changed in every version: **[docs/CHANGELOG.md](docs/CHANGELOG.md)**.

## Credits

- Town maps: generated with Watabou's **Village Generator** (https://watabou.itch.io/village-generator) and **Medieval Fantasy City Generator** (https://watabou.itch.io/medieval-fantasy-city-generator) and converted into battlefields. Watabou's maps are free to use; thank you.
- Sound effects (all CC0, from OpenGameArt): **The Free Firearm Sound Library** (gunfire), "25 CC0 bang / firework SFX" by rubberduck, "Explosions" by EZduzziteh, "Cannon fire" and "Cannon hit" by Thimras, "Generator (loop)" by YCbCr, "Rocket launch" by qubodup.
- Interface and unit sounds (CC0, from OpenGameArt): "Typewriter sounds" by Cassie-OrbitGames, "Crank movie telephone ringtone" by cyberdyne, "Mechanical Sounds" by BMacZero, "Equipment Clicks II" and "equipment clicks III" by LFA, "Car engine start 01" by looneybits.
- Music: "Triumphant" by Emma_MA (victory) and "The Sad Battle" by Eldritch Grim (defeat), both CC0 from OpenGameArt; "Laments of the War" by Cethiel (menus, CC0, from OpenGameArt) and "Five Armies" by Kevin MacLeod (incompetech.com) for battle, licensed under Creative Commons: By Attribution 4.0 (https://creativecommons.org/licenses/by/4.0/). Both credits ship with the game in `licenses/Music-credits.txt`.
- Display font: **Quiapo Free** by Aaron Amar (http://be.net/aaronamar), used under the SIL Open Font License 1.1. The licence text ships with the game in `licenses/Quiapo-OFL.txt`.

## Troubleshooting

- **Window opens blank:** update your graphics driver, then restart the game.
- **Game runs slowly:** close other heavy programs and update your graphics driver.
- **Keyboard doesn't respond:** click inside the game window once to focus it.
- **Menu choices reset:** the last faction, map and difficulty are saved automatically; this is normal after a reinstall.

---

## Build from source

Building, testing, the project layout and adding new town maps: **[docs/DEVELOPMENT.md](docs/DEVELOPMENT.md)**.
