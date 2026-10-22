# Changelog

[Back to the README](../README.md)

**Unreleased**
- **A 3D battlefield.** The battle is now drawn with Three.js: an elevated, tilted tactical camera over textured ground; buildings with real walls, doors and windows and roofs of clay tile, nipa or rusted iron, some broken open by shellfire and smouldering; palms, broadleaf trees, banana plants and hedgerow bushes; stone walls, sandbag lines, wire, tank traps, rubble and timber; headquarters, tier buildings, MG nests, bunkers and aid tents as solid buildings that rise while they are built. A low evening sun casts real shadows, tree crowns stand over the troops, and fog of war lies over everything.
- **Fire and smoke.** Blasts flash, throw sparks and dirt and leave scorch marks; big ones start fires. Knocked-out tanks and fallen emplacements burn. Fires flicker with hot cores and embers, light the ground and walls around them orange, and pour out smoke that drifts with the wind. Without WebGL the game falls back to the flat 2D battlefield.
- **Real anti-tank guns.** The anti-tank unit on both sides is now a towed 37mm gun and its crew (set it up, then it stops tanks); the bazooka and the anti-tank rifle stay as rifle-squad upgrades. The Tanggulang Bayan doctrine brings a heavy 57mm gun.
- **Engineers in the pith helmet.** Maharlika headgear keeps to the army's own: the straw Baliwag hat, the peaked cap, the pith helmet and the kepi.
- **Order grid in fixed rows.** Every unit's orders sit in the same three rows: attack-move, stop, reinforce and retreat on top, the engineers' Base and Build menus in the middle, the unit's own abilities (repair, grenade, set up, barrage) at the bottom. Tabs over the grid jump straight to the headquarters or any tier building you have built, to recruit there.
- **Screen layout.** The map sits bottom left with round buttons on its frame (next idle infantry, next idle vehicle, help, menu). The information panel holds the unit's portrait, health, men, kit and description, then its upgrade slots and, at its right end, the production queue. Above the panel sit the doctrine's command points and call-ins (left) and the resources (right). Orders sit bottom right under the building tabs, and messages appear above the map.
- **Pause menu** is a short list (Resume, Controls, Sound, Surrender) over the greyed-out battle; controls and sound open on their own page, and surrendering asks once more. Scrollbars match the steel interface.
- **Fixes:** markers, point circles and unit badges no longer drift off the 3D map after the window is resized; the battle behind the main menu no longer shows battle markers and labels; the resources bar no longer covers the pause menu or the doctrine panel on narrow windows.
- **Upgrade slots.** A unit's weapon upgrades have their own slots beside its card, shown only when it has something to upgrade.
- **Upgrades you can see.** A squad taking a weapon upgrade shows a gold badge that fills as it completes, and the job column beside the unit card only appears while something is being recruited, reinforced or upgraded.

**0.7.0**
- **Doctrines.** Five per army, each led by a commander with a painted portrait and its own banner, special unit and two commander call-ins: charges, accuracy and defence orders, artillery barrages, spotter planes, paradrops, free militia squads, ambushes and minefields. Command points are earned in combat and over time. The enemy commander chooses a doctrine and uses its call-ins too.
- **Building like a real engineer company.** Structures go up as a frame straight away and take up their whole footprint. How far along a frame is is how much punishment it can take; any engineer can carry on an unfinished job (right-click it, or use Repair on it), and the enemy can knock it down. MG nests, bunkers and aid stations go up only on ground your army holds, at most 4, 3 and 2 at a time; sandbags, wire, tank traps and mines can be laid anywhere.
- **A smarter enemy.** It flanks MG nests and bunkers outside their arc and grenades them instead of walking into the gun, sends tanks and anti-tank teams against them, shells them with mortars and artillery, recruits at its tier buildings and builds only on its own ground.
- **Fair maps.** Every generated skirmish map is now mirrored: both bases, both sets of resources and the flanking victory points are exact mirror images, and the central victory point sits in the very middle.
- **Reinforcements pause** when a squad is too far from a base (or retreating) instead of being cancelled, and carry on when it is back.
- **Retreating troops** run without looking back, cannot be pinned and take only about half the damage.
- **Filipino arms and names.** The Maharlika carry the Riple Kalayaan, Karabina Kalayaan, Ripleng Awtomatiko, Kanyong Balikat and the Tangke Tamaraw; the Imperial Army's units all follow one naming style (Teikoku Hohei, Teikoku Kōhei…). The Strong vs / Weak vs lists are gone: find out what works on the battlefield.
- **Looks and feel.** Doctrine uniforms (rayadillo, camisa with bandana, paratrooper green), walking soldiers, tank track prints, explosions with flying earth, pressure rings, scorch marks and a little screen shake, scaffolding on buildings under construction, doctrine banners on the tier buildings and a busier headquarters compound.
- **Revolutionary army dress.** The Maharlika march in rayadillo under woven Baliwag straw hats with the black ribbon and national cockade; engineers wear the salakot and undyed cloth, Heneral Luna's men the officer's cap.
- **Battle report.** The result screen is a typed report clipped to a board, its verdict stamped in ink, the battle's recon maps beside it.
- **A new look, battlefield and interface.** The battlefield is drawn with depth: ground blended from grass, mud and dirt instead of squares, hipped roofs of clay tile, nipa thatch or rusted iron lit from one side, walls with height, palms and jungle trees whose crowns stand over the soldiers, and every building, wall, tree, tank and soldier casting a shadow. Evening light, a soft vignette and soft-edged fog of war. The interface is rebuilt as field gear: an olive-drab steel console, a recon map on paper with its own tab, hand-tinted photographs of the selected soldiers, typed orders, stamped resource plates and switch-like order buttons. The menus match: steel mission plates, paper map previews and briefings, and the doctrine chooser as a dossier of files.
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
