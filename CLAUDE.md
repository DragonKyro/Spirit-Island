# Spirit Island — Web App

## Project Overview

Digital table for the **base game** of Spirit Island (revised edition): solo, hot-seat (one person playing several Spirits) or online multiplayer via Firebase. Static web app on GitHub Pages. The engine enforces every rule and automates all bookkeeping; players are prompted whenever a rule offers a choice.

Scope: 8 base Spirits, all 90 base Power Cards (32 Unique / 36 Minor / 22 Major), 15 Fear Cards, 2 Blight Cards (Downward Spiral, Memory Fades to Dust), 3 Adversaries (levels 0–6), island boards A–D in the standard 1–4 player layouts. No expansions, no Scenarios, no Power Progression.

## Tech Stack

- TypeScript 5 (strict) + React 18, Vite 5, Zustand 4, Vitest 2
- Firebase Realtime Database + anonymous Auth for online play (lazy-loaded; the shared project `github-games-e7c7d`)
- Inline SVG for all drawn art; official card scans for card faces (see Assets)
- GitHub Actions → GitHub Pages on push to `main`

## Commands

```bash
npm install          # see "npm registry" below
npm run dev          # http://localhost:5173/Spirit-Island/
npm test             # vitest: engine + net
npm run build        # tsc -b && vite build → dist/
npm run deploy:rules # deploy database.rules.json (merged into the shared live rules)
```

Dev-only deep link: `?demo=river,shadows&steps=30&seed=7&adv=sweden&lvl=2` starts a local game and auto-answers N decisions (first non-pass option) — useful for screenshots.

### npm registry

This machine's global npm registry is DRW Artifactory and `registry.npmjs.org` is not reachable directly. `package-lock.json` must only reference `https://registry.npmjs.org/` (CI uses the project `.npmrc`). To add a dependency: `npm install <pkg> --registry=https://artifacts.drwholdings.com/artifactory/api/npm/ext-npm/`, then rewrite that prefix to `https://registry.npmjs.org/` in every `"resolved"` URL of the lockfile, and check `grep -c artifacts.drwholdings package-lock.json` is 0.

## Project Structure

```
src/
  App.tsx                 # view router (home / setup / game / rules / online) + online bridge
  engine/                 # pure TypeScript — no React, DOM, Vite or Firebase
    types.ts              # string-literal unions: Terrain, Element, PieceKind, SpiritId, …
    rng.ts                # seeded PRNG (state lives in GameState)
    island.ts             # boards A–D (terrain, adjacency, setup pieces, joinable sides) + 1–4 board layouts
    state.ts              # GameState / Space / SpiritState types + read-only queries
    decide.ts             # Decision / Option / Answer, choose(), parallel(), GameOver
    ops.ts                # primitives: damage, destroy, push/gather, blight+cascade, presence, fear, cards, targeting, win/loss
    cardData.ts           # Power Card data (cost, speed, elements, range/target, text)
    cards.ts              # Power Card effects keyed by card id
    spiritData.ts         # Spirit panels: growth, presence tracks, innates (thresholds), special rules, setup text
    innates.ts            # Innate Power effects
    fearCards.ts          # 15 Fear Cards (3 Terror Levels each)
    adversary.ts          # adversary levels: difficulty, fear deck sizes, deck orders, text
    setup.ts              # createState(), invader deck, adversary setup, starting Presence
    phases.ts             # sequence of play: Spirit → Fast → Invader → Slow → Time Passes
    game.ts               # driver: newGame / applyAnswer / replay / score
  net/                    # Firebase room transport (+ in-memory fake for tests); game-agnostic
  store/
    gameStore.ts          # engine wrapper: local save/undo, online apply via action log
    networkStore.ts       # rooms, lobby, presence, chat, action log
  components/
    HomeView, SetupView, GameView, RulesView
    game/Panels.tsx       # decision panel, invader board, spirit panel, log
    board/Map.tsx         # island SVG; board/sprites/ = piece art
    cards/                # PowerCard face, hover preview of card scans
    art/                  # all other SVG art (icons, terrain patterns, emblems, logo, favicon)
    online/               # online lobby UI
  data/
    boardGeometry.ts      # computed land polygons per board (board-local coords)
    boardLayout.ts        # places boards, builds wobbly SVG paths
    cardImages.ts         # URLs for public/cards scans
    rulesContent.ts       # rules reference text
public/cards/             # official card scans (base game only), named by engine id
tests/engine, tests/net
```

## Architecture Conventions

- **Engine is pure and deterministic.** A game = `GameSetup` (incl. seed) + ordered `Answer[]`. Never use `Math.random`, `Date`, or iteration over unordered sources in `src/engine/`; all randomness goes through `gs.rng`. This is what makes undo, saves and online sync work.
- **Choices are generators.** Any logic that may need a player decision is a generator (`Eff<T>`) and asks via `choose()` / `confirm()` (which auto-pick when only one option exists). Never block on input any other way. Decisions carry `owner` (spirit index, or -1 for "any player").
- **Invalid answers are ignored**, never thrown: `applyAnswer` checks the decision id, the option key and (online) the seat, so stale answers are dropped identically on every device.
- **Game over is an exception.** `checkEnd()` throws `GameOver` (victory / defeat / sacrifice victory) from wherever a condition is met; the driver catches it.
- **Card / spirit data and effects are split** (`cardData.ts` vs `cards.ts`, `spiritData.ts` vs `innates.ts`) to avoid import cycles. Every card id must have an effect (enforced by `tests/engine/coverage.test.ts`).
- **Special rules live where they apply** (e.g. Choke the Land with Green in Ravage/Build, Bringer's To Dream a Thousand Deaths inside damage/destroy, Ocean's Drowning in movePiece).
- **Views never touch engine internals directly**; they read `game.gs` from `useGameStore` and call `answer(d, k)`.
- **Types over enums**, exported `const` records for data.
- **Online:** host writes the setup as the match start record; each answer is `{d, k, s}` appended to a write-once action log. All app data lives under the `spirit-island` key of the shared database; `database.rules.json` only defines that key and `scripts/merge-db-rules.mjs` merges it into the live rules on deploy (never deploy a rules file that would replace other apps' keys).

## Assets

- Drawn art is inline SVG components (`size` prop + `viewBox`); new pieces go in `components/board/sprites/`, other art in `components/art/`.
- Exception: official card scans (from the sibling `spirit-island-card-katalog` repo) live in `public/cards/{powers,fears,blights}/<engine-id>.jpg`. Card art © Greater Than Games.

## Rules Sources

- `docs/Spirit Island Rules.pdf` — rules reference sheet (sequence of play, invader actions, blight, fear, powers, scoring, difficulty chart).
- Card text: `../spirit-island-card-katalog/src/db.ts`.
- Spirit panels and board facts were cross-checked against open-source implementations (spirit-island-builder, the Spirit Island TTS mod, rettigcd/spiritisland).

## When adding features

- Engine changes need a vitest test; run the fuzz suite (`tests/engine/fuzz.test.ts`) — it plays full random games for every Spirit, adversary and player count and checks replay determinism.
- Bump `GameSetup.v` if saved games / logs from older builds would replay differently.
