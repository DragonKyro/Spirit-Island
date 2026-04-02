"""Invader deck and invader card management."""

from __future__ import annotations

import random
from dataclasses import dataclass, field
from enum import Enum, auto

from src.engine.pieces import Terrain


class InvaderStage(Enum):
    I = 1
    II = 2
    III = 3


@dataclass
class InvaderCard:
    stage: InvaderStage
    terrains: list[Terrain]
    has_escalation: bool = False  # Stage II cards can have escalation icons

    @property
    def label(self) -> str:
        names = "/".join(t.name.title() for t in self.terrains)
        return f"Stage {self.stage.value}: {names}"

    def matches_terrain(self, terrain: Terrain) -> bool:
        return terrain in self.terrains


# All possible invader cards in the base game.
# Stage I: single terrain
# Stage II: single terrain (with escalation flag)
# Stage III: two terrains

STAGE_I_CARDS = [
    InvaderCard(InvaderStage.I, [Terrain.JUNGLE]),
    InvaderCard(InvaderStage.I, [Terrain.MOUNTAIN]),
    InvaderCard(InvaderStage.I, [Terrain.SANDS]),
    InvaderCard(InvaderStage.I, [Terrain.WETLAND]),
]

STAGE_II_CARDS = [
    InvaderCard(InvaderStage.II, [Terrain.JUNGLE], has_escalation=True),
    InvaderCard(InvaderStage.II, [Terrain.MOUNTAIN], has_escalation=True),
    InvaderCard(InvaderStage.II, [Terrain.SANDS], has_escalation=True),
    InvaderCard(InvaderStage.II, [Terrain.WETLAND], has_escalation=True),
    InvaderCard(InvaderStage.II, [Terrain.JUNGLE, Terrain.MOUNTAIN], has_escalation=True),
    InvaderCard(InvaderStage.II, [Terrain.JUNGLE, Terrain.SANDS], has_escalation=True),
    InvaderCard(InvaderStage.II, [Terrain.JUNGLE, Terrain.WETLAND], has_escalation=True),
    InvaderCard(InvaderStage.II, [Terrain.MOUNTAIN, Terrain.SANDS], has_escalation=True),
    InvaderCard(InvaderStage.II, [Terrain.MOUNTAIN, Terrain.WETLAND], has_escalation=True),
    InvaderCard(InvaderStage.II, [Terrain.SANDS, Terrain.WETLAND], has_escalation=True),
]

STAGE_III_CARDS = [
    InvaderCard(InvaderStage.III, [Terrain.JUNGLE, Terrain.MOUNTAIN]),
    InvaderCard(InvaderStage.III, [Terrain.JUNGLE, Terrain.SANDS]),
    InvaderCard(InvaderStage.III, [Terrain.JUNGLE, Terrain.WETLAND]),
    InvaderCard(InvaderStage.III, [Terrain.MOUNTAIN, Terrain.SANDS]),
    InvaderCard(InvaderStage.III, [Terrain.MOUNTAIN, Terrain.WETLAND]),
    InvaderCard(InvaderStage.III, [Terrain.SANDS, Terrain.WETLAND]),
]


@dataclass
class InvaderDeck:
    """Manages the invader draw deck and the three action slots.

    Slots:
    - ravage_card: currently in the Ravage action space (or None)
    - build_card: currently in the Build action space (or None)
    - explore_card: just revealed (will become Build next turn)
    - deck: the draw pile
    - discard: discarded invader cards
    """
    deck: list[InvaderCard] = field(default_factory=list)
    ravage_card: InvaderCard | None = None
    build_card: InvaderCard | None = None
    discard: list[InvaderCard] = field(default_factory=list)

    @property
    def is_empty(self) -> bool:
        return len(self.deck) == 0

    def draw(self) -> InvaderCard | None:
        if self.deck:
            return self.deck.pop(0)
        return None

    def advance(self, new_explore_card: InvaderCard | None) -> None:
        """Slide cards left: ravage -> discard, build -> ravage, explore -> build."""
        if self.ravage_card:
            self.discard.append(self.ravage_card)
        self.ravage_card = self.build_card
        self.build_card = new_explore_card

    @property
    def cards_remaining(self) -> int:
        return len(self.deck)


def build_invader_deck() -> InvaderDeck:
    """Build the standard invader deck: 3 Stage I, 4 Stage II, 5 Stage III.

    Cards are shuffled within each stage, then stacked: Stage I on top, III on bottom.
    """
    stage_i = random.sample(STAGE_I_CARDS, min(3, len(STAGE_I_CARDS)))
    stage_ii = random.sample(STAGE_II_CARDS, min(4, len(STAGE_II_CARDS)))
    stage_iii = random.sample(STAGE_III_CARDS, min(5, len(STAGE_III_CARDS)))

    random.shuffle(stage_i)
    random.shuffle(stage_ii)
    random.shuffle(stage_iii)

    # Stage I on top (drawn first), Stage III on bottom
    deck = stage_i + stage_ii + stage_iii
    return InvaderDeck(deck=deck)
