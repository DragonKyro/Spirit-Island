# Spirit Island — Solo Web App

## Project Overview

Single-player digital adaptation of the Spirit Island board game, built as a static web app deployable to GitHub Pages. Automates turn order, rule enforcement, and game-state bookkeeping so the player can focus on strategy.

## Tech Stack

- **TypeScript 5** (strict mode) + **React 18**
- **Vite 5** — dev server + bundler
- **Zustand 4** — game state store
- **Vitest 2** — engine unit tests
- Inline **SVG** for all board art and sprites (no raster assets)
- **GitHub Actions** → **GitHub Pages** auto-deploy on push to `main`

## Commands

```bash
npm install      # install deps
npm run dev      # Vite dev server (with HMR) at http://localhost:5173/Spirit-Island/
npm run build    # tsc -b && vite build → dist/
npm run preview  # serve dist/ for production-bundle smoke test
npm test         # run vitest engine tests
```

The Vite `base` is `/Spirit-Island/` so the bundle works under the GitHub Pages URL `https://klui.github.io/Spirit-Island/`. Local dev also serves under that prefix.

## Project Structure

```
src/
  main.tsx              # React entry
  App.tsx               # view router (home / select / game / rules)
  engine/               # pure TypeScript — no React, no DOM, no Vite
    pieces.ts           # Terrain/InvaderType/Element/PowerSpeed unions + INVADER_HEALTH/DAMAGE/FEAR constants
    land.ts             # Land + adjacency + createSoloBoard() + populateBoard()
    spirit.ts           # Spirit + the 4 low-complexity spirits in ALL_SPIRITS
    adversary.ts        # Adversary + the 3 adversaries (+ "No Adversary") in ALL_ADVERSARIES
    invaderDeck.ts      # InvaderCard + deck composition + draw/advance
    fear.ts             # 50 fear cards (BASE_FEAR_CARDS) + FearSystem + terror thresholds
    blight.ts           # 24 blight cards (20 standard + 4 still-healthy)
    invaderActions.ts   # explore / build / ravage logic
    gameState.ts        # central state, setup, blight cascade, win/loss check
    turnManager.ts      # phase orchestrator (Spirit → Fast → Invader → Slow → Time Passes)
  store/
    gameStore.ts        # Zustand store wrapping engine; bumps tick after each action to drive re-renders
  components/
    HomeView.tsx
    SpiritSelectView.tsx
    GameView.tsx        # board + right sidebar (invader/fear/blight/spirit/log panels)
    RulesView.tsx
    board/
      Map.tsx           # <svg> root, ocean, bridges, 8 land shapes
      LandShape.tsx     # one land polygon + its sprites in a small grid
      sprites/          # Explorer / Town / City / Dahan / Blight / Presence (each is one SVG component)
  data/
    boardLayout.ts      # hex layout math, polygon vertices, terrain fills, NON_HEX_BRIDGES list
    rulesContent.ts     # rules sections (transcribed)
  styles/
    globals.css         # CSS vars: --jungle/--mountain/--sands/--wetland, --presence-*, panel colors
tests/
  engine/
    invaderActions.test.ts
    fear.test.ts
    blight.test.ts
    turnManager.test.ts
```

## Architecture Conventions

- **Engine is pure TypeScript.** Files in `src/engine/` import nothing from React, the DOM, or Vite. This keeps rules testable in vitest without a renderer. Logic operates on plain data; mutation is fine because the store re-renders via a `tick` counter.
- **Views never touch the engine directly.** Components read state and dispatch actions through the Zustand store (`useGameStore`).
- **Types over enums.** Use TypeScript string-literal unions (`type Terrain = 'JUNGLE' | ...`) rather than `enum`. They serialize cleanly and don't need `.name` workarounds.
- **Data tables are exported `const` records.** Spirits, adversaries, fear cards, blight cards: each lives next to its types in the engine module.
- **All sprites and board shapes are inline SVG components.** No PNG/JPG assets. Each sprite component takes a `size` prop and uses `viewBox` for scaling. Colors come from CSS variables in `styles/globals.css` where appropriate.
- **The board is hex-tiled.** 8 lands laid out in 2 rows of 4 hexes (coastal row + offset inland row). Hex math lives in `data/boardLayout.ts`. Where the source engine's adjacency includes non-hex neighbors (asymmetric edges from the original Python data), dashed "bridge" lines connect them visually.
- **Map is a single SVG.** All 8 lands and the ocean render inside one `<svg viewBox="0 0 800 500">`. The SVG `<defs>` (gradients, patterns) is defined once in `Map.tsx` and referenced by id from `LandShape.tsx`.

## Game Rules Reference

- **Solo board**: 8 lands. Lands 1-4 are coastal (touch the ocean), 5-8 are inland.
- **Terrains** (by land index): `[JUNGLE, MOUNTAIN, SANDS, WETLAND, JUNGLE, MOUNTAIN, SANDS, WETLAND]`.
- **Turn order**: Spirit Phase (Growth → Energy → Play Cards) → Fast Powers → Invader Phase (Blight Effect → Fear → Ravage → Build → Explore → Advance Cards) → Slow Powers → Time Passes.
- **Win** (by Terror Level): TL1 = no invaders; TL2 = no towns/cities; TL3 = no cities.
- **Lose**: all blight off the card, any spirit with no presence, or empty invader deck on explore.

## Current State (v1)

- Invader behavior is fully automated (explore, build, ravage with cascade, fear generation, terror advancement, win/loss detection).
- Player actions (growth choices beyond the auto-pick, power card plays, power resolution) are stubbed — the game plays as if the player always passes. Matches the parent Python project's behavior. UI hooks exist (Run Full Turn / Next Phase buttons), so adding interactive growth/card play is a localized refactor.
- Save/load is intentionally not implemented in v1. Adding it would mean a `localStorage` shim that JSON-serializes `GameState` (all engine types are JSON-friendly).

## Deploying

Push to `main`. The `deploy.yml` workflow runs tests, builds, and publishes to Pages via `actions/deploy-pages`. Repo settings → Pages must be set to *Source: GitHub Actions*.

## When adding features

- Engine changes go in `src/engine/` and **must** come with a vitest test. The engine is the cheapest part to test.
- New sprite art = new file under `src/components/board/sprites/`. Match the existing pattern (SVG `viewBox` with `size` prop).
- New view = new file under `src/components/` and a case in `App.tsx`'s view switch.
- Don't reach for new assets directories. SVG inline.
