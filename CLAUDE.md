# Spirit Island - Digital Solo Player

## Project Overview
A single-player digital adaptation of the Spirit Island board game built with Python and Arcade (3.3.3). The goal is to automate turn order, rule enforcement, and game state so the player can focus on strategy.

## Tech Stack
- **Python 3.11** (conda env: `arcade`)
- **Arcade 3.3.3** - game framework with GUI widgets
- **pytest 9.0.2** - testing

## Running
```bash
conda activate arcade
python spirit_island.py
```

## Testing
```bash
conda activate arcade
pytest
```

## Project Structure
```
spirit_island.py          # Entry point
src/
  main.py                 # Window creation and startup
  constants.py            # Shared constants (colors, dimensions)
  rules_content.py        # Transcribed rulebook text by section
  views/                  # Arcade Views (screens)
    home_view.py          # Home/menu screen
    spirit_select_view.py # Spirit + adversary + difficulty selection
    game_view.py          # Main game board, event log, controls
    rules_view.py         # Rules reference with tab navigation
    load_view.py          # Browse/load/delete saved games
  engine/                 # Game logic (rules, state, turn order)
    pieces.py             # Invader, Dahan, PowerCard, Element enums
    land.py               # Land, board creation, adjacency
    invader_deck.py       # Stage I/II/III cards, draw/advance slots
    fear.py               # Fear pool, terror levels, fear cards
    blight.py             # Blight card with flip/cascade
    spirit.py             # Spirit class + 4 low-complexity spirit defs
    adversary.py          # Brandenburg-Prussia, England, Sweden + levels
    invader_actions.py    # Explore, Build, Ravage logic
    game_state.py         # Central state, setup, blight cascade, win/loss
    turn_manager.py       # Full turn sequence orchestration
    save_load.py          # JSON serialization/deserialization for saves
tests/                    # pytest tests
assets/
  pieces/                 # SVG sprites: explorer, town, city, dahan, blight, presence, etc.
  icons/                  # SVG element icons: sun, moon, fire, air, water, earth, plant, animal
  board/                  # SVG island board
saves/                    # Saved game JSON files (gitignored except .gitkeep)
```

## Architecture Conventions
- **Views** (`src/views/`) - Each screen is an `arcade.View` subclass. Views handle rendering and UI; they delegate game logic to the engine.
- **Engine** (`src/engine/`) - Pure game logic with no Arcade dependency. This keeps rules testable without a GUI.
- **Constants** (`src/constants.py`) - Shared values (colors, sizes, layout). Avoid magic numbers in view/engine code.
- **Text rendering** - Always use `arcade.Text` objects (created once, redrawn each frame). Never use `arcade.draw_text()` as it triggers a performance warning in Arcade 3.3.3.
- **Piece rendering** - Board pieces are drawn as colored sprite textures (circles/squares), not text labels. A legend maps shapes/colors to piece types.
- **Save files** - JSON format in `saves/`. Serialization is in `save_load.py`. All game state including spirits, lands, invader deck, fear system, blight card, and event log is preserved.

## Current State
- Invader behavior is fully automated (explore, build, ravage, blight cascade, fear generation, terror level advancement).
- Player actions (growth choices, power card plays, power resolution) are stubbed with TODO markers - the game plays itself as if the player always passes.
- Multi-spirit selection is supported in the setup screen.

## Game Rules Reference
The Spirit Island rules PDF is in the project root. Key mechanics for implementation:
- **Turn order**: Spirit Phase (Growth -> Energy -> Play Cards) -> Fast Powers -> Invader Phase (Blight Effect -> Fear -> Ravage -> Build -> Explore -> Advance Cards) -> Slow Powers -> Time Passes
- **Solo mode**: Single board, can self-target "Another Spirit" powers (no extra benefit)
- **Win**: Meet Terror Level victory condition (TL1: no invaders, TL2: no cities/towns, TL3: no cities)
- **Lose**: All blight gone from card, spirit has no presence, or invader deck empty on explore
