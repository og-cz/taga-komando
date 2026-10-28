# Build from source

[Back to the README](../README.md)

Needs Node.js and Git (see [Where to get things](../README.md#where-to-get-things)).

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

## Project layout

```
electron/   desktop window
src/data/   all unit, weapon, map and balance numbers (edit these to rebalance)
src/sim/    game rules: movement, combat, cover, suppression, vision, territory, economy
src/ai/     computer opponent
src/render/ 2D drawing: units, markers, effects, and the flat battlefield used without WebGL
src/render3d/ the 3D battlefield (Three.js): ground, buildings, trees, props, structures, fire and smoke
src/ui/     menus and HUD
src/input/  mouse and keyboard
tests/      automated tests
tools/      map converter for Watabou village exports
```

## How the 3D battlefield fits in

The simulation (`src/sim`) knows nothing about drawing. `src/render/renderer.ts` reads the world each frame: when WebGL is available it hands the scene to `src/render3d/battlefield3d.ts`, which builds the terrain, buildings, trees and props once from the map and rebuilds only what the battle changes. Units, markers and 2D effects are still drawn on a canvas that is laid on the 3D ground, so houses and tree crowns stand in front of the troops behind them. The camera (`src/render/camera.ts`) is tilted; every screen ↔ world conversion goes through it, so input, HUD and minimap follow the tilt.

Development URL parameters (dev server only), for example `http://localhost:5173/?battle=san-fernando&spawn=us_riflemen&select=us_riflemen&zoom=2`:

| Parameter | Effect |
| --- | --- |
| `battle=<map>` | Start a skirmish on that map straight away |
| `faction=ija` | Play the Imperial side |
| `spawn=` / `enemy=` | Add our / enemy units by the HQ (unit ids, comma separated) |
| `select=<unit id>` | Select our first unit of that type |
| `zoom=<n>`, `focus=hq\|enemy`, `edge=1` | Camera |
| `reveal=1` | Lift the fog of war |
| `doctrine=<id>`, `cp=<n>`, `picker=1` | Doctrine, command points, open the chooser |
| `menu=defense\|base`, `frame=1` | Open an engineers' menu, leave spawned structures half built |
| `fire=1` | Light fires, a blast and a burst of machine-gun and cannon fire by the spawned units |
| `end=win\|lose` | End the battle at once (result screen) |
| `screen=menu\|campaign\|skirmish\|theater` | Skip the intro and open a menu screen |

## Adding a town map

1. Open https://watabou.github.io/village-generator/, make a village you like, then right-click the map → *Export as* → *JSON*.
2. On the same page, open the browser console, paste in `tools/watabou-to-grid.js`, and run `copy(JSON.stringify(watabouToGrid(<the exported JSON>)))`.
3. Save the rows in `src/data/luzon/<town>.ts` and add an entry for the town in `src/data/luzonMaps.ts` (name, description, point names).
4. Run `npm test`. Bases and capture points are placed automatically, houses are laid out along the roads on their own lots, the map is mirrored so both sides are equal, and the tests check that every point can be reached by infantry and tanks from both bases.
