<img src="docs/logo.svg" alt="Taga Komando" width="420">

Squad-based real-time tactics game for Windows, set on Luzon.

Version 0.7.0 · Campaign, Theater of War and Skirmish vs. AI · Offline

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
  - **Tier 2 · Anti-Tank Command** (180 MP, 40 FU, needs Tier 1): bazooka / AT rifle teams, anti-tank rifle upgrade.
  - **Tier 3 · Motor Pool** (200 MP, 80 FU, needs Tier 2): tanks.
- Select a tier building to recruit its units right there (they come out of its door); headquarters can recruit anything unlocked. Lose a tier building and its units can't be recruited until it is rebuilt. Defense and assault missions start with everything unlocked.
- Squads reinforce only **close to a base**: headquarters, a tier building or a bunker. The new soldiers walk out of that base to join them.
- Buildings take up their real ground (MG nests, bunkers and aid stations 2×2 tiles, tier buildings 3×2), shown when you place them. MG nests (120°) and bunkers (90°) only fire to their front: **drag** while placing to choose which way they face.

**Tips**

- Machine guns pin infantry inside their firing cone. Flank them or throw a grenade.
- Mortars need a friendly unit to see the target.
- Tanks have thin rear armour. Hit them from behind.
- Retreat (**R**) damaged squads before they're wiped out, then reinforce (**E**) at the HQ. A retreat can't be cancelled: the squad takes no other orders until it gets home. Tanks can't retreat: drive them back and have engineers repair them.
- Engineers fortify ground from the **Build** menu (**Q**): sandbags give heavy cover, barbed wire stops infantry (tanks crush it), tank traps stop tanks, mines wreck whatever steps on them, MG nests fire all round, bunkers hold a machine gun and let squads reinforce, and aid tents heal soldiers nearby. Engineers also repair tanks, structures and the HQ.
- Give a rifle squad one weapon upgrade (**T / Y**) near the HQ: a bazooka or AT rifle against tanks, a BAR or light MG against infantry.

## Controls

| Key / mouse | Action |
| --- | --- |
| Left-click / drag | Select units (Shift adds; double-click selects the same unit type) |
| Right-click | Move, or attack the enemy under the cursor (Shift queues) |
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
| Anti-tank | Pangontra-Tangke ng Maharlika | Teikoku Taisensha-han |
| Tank | Tangke Tamaraw | Teikoku Sensha Chi-Ha |

### Doctrines

Each army chooses one doctrine per battle. It adds a special unit and two commander call-ins that unlock with command points (earned in combat).

| Hukbong Maharlika | Imperial Army | Style | Special unit |
| --- | --- | --- | --- |
| Hukbo ni Heneral Luna (Heneral Antonio Luna) | Kirikomi Butai (Homma Masaharu) | Lightning assault | Shock infantry with submachine guns |
| Katipunan (Andrés Bonifacio) | Kokumin Giyūtai (Saigō Takamori) | People’s army | 10-man militia with blades and old rifles |
| Tanggulang Bayan (Vicente Lim) | Bōgyo Jinchi (Yamashita Tomoyuki) | Defence in depth | Anti-tank gun team |
| Hukbong Himpapawid (Jesús Villamor) | Teishin Shūdan (Yamamoto Isoroku) | Airborne | Paratroopers (also dropped by call-in) |
| Gerilya (Miguel Malvar) | Yūgeki-tai (Sakamoto Ryōma) | Guerrilla war | Camouflaged infiltrators |

**Maps:**
- Skirmish: Bataan Crossroads, Barrio San Roque, and thirteen Luzon towns: Calumpit, Plaridel, Pilar, Orani, Porac, Abucay, San Fernando, Dinalupihan, Hermosa, Guagua, Lingayen, Baliuag and Lubao (river towns, coast, jungle and open farmland).
- Missions: Intramuros (a walled city on the bay), Mount Samat, Route 3 and Layac Junction, plus Calumpit and San Fernando for the open battles.

## Changelog

**0.7.0**
- **Doctrines.** Five per army, each led by a commander with a painted portrait and its own banner, special unit and two commander call-ins: charges, accuracy and defence orders, artillery barrages, spotter planes, paradrops, free militia squads, ambushes and minefields. Command points are earned in combat and over time. The enemy commander chooses a doctrine and uses its call-ins too.
- **Building like a real engineer company.** Structures go up as a frame straight away and take up their whole footprint. How far along a frame is is how much punishment it can take; any engineer can carry on an unfinished job (right-click it, or use Repair on it), and the enemy can knock it down. MG nests, bunkers and aid stations go up only on ground your army holds, at most 4, 3 and 2 at a time; sandbags, wire, tank traps and mines can be laid anywhere.
- **A smarter enemy.** It flanks MG nests and bunkers outside their arc and grenades them instead of walking into the gun, sends tanks and anti-tank teams against them, shells them with mortars and artillery, recruits at its tier buildings and builds only on its own ground.
- **Fair maps.** Every generated skirmish map is now mirrored: both bases, both sets of resources and the flanking victory points are exact mirror images, and the central victory point sits in the very middle.
- **Reinforcements pause** when a squad is too far from a base (or retreating) instead of being cancelled, and carry on when it is back.
- **Retreating troops** run without looking back, cannot be pinned and take only about half the damage.
- **Filipino arms and names.** The Maharlika carry the Riple Kalayaan, Karabina Kalayaan, Ripleng Awtomatiko, Kanyong Balikat and the Tangke Tamaraw; the Imperial Army's units all follow one naming style (Teikoku Hohei, Teikoku Kōhei…). The Strong vs / Weak vs lists are gone: find out what works on the battlefield.
- **Looks and feel.** Doctrine uniforms (rayadillo, camisa with bandana, paratrooper green), walking soldiers, tank track prints, explosions with flying earth, pressure rings, scorch marks and a little screen shake, scaffolding on buildings under construction, doctrine banners on the tier buildings and a busier headquarters compound.
- **A new look, battlefield and interface.** The battlefield is drawn with depth: ground blended from grass, mud and dirt instead of squares, hipped roofs of clay tile, nipa thatch or rusted iron lit from one side, walls with height, palms and jungle trees whose crowns stand over the soldiers, and every building, wall, tree, tank and soldier casting a shadow. Evening light, a soft vignette and soft-edged fog of war. The interface is rebuilt as field gear: an olive-drab steel console, a recon map on paper with its own tab, black-and-white photographs of the selected soldiers, typed orders, stamped resource plates and switch-like order buttons. The menus match: steel mission plates, paper map previews and briefings, and the doctrine chooser as a dossier of files.
- **Interface.** Orders always appear in the same order, filling the grid from the top-left (empty squares stay visible); clicking anywhere on a building selects or targets it, the unit card has one layout for everything with men shown as 5/6, several selected units show their men too, roster badges no longer overlap, and unit names, titles and the doctrine panel use the game's display font.
- The camera no longer zooms out past the battlefield, and the land beyond the edge is darker.
- The studio card's boom now lands together with the logo.

**0.6.16**
- The order panel keeps the same size whatever is selected.
- The land beyond the map edge is much darker, so the battlefield stands out.

**0.6.15**
- **Emplacements face the front.** MG nests cover a 120° arc and bunkers a 90° slit; drag while placing to choose the direction. They no longer fire all round, so they can be flanked.
- **Buildings take up their real ground:** MG nests, bunkers and aid stations occupy 2×2 tiles and tier buildings 3×2. The placement shows every tile it will take, units cannot walk through a finished building, and the ground is freed when it falls.
- **Tier buildings recruit their own units.** Select a tier building to recruit its units there; they come out of its door. Headquarters can still recruit anything unlocked.
- **Reinforcing needs a base.** Squads reinforce only close to headquarters, a tier building or a bunker, and the new soldiers walk out of that base to join them.
- **Music for the result:** a triumphant orchestral theme on victory, a sad one on defeat.
- The result screen and pause menu titles always use the game's display font again (it now loads at startup).

**0.6.14**
- **Tech tiers.** You can no longer buy everything from the first minute. Headquarters starts with riflemen and engineers only; engineers raise tier buildings from the new **Base** menu (W) to unlock the rest: Tier 1 support (machine guns, mortars, BAR / light MG upgrade), Tier 2 anti-tank (bazooka / AT rifle teams and upgrade) and Tier 3 motor pool (tanks), each needing the one before. Locked units and upgrades show a padlock and say what to build. Each army's tier buildings have their own look.
- The enemy commander climbs the tiers too, saving manpower for each building, so early battles are infantry and support weapons and tanks arrive later.
- Defense and assault missions still start with everything unlocked.

**0.6.13**
- Every battle now starts with a single engineer squad and a little more manpower (600) instead of two rifle squads: fortify, then recruit your army.
- A deep, dramatic boom plays as the studio card comes up at startup.

**0.6.12**
- **Each army builds its own way.** Maharlika MG nests are sandbag rings round a water-cooled M1917, bunkers are coconut logs under palm fronds, and the aid station is a bamboo-and-nipa klinika. Imperial MG nests are log-lined pits round a finned Type 92, bunkers are round concrete pillboxes under camouflage netting, and the aid station is a khaki field tent.
- **Emplacements are priority targets.** Units whose weapons can really hurt a nest, bunker or aid station go for it first, and those that cannot (rifles against a bunker) leave it alone. The enemy commander sends tanks and anti-tank teams after any emplacement it sees, throws grenades at them and calls mortar barrages on them. They still take a few explosive hits to break.

**0.6.11**
- The headquarters no longer fly flags, until the factions' own flags and emblems are designed.

**0.6.10**
- **Headquarters in each army's style.** The Maharlika Punong Himpilan is a bahay na bato compound: terracotta tiled roof, capiz windows under the eaves, an adobe wall with a gate and sandbags. The Imperial Army Shireibu is a Japanese building with a dark grey tiled roof, pale ridge caps and deep eaves behind a timber fence.

**0.6.9**
- **Units have their army's own names:** Sundalo ng Maharlika, Inhinyero ng Maharlika, Ametralyadora M1917, Mortero 60mm, Pangontra-Tangke, and the Punong Himpilan (HQ); the Imperial Army fields Hohei, Kohei, Kikanjū, Hakugekihō and Taisensha-hei. The unit card shows the name with what the unit is beneath it (Rifle Squad, Mortar Team…). The per-squad hero names are gone.
- **Each army looks its own:** Maharlika soldiers wear wide round helmets and olive uniforms; Imperial soldiers wear smaller star helmets with a cloth neck flap and khaki. The Stuart is olive drab with a long 37mm gun and a sun emblem; the Chi-Ha wears three-colour camouflage with its off-centre turret, short 57mm and hoop aerial.
- **New result screen:** the victory and defeat statistics are shown head to head, each with a bar showing who came out ahead, and the battle HUD no longer shows through behind it.

**0.6.8**
- **Squads have names.** Every Maharlika squad is named after a hero (Pangkat Luna, Pangkat Bonifacio, Pangkat Rizal…) and every tank has one too (Tangke Kidlat, Tangke Agila…); the Imperial Army has numbered sections (Dai-ichi Buntai…) and named tanks. Names show on the roster cards, the unit card and in tooltips. More names can be added in `src/data/squadNames.ts`.
- **Soldiers look like soldiers:** seen from above with a helmet, uniform, pack and the weapon in hand, edged in their side's colour; pinned soldiers lie flat.
- **Bazooka:** a new firing sound that bangs the moment it fires (the old one only started after a delay), and the rocket explodes where it hits, with a flash, smoke and a blast you hear. Tank shells burst on impact too.

**0.6.7**
- Resources (manpower, munitions, fuel, population) are back at the bottom, in their own panel beside the orders.
- MG nests, bunkers and aid tents are smaller and drawn like the real thing: a ring of sandbags round a gun pit, an earth-covered bunker with a firing slit, an olive canvas tent.
- Each structure now has its own toughness. Tank guns, bazookas, AT rifles, grenades and mortars tear MG nests apart in a few hits; bunkers shrug off rifles and need tank guns or bazookas; aid tents go down quickly under any fire. Units also no longer ignore a nest or bunker that is shooting at them.

**0.6.6**
- New battle music: a fully orchestral war theme (strings, brass and war drums) replaces the old battle track.
- Unit voices are taken out for now; units answer with field sounds again.

**0.6.5**
- **Unit voices:** squads answer in Tagalog (Hukbong Maharlika) or Japanese (Imperial Army) when selected, ordered or sent back, and tank crews have lines of their own.
- **New HUD:** clear icons instead of text. Orders are square icon buttons with the hotkey in the corner; names, costs and details are in the tooltips. The selected unit shows a portrait, health, one pip per soldier and a few short status tags. Resources sit at the top right with the army as icon cards below them, and units on the map carry small icon plates instead of letters.
- **Beyond the map edge** the country carries on, hazed and darkening with distance, instead of a flat pattern.

**0.6.4**
- **A much bigger campaign:** nine missions across four chapters (The Invasion, Bataan, The Hills, Liberation), from the Lingayen landings in 1941 to San Fernando in 1945. Every mission is fought in two parts, each on its own battlefield or with a new objective.
- **Story:** each part opens with story scenes about one company and its people, and each mission ends with an aftermath. Press Next (or Enter / Space) to read on, or Skip (Esc) to go straight to the briefing. Scenes can carry voice-over files in `audio/story/`.
- **New music:** orchestral war music for the menus and for battle.
- Units no longer answer with a whistle or morse beeps; infantry answer with the rattle of their gear.

**0.6.3**
- **Build menu:** engineers get one Build button (**Q**) that opens their construction menu, so the order panel no longer overflows.
- **New structures:** MG nest (a machine gun that fires all round), bunker (a sturdy machine gun post where nearby squads can reinforce and pick up upgrades) and aid tent (heals soldiers nearby out of combat). Click one to see its details; engineers repair them. The enemy builds them too.
- **Rally flag:** the HQ's rally point is shown as a flag on the map, and a Rally Point button sits with the recruits. New units walk to it.
- **Reinforcements fill the queue:** each Reinforce press queues one soldier in the squad's queue slots, paid up front, three jobs at a time (an upgrade counts). Click a slot to call off a soldier and get the manpower back.
- **Tanks** can no longer retreat and are not repaired at the HQ: drive them back and have engineers fix them. Tanks slide along walls instead of snagging on corners, new units leave the HQ side by side instead of stacked, and a unit stuck for a few seconds gives up its move or retreat.
- The land beyond the map edge is now dense jungle and rock instead of a flat colour.
- Sound fixes: some rifle shots were silent, and explosions and unit sounds are more even in volume.

**0.6.2**
- Period sounds: typewriter keys for the interface, a crank field telephone for headquarters, morse signals when squads take orders, mechanical clanks for weapon teams and an officer's whistle for a retreat.
- Music loops smoothly: tracks crossfade into themselves instead of cutting or jumping at the end.

**0.6.1**
- Interface sounds: buttons, menus, cards and queue slots click when pressed; Deploy has its own sound.
- Units answer when selected or ordered: gear rattling for infantry, heavier clanks for weapon teams, an engine rev for tanks and a sound for headquarters.
- Ready for voice lines: drop recordings into `src/audio/sfx` named `voice_<faction>_<select|order|retreat>_<n>.ogg` (factions: `usaffe`, `ija`) and units speak them instead.

**0.6.0**
- **Sound and music.** Recorded gunfire for every weapon (Garand, Arisaka, carbines, BAR, machine guns, AT rifle, bazooka), tank guns, mortars, grenade and shell explosions, destroyed tanks and tank engines. Sounds are placed where they happen on screen, louder up close and quieter zoomed out.
- Orchestral music on the menus and in battle.
- Master, music and effects volume in the pause menu (remembered between sessions).

**0.5.4**
- Several units of the **same type** keep their shared abilities and special orders; only a mixed group is limited to attack-move, stop and retreat.
- The README shows the Taga Komando logo.

**0.5.3**
- **Repair order** for engineers (F): click it, then click the damaged tank, HQ or defense. Engineers do not fight while they repair or build.
- With a **mixed group selected**, only the common orders show (attack-move, stop, retreat).
- **Surrender** from the pause menu ends the battle on the defeat screen.
- The camera starts closer and zooms in further.

**0.5.2**
- Queues belong to units again: the queue slots show the selected unit's own jobs. Select the HQ (or nothing) for its recruits, or a squad for its upgrade and reinforcements. The HQ recruits up to three units at a time; squads upgrade and reinforce on their own.
- Roster cards at the top right show a squad reinforcing (+, green bar) or upgrading (⇪, orange bar).

**0.5.1**
- Tighter, more focused maps: every town and mission map is zoomed in (houses are two or three tiles across) and cropped around the town, close to the size of the original battlefields.
- The towns look fought over: shell craters in clusters along the front, sandbag lines dug in around the capture points, hedgerows between the paddies and ruined houses.
- Mission objectives, spawns and starting positions re-placed for the new layouts.

**0.5.0**
- **Thirteen new Luzon town maps** for skirmish: Calumpit, Plaridel, Pilar, Orani, Porac, Abucay, San Fernando, Dinalupihan, Hermosa, Guagua, Lingayen, Baliuag and Lubao. River towns with bridges, coastal towns, jungle villages, farmland and a big town, built from Watabou's Village Generator.
- Bases and capture points on the new maps are placed by driving distance, so both sides have an equal claim; every point has a local name (Poblacion, Simbahan, Palengke, Bodega, Gasolinahan…).
- **New maps for every campaign and Theater of War mission**, also from Watabou's generators: Intramuros is now a walled city on the bay with Fort Santiago in its walls (from the City Generator); Mount Samat, Route 3 and Layac Junction are new villages with hand-placed objectives; Withdrawal to Bataan is fought at Calumpit and Battle for Luzon at San Fernando.
- **One queue for everything:** recruiting, weapon upgrades and reinforcements all run in the three queue slots beside the orders, three jobs at a time. Each slot shows its progress (⇪ upgrade, + reinforcing); click one to cancel it.
- The skirmish battlefield list is a grid of map thumbnails.
- New app icon: TK with a kris.

**0.4.1** (0.4.0 was not released; everything since 0.3.5 is here)
- **Engineers** (Combat Engineers / Kohei Engineers) build **sandbags**, **barbed wire**, **tank traps** and **mines** (Z / X / C / V; drag to lay a line). An abandoned job is refunded.
- Engineers **repair** tanks, the HQ and damaged defenses: right-click the damaged one.
- **Defenses have health.** Bullets can't hurt them; explosives wear them down (sandbags take about six mortar hits, tank traps far more, wire much less). Click one to see its health.
- Several engineer squads can **build together**: select more engineers and right-click an unfinished job to send them to help.
- The HQ **production queue** is three slots beside the orders; click one to cancel it with a full refund.
- Reinforcements arrive more slowly (one soldier every 5.5 seconds).
- **Weapon upgrades** for rifle squads (T / Y): Bazooka or BAR for the Maharlika, Type 99 light MG or Type 97 AT rifle for the Imperial Army. One per squad; reinforcements replace the upgraded weapon first.
- The AI builds engineers to repair its tanks, and buys upgrades.
- New Taga Komando logo on the title screen and main menu, a new app icon, and the OGCZ logo on the startup screen.
- Attacking waves in Theater of War push forward instead of trading fire from long range.
- Destroying the enemy headquarters now wins in every mode.
- Hold **Space** and drag with the left mouse button to grab and move the map.

**0.3.5**
- Retreat is binding: a retreating squad takes no other orders until it reaches headquarters.
- **Unit counters:** every weapon now hits infantry, weapon teams, vehicles and buildings differently, so each unit has clear strengths and weaknesses (see *Unit roles*). Machine guns turn slowly, mortars cannot fire at close range, bazookas kill tanks faster.
- **In Progress panel:** units being recruited, queued units and squads reinforcing each show a progress bar, time left and (for purchases) cancel with refund. Roster cards and the unit card show reinforcement progress.

**0.3.4**
- The Filipino faction is now called **Hukbong Maharlika** (Maharlika Army).
- New victory conditions: **Capture Points**, **Annihilation** and **None**, chosen in Skirmish and in the Battle for Luzon operation.
- Campaign mission 1, *Withdrawal to Bataan*, is now an annihilation battle.
- **Right-click drag** to move and face: machine gun and mortar teams set up aimed that way, and their firing cone shows while you drag. **Set Up (D)** shows the live cone too.
- New in-game HUD: objective and timer top centre, unit roster top right, minimap, unit portrait card and command card along the bottom, with rich tooltips.
- Theater of War redesigned as four operation cards: City Defense, Hill Defense, Highway Assault and Historical Skirmish.
- New map: **Intramuros**, the walled city of Manila, for the new **Defend the City** operation (replaces Defend the Barrio).
- New terrain: fortress walls that cannot be climbed or seen through.

**0.3.0**
- The game is now called **Taga Komando**. Saved campaign progress and medals carry over.
- The splash screen now reads **OGCZ presents**.
- A crash in one frame no longer freezes the match; the game keeps running and shows the error.
- Desktop app: **F12** opens the developer console for bug reports.

**0.2.0**
- New main menu with a cinematic startup: studio card, title screen and a live battle in the background.
- Three modes: **Campaign** (4 historical missions), **Theater of War** (3 replayable operations with medals) and **Skirmish**.
- New mission types: **Defense** (survive waves) and **Offensive** (capture sectors in order against the clock).
- New maps: Mount Samat and Route 3.
- Mission briefings before every campaign and Theater of War mission.
- New result screens: Victory in gold on white, Defeat in red on black. Retry or continue straight from the result.

**0.1.0**
- First playable release: skirmish vs. AI, 2 factions, 10 unit types, 2 maps.

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

Needs Node.js and Git (see [Where to get things](#where-to-get-things)).

```bash
git clone https://github.com/og-cz/taga-komando.git
cd taga-komando
npm install
```

If npm skipped Electron's download step, fetch the runtime once:

```bash
node node_modules/electron/install.js
```

| Command | Result |
| --- | --- |
| `npm run app` | Build and open the game in a desktop window |
| `npm run dist` | Create the installer and portable `.exe` in `release/` |
| `npm run dev` | Development server with live reload (opens in a browser) |
| `npm test` | Run the game-logic tests, including full AI-vs-AI matches |
| `npm run typecheck` | Type-check the code |

**Project layout**

```
electron/   desktop window
src/data/   all unit, weapon, map and balance numbers (edit these to rebalance)
src/sim/    game rules: movement, combat, cover, suppression, vision, territory, economy
src/ai/     computer opponent
src/render/ drawing
src/ui/     menus and HUD
src/input/  mouse and keyboard
tests/      automated tests
tools/      map converter for Watabou village exports
```

**Adding a town map**

1. Open https://watabou.github.io/village-generator/, make a village you like, then right-click the map → *Export as* → *JSON*.
2. On the same page, open the browser console, paste in `tools/watabou-to-grid.js`, and run `copy(JSON.stringify(watabouToGrid(<the exported JSON>)))`.
3. Save the rows in `src/data/luzon/<town>.ts` and add an entry for the town in `src/data/luzonMaps.ts` (name, description, point names).
4. Run `npm test`. Bases and capture points are placed automatically, and the tests check that every point can be reached by infantry and tanks from both bases.

