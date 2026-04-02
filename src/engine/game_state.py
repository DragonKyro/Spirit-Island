"""Central game state and setup logic."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum, auto

from src.engine.adversary import Adversary, NO_ADVERSARY
from src.engine.blight import BLIGHT_CARDS, BlightCard
from src.engine.fear import FearSystem
from src.engine.invader_deck import InvaderDeck, build_invader_deck
from src.engine.land import Land, create_solo_board, populate_board
from src.engine.pieces import Dahan, Invader, InvaderType
from src.engine.spirit import Spirit


class GamePhase(Enum):
    SPIRIT = auto()
    FAST_POWERS = auto()
    INVADER = auto()
    SLOW_POWERS = auto()
    TIME_PASSES = auto()
    GAME_OVER = auto()


class GameResult(Enum):
    IN_PROGRESS = auto()
    VICTORY = auto()
    DEFEAT_BLIGHT = auto()
    DEFEAT_NO_PRESENCE = auto()
    DEFEAT_NO_CARDS = auto()
    SACRIFICE_VICTORY = auto()


@dataclass
class GameState:
    """The complete game state."""
    # Setup config
    spirits: list[Spirit] = field(default_factory=list)
    adversary: Adversary = field(default_factory=lambda: NO_ADVERSARY)
    adversary_level: int = 0
    difficulty: int = 0

    # Board
    lands: list[Land] = field(default_factory=list)

    # Systems
    invader_deck: InvaderDeck = field(default_factory=InvaderDeck)
    fear_system: FearSystem = field(default_factory=FearSystem)
    blight_card: BlightCard | None = None

    # Game progress
    phase: GamePhase = GamePhase.SPIRIT
    turn_number: int = 0
    result: GameResult = GameResult.IN_PROGRESS
    event_log: list[str] = field(default_factory=list)

    def log(self, msg: str) -> None:
        self.event_log.append(msg)

    def setup(self) -> None:
        """Initialize the full game state according to the rules."""
        self.turn_number = 0
        self.result = GameResult.IN_PROGRESS
        self.event_log = []

        # Board
        self.lands = create_solo_board()
        populate_board(self.lands)
        self.log("Island board created and populated.")

        # Invader deck
        self.invader_deck = build_invader_deck()
        self.log(f"Invader deck built: {self.invader_deck.cards_remaining} cards.")

        # Fear system
        num_players = max(1, len(self.spirits))
        self.fear_system = FearSystem()
        self.fear_system.setup(num_players)
        self.log(f"Fear pool: {self.fear_system.fear_pool} markers.")

        # Blight card
        card = random.choice(BLIGHT_CARDS)
        self.blight_card = BlightCard(
            name=card.name,
            healthy_blight=card.healthy_blight,
            blighted_blight=card.blighted_blight,
            blighted_effect=card.blighted_effect,
            blighted_loss=card.blighted_loss,
        )
        self.blight_card.setup(num_players)
        self.log(f"Blight Card: {self.blight_card.name} "
                 f"({self.blight_card.blight_remaining} blight)")

        # Spirits
        for spirit in self.spirits:
            spirit.setup()
            self._place_starting_presence(spirit)
            self.log(f"Spirit '{spirit.name}' set up.")

        # Difficulty
        self.difficulty = self.adversary.get_difficulty(self.adversary_level)
        self.log(f"Adversary: {self.adversary.name} "
                 f"Level {self.adversary_level} (Difficulty {self.difficulty})")

        # Invaders' starting action: reveal top card, explore, place in build slot
        self._invaders_starting_action()

    def _place_starting_presence(self, spirit: Spirit) -> None:
        """Place a spirit's starting presence on the board."""
        for land_idx in spirit.starting_presence_lands:
            if 0 <= land_idx < len(self.lands):
                land = self.lands[land_idx]
                current = land.presence.get(spirit.name, 0)
                land.presence[spirit.name] = current + 1
                spirit.presence_on_board += 1

    def _invaders_starting_action(self) -> None:
        """Reveal top invader card, explore in those terrains, place card in build slot."""
        card = self.invader_deck.draw()
        if card is None:
            return

        self.log(f"Starting Explore: {card.label}")

        from src.engine.invader_actions import explore
        events = explore(self.lands, card.terrains)
        for e in events:
            self.log(e)

        # Place card directly in build slot (skipping ravage for first turn)
        self.invader_deck.build_card = card

    def add_blight_to_land(self, land_idx: int) -> list[str]:
        """Add blight to a land with cascade logic.

        Returns event messages. May trigger game loss.
        """
        events = []
        lands_to_blight = [land_idx]
        visited = set()

        while lands_to_blight:
            idx = lands_to_blight.pop(0)
            if idx in visited:
                continue
            visited.add(idx)

            land = self.lands[idx]
            already_had_blight = land.has_blight

            # Take blight from card
            if self.blight_card:
                ok = self.blight_card.remove_blight()
                if not ok:
                    self.result = GameResult.DEFEAT_BLIGHT
                    events.append("All blight exhausted - DEFEAT!")
                    return events
                if self.blight_card.is_flipped and not already_had_blight:
                    events.append(f"Blight Card flipped to 'Blighted Island'!")

            land.blight += 1
            events.append(f"Blight added to Land {land.number}")

            # Destroy 1 presence from each spirit in the land
            for spirit in self.spirits:
                if land.presence.get(spirit.name, 0) > 0:
                    land.presence[spirit.name] -= 1
                    spirit.presence_on_board -= 1
                    events.append(
                        f"  Presence of {spirit.name} destroyed in Land {land.number}"
                    )
                    if spirit.presence_on_board <= 0:
                        self.result = GameResult.DEFEAT_NO_PRESENCE
                        events.append(f"  {spirit.name} has no presence - DEFEAT!")

            # Cascade if the land already had blight
            if already_had_blight:
                events.append(f"  Cascade from Land {land.number}!")
                # Pick an adjacent land to cascade into
                adj = [i for i in land.adjacent_indices if i not in visited]
                if adj:
                    # Pick the one with most invaders (game-logical choice for auto-play)
                    cascade_target = min(adj, key=lambda i: self.lands[i].blight)
                    lands_to_blight.append(cascade_target)

        return events

    def check_victory(self) -> None:
        """Check if the current board state meets the victory condition."""
        if self.result != GameResult.IN_PROGRESS:
            return

        terror = self.fear_system.terror_level

        from src.engine.fear import TerrorLevel

        if terror == TerrorLevel.LEVEL_1:
            # No invaders on the island at all
            if not any(land.has_invaders for land in self.lands):
                self.result = GameResult.VICTORY
                self.log("VICTORY! No invaders remain (Terror Level 1)!")
        elif terror == TerrorLevel.LEVEL_2:
            # No cities and no towns
            if not any(land.town_count + land.city_count > 0 for land in self.lands):
                self.result = GameResult.VICTORY
                self.log("VICTORY! No Towns or Cities remain (Terror Level 2)!")
        elif terror == TerrorLevel.LEVEL_3:
            # No cities
            if not any(land.city_count > 0 for land in self.lands):
                self.result = GameResult.VICTORY
                self.log("VICTORY! No Cities remain (Terror Level 3)!")
