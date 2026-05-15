# Spirit Island — Web

Solo digital adaptation of the cooperative board game **Spirit Island**, deployed as a static web app via GitHub Pages.

The app enforces turn order, automates bookkeeping (fear, blight, invader actions), and tracks game state so you can focus on strategy.

Play it at: **https://klui.github.io/Spirit-Island/**

## Tech stack

- **TypeScript 5** + **React 18**
- **Vite 5** (dev server + production build)
- **Zustand** for game state
- **Vitest** for engine tests
- Inline **SVG** for all board art and sprites — no raster dependencies
- **GitHub Actions** → **GitHub Pages** auto-deploy on push to `main`

## Requirements

- Node.js 20+
- npm 10+

## Local development

```bash
npm install
npm run dev       # Vite dev server with HMR
npm run build     # type-check + production build to dist/
npm run preview   # serve dist/ locally to verify the production bundle
npm test          # run engine unit tests (vitest)
```

The dev server respects the configured base path (`/Spirit-Island/`). Visit `http://localhost:5173/Spirit-Island/` (or whichever port Vite chooses).

## Deploy

Push to `main`. The workflow in `.github/workflows/deploy.yml` runs tests, builds, and publishes `dist/` to GitHub Pages. Repository settings → Pages must be set to *Source: GitHub Actions*.

## Features

### Setup screen
- Pick one or more of the four low-complexity spirits: Lightning's Swift Strike, Vital Strength of the Earth, River Surges in Sunlight, Shadows Flicker Like Flame
- Choose an adversary (Brandenburg-Prussia, England, Sweden, or None) and a difficulty level (1-6)

### Game screen
- **Organic SVG island board** with 8 hex-shaped lands, terrain-colored, shared borders for adjacent lands, ocean ring around coastal lands, and dashed "bridges" for the non-hex adjacencies in the original board
- Inline SVG sprites for Explorers (red coats), Towns, Cities (walled keeps), Dahan (indigenous defenders with spears), Blight (thorny growths), and spirit Presence orbs in each spirit's color
- Side panel with the invader deck slots (Ravage / Build / Deck count), fear pool + terror level + win condition, blight card state, per-spirit summary (energy / card plays / hand / presence), and a live event log
- *Next Phase* and *Run Full Turn* controls — the invader phase, fear cascades, blight cascades, and win/loss checks run automatically

### Rules reference
- Browsable, sectioned rules text in-app

### Not yet implemented (v1 scope cut)
- Save / load (browser localStorage shim is a future addition)
- Player-driven power card play / power resolution (the engine auto-passes; matches the Python parent project's behavior)
- Higher-complexity spirits and additional adversaries beyond the four spirits / three adversaries shipped

## Project structure

```
src/
  main.tsx              # React entry
  App.tsx               # top-level view router
  engine/               # pure-TS game logic, no React imports — fully testable
    pieces.ts           # Terrain / InvaderType / Element / PowerSpeed types + constants
    land.ts             # Land + createSoloBoard()
    spirit.ts           # Spirit + ALL_SPIRITS (4 spirits)
    adversary.ts        # Adversary + ALL_ADVERSARIES (None + 3 adversaries)
    invaderDeck.ts      # invader card data + draw/advance
    fear.ts             # 50 fear cards, fear pool, terror levels
    blight.ts           # 24 blight cards
    invaderActions.ts   # explore / build / ravage
    gameState.ts        # central state, setup, blight cascade, win/loss check
    turnManager.ts      # phase orchestrator
  store/
    gameStore.ts        # Zustand store wrapping engine state
  components/
    HomeView.tsx
    SpiritSelectView.tsx
    GameView.tsx
    RulesView.tsx
    board/
      Map.tsx           # SVG <svg> root, lays out all 8 lands
      LandShape.tsx     # one land polygon + its pieces
      sprites/          # Explorer / Town / City / Dahan / Blight / Presence (SVG)
  data/
    boardLayout.ts      # hex layout, polygon vertices, terrain colors
    rulesContent.ts     # rules-reference sections (transcribed)
  styles/
    globals.css
tests/
  engine/               # vitest tests for engine logic
```
