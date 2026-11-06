# Spirit Island — Web

A digital table for the cooperative board game **Spirit Island** (base game): solo, hot-seat, or online with friends. Every rule is enforced and all Invader bookkeeping is automated; the game asks you whenever the rules give a choice.

Play it at: **https://klui.github.io/Spirit-Island/**

## What's in it

- **All 8 base-game Spirits** with their real Growth options, Presence Tracks (incl. bonus Elements, Reclaim One, "Any"), Innate Powers and Special Rules: Lightning's Swift Strike, River Surges in Sunlight, Vital Strength of the Earth, Shadows Flicker Like Flame, Thunderspeaker, A Spread of Rampant Green, Ocean's Hungry Grasp, Bringer of Dreams and Nightmares.
- **Every base-game Power Card** — 32 Unique, 36 Minor, 22 Major — with thresholds, "-or-" choices, Repeats, Range/Target rules, Fast/Slow timing and Elements.
- **Invaders**: Explore / Build / Ravage with Defend, Dahan counter-attacks, Blight with Cascades and Presence destruction, the Stage I/II/III deck (incl. Coastal Lands), Escalation.
- **Fear**: the 15 base Fear Cards at all three Terror Levels, the Terror dividers, and Fear victory.
- **Blight**: both base Blight Cards (Downward Spiral, Memory Fades to Dust), Healthy → Blighted Island.
- **Adversaries**: Brandenburg-Prussia, England and Sweden, levels 0–6 (setup changes, deck orders, High Immigration, Heavy Mining, Mining Rush, Proud & Mighty Capital…), with the rulebook's difficulty values and scoring.
- **Island boards A–D**, joined in the standard layouts for 1–4 players.
- **Online play** through Firebase: create a room, share the link, each player takes a seat and a Spirit; play is simultaneous where the rules allow.
- Solo games save automatically in the browser, with unlimited Undo.
- All art is original inline SVG (pieces, icons, terrain, Spirit emblems), inspired by the rulebook's iconography.

## Tech stack

- TypeScript 5 (strict) + React 18, Vite 5, Zustand 4, Vitest 2
- Firebase Realtime Database + anonymous Auth (online play only; loaded lazily)
- GitHub Actions → GitHub Pages

## Development

```bash
npm install
npm run dev          # http://localhost:5173/Spirit-Island/
npm test             # engine + network tests
npm run build        # type-check + production build → dist/
npm run preview      # serve dist/
npm run deploy:rules # deploy this app's Realtime Database rules (merged into the shared rules)
```

The project `.npmrc` pins the public npm registry so `package-lock.json` only references `registry.npmjs.org`.

In dev builds, `?demo=river,shadows&steps=30&seed=7&adv=sweden&lvl=2` starts a game and auto-plays some choices (handy for screenshots).

## How it works

The engine (`src/engine/`) is pure TypeScript. Game logic is written as generators that *yield* a decision whenever a player must choose; a game is fully determined by its setup (including an RNG seed) plus the ordered list of answers. That one design gives:

- **Undo** — replay the answer log minus its last entry.
- **Saves** — store setup + answers in `localStorage`.
- **Online play** — the host writes the setup to the room; every move is a tiny `{decision, choice, seat}` record in a write-once, ordered action log, and every device replays the same log. Stale or out-of-turn answers are ignored identically everywhere.

See `CLAUDE.md` for the code map and conventions.

## Credits

Spirit Island is designed by R. Eric Reuss and published by Greater Than Games. This is an unofficial fan project; card and rules text belong to their owners (card text transcribed via the community Spirit Island Card Katalog). Board geometry is schematic: every land, terrain, adjacency and Setup piece matches the printed boards, but land shapes are computed, not traced.
