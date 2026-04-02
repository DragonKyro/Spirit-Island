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
  views/                  # Arcade Views (screens)
    home_view.py          # Home/menu screen
  engine/                 # Game logic (rules, state, turn order)
tests/                    # pytest tests
```

## Architecture Conventions
- **Views** (`src/views/`) - Each screen is an `arcade.View` subclass. Views handle rendering and UI; they delegate game logic to the engine.
- **Engine** (`src/engine/`) - Pure game logic with no Arcade dependency. This keeps rules testable without a GUI.
- **Constants** (`src/constants.py`) - Shared values (colors, sizes, layout). Avoid magic numbers in view/engine code.

## Game Rules Reference
The Spirit Island rules PDF is in the project root. Key mechanics for implementation:
- **Turn order**: Spirit Phase (Growth -> Energy -> Play Cards) -> Fast Powers -> Invader Phase (Blight Effect -> Fear -> Ravage -> Build -> Explore -> Advance Cards) -> Slow Powers -> Time Passes
- **Solo mode**: Single board, can self-target "Another Spirit" powers (no extra benefit)
- **Win**: Meet Terror Level victory condition (TL1: no invaders, TL2: no cities/towns, TL3: no cities)
- **Lose**: All blight gone from card, spirit has no presence, or invader deck empty on explore
