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


# ─── All 50 fear cards transcribed from card images ─────────────────────────

BASE_FEAR_CARDS = [
    FearCard(
        "Angry Mobs",
        "Each player may Replace 1 Town with 2 Explorer. 1 Fear per player who does.",
        "In each land with 2+ Explorer, Destroy 1 Explorer/Town per 2 Explorer.",
        "In each land with 2+ Explorer, Destroy 1 Invader per 2 Explorer.",
    ),
    FearCard(
        "Avoid the Dahan",
        "Invaders do not Explore into lands with at least 2 Dahan.",
        "Invaders do not Build in lands where Dahan outnumber Towns/Cities.",
        "Invaders do not Build in lands with Dahan.",
    ),
    FearCard(
        "Belief Takes Root",
        "Defend 2 in all lands with Sacred Site.",
        "Defend 2 in all lands with Sacred Site. Each Spirit gains 1 Energy per Sacred Site they have in lands with Invaders.",
        "Each player chooses a different land and removes up to 2 Health worth of Invaders per Sacred Site there.",
    ),
    FearCard(
        "Beset by Many Troubles",
        "In each land with Wilds/Beasts/Disease/Strife/Badlands, Defend 3.",
        "In each land with Wilds/Beasts/Disease/Strife/Badlands, or adjacent to 3+ such tokens, Defend 5.",
        "Every Wilds/Beasts/Disease/Strife/Badlands grants Defend 3 in its land and adjacent lands.",
    ),
    FearCard(
        "Civil Unrest",
        "On Each Board: Add 1 Strife to a Town/City in a land not matching a Ravage Card.",
        "On Each Board: Add 1 Strife to a Town/City in a land not matching a Ravage Card. Each Invader takes 1 Damage per Strife it has.",
        "On Each Board: Add 1 Strife. Each Invader takes 1 Damage per Strife it has.",
    ),
    FearCard(
        "Communities in Disarray",
        "Town/City each deal -1 Damage during Ravage. Invaders do not heal Damage at end of turn.",
        "Explorer/Town/City each deal -1 Damage during Ravage. Invaders do not heal Damage at end of turn.",
        "Explorer/Town/City each deal -2 Damage during Ravage. Invaders do not heal Damage at end of turn.",
    ),
    FearCard(
        "Dahan Attack",
        "Each player removes 1 Explorer from a land with Dahan.",
        "Each player chooses a different land with Dahan. 1 Damage per Dahan there.",
        "Each player chooses a different land with Town/City. Gather 1 Dahan into that land. Then, 2 Damage per Dahan there.",
    ),
    FearCard(
        "Dahan Enheartened",
        "Each player may Push 1 Dahan from a land with Invaders or Gather 1 Dahan into a land with Invaders.",
        "Each player chooses a different land. Gather up to 2 Dahan, then 1 Damage if Dahan are present.",
        "Each player chooses a different land. Gather up to 2 Dahan, then 1 Damage per Dahan present.",
    ),
    FearCard(
        "Dahan Gain the Edge",
        "Each player chooses a different land with Dahan. Defend 2.",
        "Each player chooses a different land with Dahan. 1 Damage and Defend 3.",
        "Each player chooses a different land with Dahan. 2 Damage and Defend 4.",
    ),
    FearCard(
        "Dahan on Their Guard",
        "In each land, Defend 1 per Dahan.",
        "In each land with Dahan, Defend 1, plus an additional Defend 1 per Dahan.",
        "In each land, Defend 2 per Dahan.",
    ),
    FearCard(
        "Dahan Raid",
        "Each player chooses a different land with Dahan. 1 Damage there.",
        "Each player chooses a different land with Dahan. 1 Damage per Dahan there.",
        "Each player chooses a different land with Dahan. 2 Damage per Dahan there.",
    ),
    FearCard(
        "Dahan Reclaim Fishing Grounds",
        "Each player chooses a different Coastal land with Dahan. 1 Damage per Dahan.",
        "Each player chooses a different Coastal land. Gather up to 1 Dahan. 1 Damage per Dahan.",
        "Each player chooses a different Coastal land. Gather up to 1 Dahan. 2 Damage per Dahan.",
    ),
    FearCard(
        "Dahan Threaten",
        "Each player adds 1 Strife in a land with Dahan.",
        "Each player adds 1 Strife in a land with Dahan. Invaders have -1 Health per Strife (min 1) this turn.",
        "Each player adds 1 Strife in a land with Dahan. In every land with Strife, 1 Damage per Dahan.",
    ),
    FearCard(
        "Daunted by the Dahan",
        "1 Fear per board with both Invaders and Dahan. Invaders do -6 Damage to Dahan (per land) during Ravage.",
        "1 Fear per board with both Invaders and Dahan. Lands with Dahan have Defend 3. Invaders do -6 Damage to Dahan (per land) during Ravage.",
        "1 Fear per board with both Invaders and Dahan. Lands with Dahan have Defend 3. Invaders do -6 Damage to Dahan (per land) during Ravage. Isolate all lands with Dahan.",
    ),
    FearCard(
        "Demoralized",
        "Defend 1 in all lands.",
        "Defend 2 in all lands.",
        "Defend 3 in all lands.",
    ),
    FearCard(
        "Depart the Dangerous Land",
        "Each player removes 1 Explorer from a land with Beasts, Disease, or 2+ Dahan.",
        "Each player removes 1 Explorer/Town from a land with Beasts, Disease, or 2+ Dahan.",
        "Each player removes up to 4 Health worth of Invaders from a land with Beasts, Disease, or 2+ Dahan.",
    ),
    FearCard(
        "Depopulation",
        "On Each Board: Replace 1 Town with 1 Explorer.",
        "On Each Board: Remove 1 Town.",
        "On Each Board: Remove 1 Town, or Replace 1 City with 1 Town.",
    ),
    FearCard(
        "Discord",
        "Each player adds 1 Strife in a different land with 2+ Invaders.",
        "Each player adds 1 Strife in a different land with 2+ Invaders. Each Invader takes 1 Damage per Strife it has.",
        "Each player adds 1 Strife in a different land with 2+ Invaders. Each Invader with Strife deals Damage to other Invaders in its land.",
    ),
    FearCard(
        "Distracted by Local Troubles",
        "On Each Board, in a land matching a Ravage Card: 1 Damage.",
        "Invaders do -1 Damage per Damage they have taken. On Each Board, in a land matching a Ravage Card: 1 Damage each to up to 2 Invaders.",
        "Invaders do -1 Damage per Damage they have taken. On Each Board, in two lands matching a Ravage Card: 2 Damage (per land).",
    ),
    FearCard(
        "Emigration Accelerates",
        "Each player removes 1 Explorer from a Coastal land.",
        "Each player removes 1 Explorer/Town from a Coastal land.",
        "Each player removes 1 Explorer/Town from any land.",
    ),
    FearCard(
        "Explorers Are Reluctant",
        "During the next normal Explore, skip the lowest-numbered land matching the Invader Card on each board.",
        "Skip the next normal Explore. During the next Invader Phase, draw an additional Explore Card.",
        "Skip the next normal Explore, but still reveal a card. Cards shift left as usual.",
    ),
    FearCard(
        "Fear of the Unseen",
        "Each player removes 1 Explorer/Town from a land with Beasts.",
        "Each player removes 1 Explorer/Town from a land with Sacred Site.",
        "Each player removes 1 Explorer/Town from a land with Sacred Site, or 1 City from a land with Beasts.",
    ),
    FearCard(
        "Flee from Dangerous Lands",
        "On Each Board: Push 1 Explorer/Town from a land with Wilds/Strife/Badlands.",
        "On Each Board: Remove 1 Explorer/Town from a land with Wilds/Strife/Badlands.",
        "On Each Board: Remove 1 Explorer/Town from any land, or Remove 1 City from a land with Wilds/Strife/Badlands.",
    ),
    FearCard(
        "Flee the Pestilent Land",
        "Each player removes 1 Explorer/Town from a land with Disease.",
        "Each player removes up to 3 Health of Invaders from a land with Disease, or 1 Explorer from an Inland land.",
        "Each player removes up to 5 Health of Invaders from a land with Disease, or 1 Explorer/Town from an Inland land.",
    ),
    FearCard(
        "Immigration Slows",
        "During the next normal Build, skip the lowest-numbered land matching the Invader Card on each board.",
        "Skip the next normal Build. The Build Card remains in place instead of shifting left.",
        "Skip the next normal Build. The Build Card shifts left as usual.",
    ),
    FearCard(
        "Isolation",
        "Each player removes 1 Explorer/Town from a land where it is the only Invader.",
        "Each player removes 1 Explorer/Town from a land with 2 or fewer Invaders.",
        "Each player removes an Invader from a land with 2 or fewer Invaders.",
    ),
    FearCard(
        "Mimic the Dahan",
        "Each player removes 1 Explorer/Town from a land with 2+ Dahan.",
        "Each player replaces 1 Explorer/Town with 1 Dahan in a land with 2+ Dahan.",
        "Each player replaces 1 Explorer/Town with 1 Dahan in a land with Dahan, or adjacent to 3+ Dahan.",
    ),
    FearCard(
        "Nerves Fray",
        "Each player adds 1 Strife in a land not matching a Ravage Card.",
        "Each player adds 2 Strife in a single land not matching a Ravage Card.",
        "Each player adds 2 Strife in a single land not matching a Ravage Card. 1 Fear per player.",
    ),
    FearCard(
        "Overseas Trade Seem Safer",
        "Defend 3 in all Coastal lands.",
        "Defend 6 in all Coastal lands. Invaders do not Build City in Coastal lands this turn.",
        "Defend 9 in all Coastal lands. Invaders do not Build in Coastal lands this turn.",
    ),
    FearCard(
        "Panic",
        "Each player adds 1 Strife in a land with Beasts/Disease/Wilds.",
        "Each player adds 1 Strife in a land with Beasts/Disease/Wilds. Invaders have -1 Health per Strife (min 1) this turn.",
        "Each player adds 1 Strife to an Invader. Invaders have -1 Health per Strife (min 1) this turn.",
    ),
    FearCard(
        "Panicked by Wild Beasts",
        "Each player adds 1 Strife in a land with or adjacent to Beasts.",
        "Each player adds 1 Strife in a land with or adjacent to Beasts. Invaders skip Explore and Build in lands with Beasts.",
        "Each player adds 1 Strife in a land with or adjacent to Beasts. Invaders skip all normal Actions in lands with Beasts.",
    ),
    FearCard(
        "Plan for Departure",
        "Each player may Gather 1 Town into a Coastal land.",
        "Each player may Gather 1 Explorer/Town into a Coastal land. Defend 2 in all Coastal lands.",
        "Each player may Gather 2 Explorer/Town into a Coastal land. Defend 4 in all Coastal lands.",
    ),
    FearCard(
        "Quarantine",
        "Explore does not affect Coastal lands.",
        "Explore does not affect Coastal lands. Lands with Disease are not a source of Invaders when Exploring.",
        "Explore does not affect Coastal lands. Invaders do not act in lands with Disease.",
    ),
    FearCard(
        "Restlessness",
        "Each player Pushes up to 1 Explorer/Town from a land not matching a Build card.",
        "Each player Pushes up to 3 Explorer/Town from a land not matching a Build card.",
        "Each player Removes up to 3 Explorer/Town from a land not matching a Build card.",
    ),
    FearCard(
        "Retreat",
        "Each player may Push up to 2 Explorer from an Inland land.",
        "Each player may Push up to 3 Explorer/Town from an Inland land.",
        "Each player may Push any number of Explorer/Town from one land.",
    ),
    FearCard(
        "Scapegoats",
        "Each Town destroys 1 Explorer in its land.",
        "Each Town destroys 1 Explorer in its land. Each City destroys 2 Explorer in its land.",
        "Destroy all Explorer in lands with Town/City. Each City destroys 1 Town in its land.",
    ),
    FearCard(
        "Seek Company",
        "On Each Board: Gather up to 1 Explorer into a land with 2+ Invaders.",
        "On Each Board: Gather up to 3 Explorer/Town from a single land into a land with 2+ Invaders.",
        "On Each Board: Gather up to 4 Explorer/Town (total) into lands with 2+ Invaders.",
    ),
    FearCard(
        "Seek Safety",
        "Each player may Push 1 Explorer into a land with more Town/City than the land it came from.",
        "Each player may Gather 1 Explorer into a land with Town/City, or Gather 1 Town into a land with City.",
        "Each player may remove up to 3 Health worth of Invaders from a land without City.",
    ),
    FearCard(
        "Sense of Dread",
        "On Each Board: Remove 1 Explorer from a land matching a Ravage Card.",
        "On Each Board: Remove 1 Explorer/Town from a land matching a Ravage Card.",
        "On Each Board: Remove 1 Invader from a land matching a Ravage Card.",
    ),
    FearCard(
        "Spreading Timidity",
        "Each player chooses a land to Isolate.",
        "Each player chooses a different land to Isolate. Defend 2 in those lands.",
        "Each player chooses a different land to Isolate. Defend 4 in those lands.",
    ),
    FearCard(
        "Struggles over Farmland",
        "Each player adds 1 Strife in a land with Blight.",
        "Each player adds 1 Strife to a Town or adds 1 Strife in a land with Blight.",
        "Each player adds 1 Strife. In each land with Blight, 1 Invader with Strife does Damage to other Invaders.",
    ),
    FearCard(
        "Supply Chains Abandoned",
        "On Each Board: Isolate one land.",
        "On Each Board: Isolate one land. If Town/City are present, skip all Build Actions there.",
        "On Each Board: Isolate two lands. In each, if Town/City are present, skip all Build Actions there.",
    ),
    FearCard(
        "Tall Tales of Savagery",
        "Each player removes 1 Explorer from a land with Dahan.",
        "Each player removes 2 Explorer or 1 Town from a land with Dahan.",
        "Remove 2 Explorer or 1 Town from each land with Dahan. Then, remove 1 City from each land with 2+ Dahan.",
    ),
    FearCard(
        "Theological Strife",
        "Each player adds 1 Strife in a land with Sacred Site.",
        "Each player adds 1 Strife in a land with Sacred Site. Each Spirit gains 1 Energy per Sacred Site they have in lands with Invaders.",
        "Each player adds 1 Strife in a land with Sacred Site. Each Invader with Strife deals Damage to other Invaders in its land.",
    ),
    FearCard(
        "Too Many Monsters",
        "Each player removes 1 Explorer/Town from a land with Beasts.",
        "Each player removes 1 Explorer and 1 Town from a land with Beasts or 1 Explorer from a land adjacent to Beasts.",
        "Each player removes 2 Explorer and 2 Town from a land with Beasts or 1 Explorer/Town from a land adjacent to Beasts.",
    ),
    FearCard(
        "Trade Suffers",
        "Invaders do not Build in lands with City.",
        "Each player may replace 1 Town with 1 Explorer in a Coastal land.",
        "Each player may, in a Coastal land, replace 1 City with 1 Town, or 1 Town with 1 Explorer.",
    ),
    FearCard(
        "Tread Carefully",
        "Each player may choose a land with Dahan or adjacent to 5+ Dahan. Invaders do not Ravage there this turn.",
        "Each player may choose a land with Dahan or adjacent to 3+ Dahan. Invaders do not Ravage there this turn.",
        "Each player may choose a land with Dahan or adjacent to Dahan. Invaders do not Ravage there this turn.",
    ),
    FearCard(
        "Unrest",
        "Each player adds 1 Strife to a Town.",
        "Each player adds 1 Strife to a Town. Invaders have -1 Health per Strife (min 1) this turn.",
        "Each player adds 1 Strife to an Invader. Invaders have -1 Health per Strife (min 1) this turn.",
    ),
    FearCard(
        "Unsettled",
        "On Each Board: Choose a land with Beasts/Strife/Wilds. Downgrade 1 Town/City there.",
        "On Each Board: Choose a land with Beasts/Strife/Wilds. Downgrade 1 Town/City there or skip the next Build Action there.",
        "On Each Board: Choose a land with Beasts/Strife/Wilds. Remove 1 Invader there or skip the next Build Action there.",
    ),
    FearCard(
        "Wary of the Interior",
        "Each player removes 1 Explorer from an Inland land.",
        "Each player removes 1 Explorer/Town from an Inland land.",
        "Each player removes 1 Explorer/Town from any land.",
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
