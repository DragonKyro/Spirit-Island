# Spirit Island

Solo player Spirit Island - a digital adaptation of the cooperative board game where you play as a Spirit defending your island from colonizing Invaders.

The app enforces turn order, automates bookkeeping (fear, blight, invader actions), and tracks game state so you can focus on strategy without forgetting steps or misreading rules.

## Requirements
- Python 3.11+
- Arcade 3.3.3+

## Setup
```bash
conda activate arcade
```

## Run
```bash
python spirit_island.py
```

## Test
```bash
pytest
```

## Features

### Home Screen
- Play, Load Game, Rules, Stats, Options, Credits, Exit

### Game Setup
- Select one or more spirits (click to toggle)
  - Lightning's Swift Strike, Vital Strength of the Earth, River Surges in Sunlight, Shadows Flicker Like Flame
- Choose an adversary: Brandenburg-Prussia, England, Sweden (or none)
- Set adversary difficulty level (0-6)

### Gameplay
- Full turn sequence: Spirit Phase, Fast Powers, Invader Phase (Ravage/Build/Explore), Slow Powers, Time Passes
- Invader actions are fully automated (explore, build, ravage with blight cascade)
- Board displays pieces as colored sprites with a legend
- Scrollable event log tracks every action
- Step through phase-by-phase, full turns, or auto-play 10 turns

### Rules Reference
- Full rulebook transcribed and browsable by section with tab navigation

### Save/Load
- Save games at any point during play (saved as JSON in `saves/`)
- Load Game screen to browse, load, or delete saved games
- Auto-generated filenames with spirit name, turn number, and timestamp
