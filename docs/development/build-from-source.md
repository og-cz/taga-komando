[Docs](../README.md) › Development

# Build from source

Needs Node.js and Git (see [Get the game](../getting-started/get-the-game.md)).

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

---

← [Credits](../help/credits.md) · [Docs home](../README.md) · [Project layout](../development/project-layout.md) →
