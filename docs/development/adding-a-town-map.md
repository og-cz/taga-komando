[Docs](../README.md) › Development

# Adding a town map

1. Open https://watabou.github.io/village-generator/, make a village you like, then right-click the map → *Export as* → *JSON*.
2. On the same page, open the browser console, paste in `tools/watabou-to-grid.js`, and run `copy(JSON.stringify(watabouToGrid(<the exported JSON>)))`.
3. Save the rows in `src/data/luzon/<town>.ts` and add an entry for the town in `src/data/luzonMaps.ts` (name, description, point names).
4. Run `npm test`. Bases and capture points are placed automatically, and the tests check that every point can be reached by infantry and tanks from both bases.

---

← [Project layout](../development/project-layout.md) · [Docs home](../README.md)
