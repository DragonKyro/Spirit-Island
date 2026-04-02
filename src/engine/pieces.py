"""Data classes for all game pieces on the board."""

from __future__ import annotations

from dataclasses import dataclass, field
from enum import Enum, auto


class Terrain(Enum):
    JUNGLE = auto()
    MOUNTAIN = auto()
    SANDS = auto()
    WETLAND = auto()


class InvaderType(Enum):
    EXPLORER = auto()
    TOWN = auto()
    CITY = auto()


# Health and damage values per invader type
INVADER_HEALTH = {
    InvaderType.EXPLORER: 1,
    InvaderType.TOWN: 2,
    InvaderType.CITY: 3,
}

INVADER_DAMAGE = {
    InvaderType.EXPLORER: 1,
    InvaderType.TOWN: 2,
    InvaderType.CITY: 3,
}

# Fear generated when destroying an invader
INVADER_FEAR = {
    InvaderType.EXPLORER: 0,
    InvaderType.TOWN: 1,
    InvaderType.CITY: 2,
}

DAHAN_HEALTH = 2
DAHAN_DAMAGE = 2


@dataclass
class Invader:
    type: InvaderType
    damage_taken: int = 0

    @property
    def health(self) -> int:
        return INVADER_HEALTH[self.type]

    @property
    def remaining_health(self) -> int:
        return self.health - self.damage_taken

    @property
    def is_destroyed(self) -> bool:
        return self.damage_taken >= self.health

    @property
    def damage_output(self) -> int:
        return INVADER_DAMAGE[self.type]

    @property
    def fear_on_destroy(self) -> int:
        return INVADER_FEAR[self.type]


@dataclass
class Dahan:
    damage_taken: int = 0

    @property
    def remaining_health(self) -> int:
        return DAHAN_HEALTH - self.damage_taken

    @property
    def is_destroyed(self) -> bool:
        return self.damage_taken >= DAHAN_HEALTH


class Element(Enum):
    SUN = auto()
    MOON = auto()
    FIRE = auto()
    AIR = auto()
    WATER = auto()
    EARTH = auto()
    PLANT = auto()
    ANIMAL = auto()


class PowerSpeed(Enum):
    FAST = auto()
    SLOW = auto()


@dataclass
class PowerCard:
    name: str
    cost: int
    speed: PowerSpeed
    range: int
    target: str
    elements: list[Element] = field(default_factory=list)
    description: str = ""
