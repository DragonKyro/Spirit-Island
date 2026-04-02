"""Fear pool, fear cards, and terror level tracking."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum, auto


class TerrorLevel(Enum):
    LEVEL_1 = 1  # Win: no invaders at all
    LEVEL_2 = 2  # Win: no cities and no towns
    LEVEL_3 = 3  # Win: no cities


@dataclass
class FearCard:
    """A fear card with effects for each terror level."""
    name: str
    terror_1_effect: str
    terror_2_effect: str
    terror_3_effect: str


# Placeholder fear cards - the base game has many, but these capture the
# general flavor. Effects are text descriptions for now; will be coded later.
BASE_FEAR_CARDS = [
    FearCard(
        "Dahan Raid",
        "Each player may Push 1 Explorer from a land with Dahan.",
        "Each player may remove 1 Explorer from a land with Dahan.",
        "Each player may remove 1 Town from a land with Dahan.",
    ),
    FearCard(
        "Flee the Town",
        "Each player may Push 1 Explorer.",
        "Each player may Push up to 3 Explorers.",
        "Each player may remove 1 Town.",
    ),
    FearCard(
        "Scapegoats",
        "Each player may Push 2 Explorers.",
        "Each player may remove 1 Explorer and Push 2 Explorers.",
        "Each player may remove 1 Town and 1 Explorer.",
    ),
    FearCard(
        "Retreat",
        "Each player may Push 1 Explorer from each land with Dahan.",
        "Each player may Push 1 Explorer and 1 Town.",
        "Destroy 1 Town in each land with Dahan.",
    ),
    FearCard(
        "Tall Tales of Savagery",
        "Each player may Push 2 Explorers from lands with Dahan.",
        "Each player may remove 1 Explorer from a Coastal land.",
        "Each player may remove 1 Town from a Coastal land.",
    ),
    FearCard(
        "Dahan Enheartened",
        "Each player may Gather 1 Dahan.",
        "Each player may Gather up to 2 Dahan.",
        "Each player may Gather up to 2 Dahan. In 1 land, 2 Damage.",
    ),
    FearCard(
        "Emigration Accelerates",
        "Defend 1 in all lands with Dahan.",
        "Defend 3 in all lands with Dahan.",
        "Defend 3 in all lands with Dahan. Remove 1 Explorer from each land with Dahan.",
    ),
    FearCard(
        "Fear of the Unseen",
        "Each player may Push 1 Explorer from an Inland land.",
        "Each player may remove 1 Explorer from an Inland land.",
        "Each player may remove 1 Explorer and 1 Town from an Inland land.",
    ),
    FearCard(
        "Overseas Trade Disrupted",
        "Defend 3 in all Coastal lands.",
        "Defend 6 in all Coastal lands.",
        "Defend 6 in all Coastal lands. Remove 1 Explorer from each Coastal land.",
    ),
]


@dataclass
class FearSystem:
    """Tracks fear pool, earned fear cards, and terror level."""
    fear_markers_per_player: int = 4
    num_players: int = 1

    # The fear pool
    fear_pool: int = 0  # markers remaining to earn a card
    generated_fear: int = 0  # markers in the "generated" area

    # Fear deck and earned cards
    fear_deck: list[FearCard] = field(default_factory=list)
    earned_fear_cards: list[FearCard] = field(default_factory=list)
    fear_discard: list[FearCard] = field(default_factory=list)

    # Terror level divider positions (index in fear_deck where TL2 and TL3 start)
    terror_level_2_at: int = 3
    terror_level_3_at: int = 6

    # How many fear cards have been earned total (used to determine terror level)
    total_cards_earned: int = 0

    terror_level: TerrorLevel = TerrorLevel.LEVEL_1

    def setup(self, num_players: int = 1) -> None:
        """Initialize fear system for the game."""
        self.num_players = num_players
        self.fear_pool = self.fear_markers_per_player * num_players
        self.generated_fear = 0
        self.total_cards_earned = 0
        self.terror_level = TerrorLevel.LEVEL_1

        # Build fear deck: 9 cards, divided 3/3/3 with terror dividers between
        cards = list(BASE_FEAR_CARDS)
        random.shuffle(cards)
        self.fear_deck = cards[:9]
        self.earned_fear_cards = []
        self.fear_discard = []

        # Terror Level 2 divider after card 3, Terror Level 3 after card 6
        self.terror_level_2_at = 3
        self.terror_level_3_at = 6

    def add_fear(self, amount: int) -> list[str]:
        """Add fear to the pool. Returns list of event messages."""
        events: list[str] = []
        self.generated_fear += amount

        while self.generated_fear >= self.fear_pool:
            # Earned a fear card
            self.generated_fear -= self.fear_pool
            if self.fear_deck:
                card = self.fear_deck.pop(0)
                self.earned_fear_cards.append(card)
                self.total_cards_earned += 1
                events.append(f"Fear Card earned: {card.name}")

                # Check terror level advancement
                if (self.total_cards_earned >= self.terror_level_3_at
                        and self.terror_level != TerrorLevel.LEVEL_3):
                    self.terror_level = TerrorLevel.LEVEL_3
                    events.append("TERROR LEVEL 3 reached!")
                elif (self.total_cards_earned >= self.terror_level_2_at
                      and self.terror_level == TerrorLevel.LEVEL_1):
                    self.terror_level = TerrorLevel.LEVEL_2
                    events.append("TERROR LEVEL 2 reached!")

        return events

    def resolve_earned_fear_cards(self) -> list[tuple[FearCard, str]]:
        """Resolve all earned fear cards during the Invader Phase.

        Returns list of (card, effect_text) tuples.
        Currently effects are text descriptions only - TODO: implement actual effects.
        """
        resolved = []
        while self.earned_fear_cards:
            card = self.earned_fear_cards.pop(0)
            if self.terror_level == TerrorLevel.LEVEL_1:
                effect = card.terror_1_effect
            elif self.terror_level == TerrorLevel.LEVEL_2:
                effect = card.terror_2_effect
            else:
                effect = card.terror_3_effect
            resolved.append((card, effect))
            self.fear_discard.append(card)
        return resolved
