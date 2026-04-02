"""Adversary definitions and difficulty scaling."""

from __future__ import annotations

from dataclasses import dataclass, field


@dataclass
class AdversaryLevel:
    level: int
    difficulty: int
    description: str
    # Fear deck composition override: (top, mid, bottom) card counts
    fear_deck_config: tuple[int, int, int] | None = None


@dataclass
class Adversary:
    name: str
    description: str
    escalation_effect: str
    levels: list[AdversaryLevel] = field(default_factory=list)

    def get_difficulty(self, level: int) -> int:
        for adv_level in self.levels:
            if adv_level.level == level:
                return adv_level.difficulty
        return 0

    def get_fear_deck_config(self, level: int) -> tuple[int, int, int] | None:
        for adv_level in self.levels:
            if adv_level.level == level and adv_level.fear_deck_config:
                return adv_level.fear_deck_config
        return None


NO_ADVERSARY = Adversary(
    name="No Adversary",
    description="Standard game with no adversary modifications.",
    escalation_effect="None",
    levels=[AdversaryLevel(0, 0, "No adversary")],
)

BRANDENBURG_PRUSSIA = Adversary(
    name="Brandenburg-Prussia",
    description="Speed is the name of the game: Invaders do everything at a faster tempo.",
    escalation_effect="The first Ravage Card also does a Build there.",
    levels=[
        AdversaryLevel(1, 2, "During Setup, put an extra Town in land #1.",
                       fear_deck_config=(3, 3, 3)),
        AdversaryLevel(2, 4, "During Setup, put an extra Town in land #2.",
                       fear_deck_config=(3, 4, 3)),
        AdversaryLevel(3, 6, "During Setup, put an extra Town in land #3.",
                       fear_deck_config=(4, 4, 3)),
        AdversaryLevel(4, 7, "The first time the Invader Deck has only Stage II cards, "
                       "put an extra City in the land with the most Towns.",
                       fear_deck_config=(4, 5, 3)),
        AdversaryLevel(5, 9, "During Setup, add 1 Town to each Inland land.",
                       fear_deck_config=(4, 5, 4)),
        AdversaryLevel(6, 10, "During Setup, add 1 City to the land with the most Towns.",
                       fear_deck_config=(5, 5, 4)),
    ],
)

ENGLAND = Adversary(
    name="England",
    description="Buildings everywhere - England sends so many immigrants that colonies "
                "spill into unexplored lands.",
    escalation_effect="On each board: in the land with the fewest Invaders (min. 1), "
                      "add 1 Town.",
    levels=[
        AdversaryLevel(1, 1, "During Setup, add 1 City to land #1.",
                       fear_deck_config=(3, 3, 3)),
        AdversaryLevel(2, 3, "During Setup, add 1 City to land #2.",
                       fear_deck_config=(3, 4, 3)),
        AdversaryLevel(3, 4, "Build Cards affect lands without Invaders, adding 1 Explorer "
                       "instead of a normal Build.",
                       fear_deck_config=(4, 4, 3)),
        AdversaryLevel(4, 6, "During Setup, add 1 Town to each Coastal land without Towns.",
                       fear_deck_config=(4, 5, 3)),
        AdversaryLevel(5, 7, "During any Invader Phase where you Build in a land, "
                       "if that land has 4+ Invaders, also add 1 Town.",
                       fear_deck_config=(4, 5, 4)),
        AdversaryLevel(6, 9, "Additional loss condition: if there are ever more Towns + Cities "
                       "than non-Town/City Invaders on any single board, you lose.",
                       fear_deck_config=(5, 5, 4)),
    ],
)

SWEDEN = Adversary(
    name="Sweden",
    description="Sweden's Ravages are more dangerous with advanced military tactics.",
    escalation_effect="On each board with 2+ Dahan: in the land with the most Dahan, "
                      "replace 1 Dahan with 1 Town.",
    levels=[
        AdversaryLevel(1, 2, "During Ravage, Invaders deal +1 Damage total (not each).",
                       fear_deck_config=(3, 3, 3)),
        AdversaryLevel(2, 3, "During Setup, add 1 Blight to each land with Town. "
                       "(Setup Blight does not Cascade or destroy Presence.)",
                       fear_deck_config=(3, 4, 3)),
        AdversaryLevel(3, 5, "After Build, if 3+ Invaders are in a land, "
                       "replace 1 Dahan with 1 Town.",
                       fear_deck_config=(4, 4, 3)),
        AdversaryLevel(4, 6, "During Ravage, Invaders deal +2 Damage total.",
                       fear_deck_config=(4, 5, 3)),
        AdversaryLevel(5, 7, "After Build, if 2+ Invaders in a land, "
                       "replace 1 Dahan with 1 Town.",
                       fear_deck_config=(4, 5, 4)),
        AdversaryLevel(6, 8, "During Ravage, Invaders deal +3 Damage total.",
                       fear_deck_config=(5, 5, 4)),
    ],
)

ALL_ADVERSARIES = {
    "No Adversary": NO_ADVERSARY,
    "Brandenburg-Prussia": BRANDENBURG_PRUSSIA,
    "England": ENGLAND,
    "Sweden": SWEDEN,
}
