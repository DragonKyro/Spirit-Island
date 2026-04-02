"""Spirit base class and spirit definitions."""

from __future__ import annotations

from dataclasses import dataclass, field

from src.engine.pieces import Element, PowerCard, PowerSpeed


@dataclass
class PresenceTrack:
    """A presence track on a spirit panel.

    Values represent what's revealed as presence is removed left to right.
    Index 0 is always uncovered at start.
    """
    values: list[int]  # e.g., [1, 2, 2, 3, 4, 5] for energy track
    presence_remaining: int = 0  # how many presence are still covering slots

    def setup(self) -> None:
        """All slots except the first are covered at game start."""
        self.presence_remaining = len(self.values) - 1

    @property
    def current_value(self) -> int:
        """The highest revealed value (leftmost uncovered)."""
        revealed_index = len(self.values) - 1 - self.presence_remaining
        return self.values[min(revealed_index, len(self.values) - 1)]

    def remove_presence(self) -> int | None:
        """Remove one presence from this track (revealing the next slot).

        Returns the newly revealed value, or None if track is empty.
        """
        if self.presence_remaining > 0:
            self.presence_remaining -= 1
            return self.current_value
        return None


@dataclass
class GrowthOption:
    """A growth choice on a spirit panel."""
    description: str
    # These are simplified - in practice each is a combination of effects
    add_presence_range: int = 0  # range to add presence (0 = don't add)
    gain_energy: int = 0
    gain_power_card: bool = False
    reclaim_all: bool = False


@dataclass
class Spirit:
    """Base spirit with panel data."""
    name: str
    complexity: str  # "Low", "Moderate", "High", "Very High"

    # Presence tracks
    energy_track: PresenceTrack = field(default_factory=lambda: PresenceTrack([1]))
    card_plays_track: PresenceTrack = field(default_factory=lambda: PresenceTrack([1]))

    # Growth options
    growth_options: list[GrowthOption] = field(default_factory=list)

    # Starting presence positions (land indices, 0-based)
    starting_presence_lands: list[int] = field(default_factory=list)

    # Power cards
    hand: list[PowerCard] = field(default_factory=list)
    discard_pile: list[PowerCard] = field(default_factory=list)
    played_cards: list[PowerCard] = field(default_factory=list)

    # Resources
    energy: int = 0
    elements: dict[Element, int] = field(default_factory=dict)

    # Presence on the board is tracked in Land objects
    total_presence: int = 0  # total presence pieces (on board + on tracks)
    presence_on_board: int = 0

    # Innate powers (text descriptions for now)
    innate_powers: list[dict] = field(default_factory=list)

    def setup(self) -> None:
        """Initialize tracks and starting state."""
        self.energy_track.setup()
        self.card_plays_track.setup()
        self.energy = 0
        self.elements = {}
        self.played_cards = []
        self.discard_pile = []

    @property
    def energy_per_turn(self) -> int:
        return self.energy_track.current_value

    @property
    def card_plays(self) -> int:
        return self.card_plays_track.current_value

    def gain_energy_phase(self) -> int:
        """Gain energy equal to the current energy track value."""
        gained = self.energy_per_turn
        self.energy += gained
        return gained

    def can_play_card(self, card: PowerCard) -> bool:
        """Check if the spirit can afford and has card plays left."""
        played = len(self.played_cards)
        return played < self.card_plays and self.energy >= card.cost

    def play_card(self, card: PowerCard) -> None:
        """Play a power card: pay energy, gain elements, move to played area."""
        self.energy -= card.cost
        for element in card.elements:
            self.elements[element] = self.elements.get(element, 0) + 1
        self.hand.remove(card)
        self.played_cards.append(card)

    def reclaim_all(self) -> None:
        """Return all played/discarded cards to hand."""
        self.hand.extend(self.discard_pile)
        self.discard_pile.clear()

    def time_passes(self) -> None:
        """End of turn: discard played cards, clear elements."""
        self.discard_pile.extend(self.played_cards)
        self.played_cards.clear()
        self.elements.clear()


# ─── Spirit Definitions ─────────────────────────────────────────────────────

def create_lightning() -> Spirit:
    """Lightning's Swift Strike - Low complexity, offense-focused."""
    spirit = Spirit(
        name="Lightning's Swift Strike",
        complexity="Low",
        energy_track=PresenceTrack([1, 2, 2, 3, 3, 4, 5]),
        card_plays_track=PresenceTrack([1, 2, 3, 3, 4]),
        growth_options=[
            GrowthOption("Reclaim All + Gain 1 Energy", gain_energy=1, reclaim_all=True),
            GrowthOption("Add Presence (Range 1) + Gain Power Card",
                         add_presence_range=1, gain_power_card=True),
            GrowthOption("Add Presence (Range 2) + Gain 3 Energy",
                         add_presence_range=2, gain_energy=3),
        ],
        starting_presence_lands=[0, 2],  # Lands 1 and 3
        innate_powers=[
            {
                "name": "Thundering Destruction",
                "speed": "slow",
                "description": "Destroy Invaders based on Fire/Air elements.",
            },
        ],
        hand=[
            PowerCard("Shatter Homesteads", 1, PowerSpeed.FAST, 1, "ANY",
                      [Element.FIRE, Element.AIR],
                      "1 Fear. Destroy 1 Town."),
            PowerCard("Raging Storm", 3, PowerSpeed.SLOW, 1, "ANY",
                      [Element.FIRE, Element.AIR, Element.WATER],
                      "2 Damage to each Invader."),
            PowerCard("Lightning's Boon", 1, PowerSpeed.FAST, 0, "SPIRIT",
                      [Element.FIRE, Element.AIR],
                      "Target Spirit may use 1 Slow Power as Fast."),
            PowerCard("Harbingers of the Lightning", 0, PowerSpeed.FAST, 2, "ANY",
                      [Element.FIRE, Element.AIR],
                      "Push up to 2 Dahan."),
        ],
    )
    return spirit


def create_vital_strength() -> Spirit:
    """Vital Strength of the Earth - Low complexity, defense-focused."""
    spirit = Spirit(
        name="Vital Strength of the Earth",
        complexity="Low",
        energy_track=PresenceTrack([2, 2, 3, 3, 4, 4, 5]),
        card_plays_track=PresenceTrack([1, 1, 2, 2, 3]),
        growth_options=[
            GrowthOption("Reclaim All + Gain 1 Energy", gain_energy=1, reclaim_all=True),
            GrowthOption("Add Presence (Range 2) + Gain Power Card",
                         add_presence_range=2, gain_power_card=True),
            GrowthOption("Add Presence (Range 1) + Gain 2 Energy",
                         add_presence_range=1, gain_energy=2),
        ],
        starting_presence_lands=[4, 5],  # Lands 5 and 6
        innate_powers=[
            {
                "name": "Rituals of Destruction",
                "speed": "slow",
                "description": "Destroy Invaders based on Sun/Earth elements.",
            },
        ],
        hand=[
            PowerCard("Guard the Healing Land", 3, PowerSpeed.FAST, 1, "ANY",
                      [Element.SUN, Element.EARTH, Element.PLANT],
                      "Defend 4. Remove 1 Blight."),
            PowerCard("A Year of Perfect Stillness", 3, PowerSpeed.FAST, 0, "ANY",
                      [Element.SUN, Element.EARTH],
                      "Invaders skip all Actions in target land this turn."),
            PowerCard("Draw of the Fruitful Earth", 1, PowerSpeed.SLOW, 1, "ANY",
                      [Element.SUN, Element.EARTH, Element.PLANT],
                      "Gather up to 2 Explorers. Gather up to 2 Dahan."),
            PowerCard("Rituals of the Destroying Flame", 2, PowerSpeed.SLOW, 1, "ANY",
                      [Element.SUN, Element.FIRE, Element.EARTH],
                      "5 Damage."),
        ],
    )
    return spirit


def create_river() -> Spirit:
    """River Surges in Sunlight - Low complexity, flexible."""
    spirit = Spirit(
        name="River Surges in Sunlight",
        complexity="Low",
        energy_track=PresenceTrack([1, 1, 2, 2, 3, 3, 4]),
        card_plays_track=PresenceTrack([1, 2, 2, 3, 3, 4]),
        growth_options=[
            GrowthOption("Reclaim All", reclaim_all=True),
            GrowthOption("Add Presence (Range 1) + Gain 1 Energy",
                         add_presence_range=1, gain_energy=1),
            GrowthOption("Add Presence (Range 2) + Gain Power Card",
                         add_presence_range=2, gain_power_card=True),
        ],
        starting_presence_lands=[0, 1],  # Lands 1 and 2
        innate_powers=[
            {
                "name": "Massive Flooding",
                "speed": "slow",
                "description": "Deal Damage based on Sun/Water elements.",
            },
        ],
        hand=[
            PowerCard("Flash Floods", 2, PowerSpeed.FAST, 1, "ANY",
                      [Element.SUN, Element.WATER],
                      "1 Damage. If target land is Coastal, +1 Damage."),
            PowerCard("Wash Away", 1, PowerSpeed.SLOW, 1, "ANY",
                      [Element.WATER, Element.EARTH],
                      "Push up to 3 Explorers / Towns."),
            PowerCard("Boon of Vigor", 0, PowerSpeed.FAST, 0, "SPIRIT",
                      [Element.SUN, Element.WATER],
                      "Target Spirit gains 1 Energy."),
            PowerCard("River's Bounty", 0, PowerSpeed.SLOW, 0, "ANY",
                      [Element.SUN, Element.WATER, Element.ANIMAL],
                      "Gather up to 2 Dahan. If you have 2 Sun, +1 Dahan."),
        ],
    )
    return spirit


def create_shadows() -> Spirit:
    """Shadows Flicker Like Flame - Low complexity, fear-focused."""
    spirit = Spirit(
        name="Shadows Flicker Like Flame",
        complexity="Low",
        energy_track=PresenceTrack([1, 2, 2, 3, 3, 4, 5]),
        card_plays_track=PresenceTrack([1, 2, 2, 3, 4]),
        growth_options=[
            GrowthOption("Reclaim All", reclaim_all=True),
            GrowthOption("Add Presence (Range 1) + Gain Power Card",
                         add_presence_range=1, gain_power_card=True),
            GrowthOption("Add Presence (Range 2) + Gain 2 Energy",
                         add_presence_range=2, gain_energy=2),
        ],
        starting_presence_lands=[3, 6],  # Lands 4 and 7
        innate_powers=[
            {
                "name": "Darkness Swallows the Unwary",
                "speed": "fast",
                "description": "Generate Fear and remove Explorers based on Moon/Air elements.",
            },
        ],
        hand=[
            PowerCard("Concealing Shadows", 0, PowerSpeed.FAST, 1, "ANY",
                      [Element.MOON, Element.AIR],
                      "1 Fear. Dahan take no damage from Invaders this turn."),
            PowerCard("Favors Called Due", 1, PowerSpeed.FAST, 0, "ANY",
                      [Element.MOON, Element.AIR, Element.ANIMAL],
                      "2 Fear. Gather up to 4 Dahan."),
            PowerCard("Mantle of Dread", 1, PowerSpeed.SLOW, 0, "ANY",
                      [Element.MOON, Element.FIRE, Element.AIR],
                      "2 Fear. Push up to 2 Explorers."),
            PowerCard("Crops Wither and Fade", 1, PowerSpeed.SLOW, 1, "ANY",
                      [Element.MOON, Element.FIRE, Element.PLANT],
                      "1 Fear. Remove 1 Explorer. Push up to 2 Dahan."),
        ],
    )
    return spirit


ALL_SPIRITS = {
    "Lightning's Swift Strike": create_lightning,
    "Vital Strength of the Earth": create_vital_strength,
    "River Surges in Sunlight": create_river,
    "Shadows Flicker Like Flame": create_shadows,
}
