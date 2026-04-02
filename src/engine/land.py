"""Island board with lands, adjacency, and piece tracking."""

from __future__ import annotations

from dataclasses import dataclass, field

from src.engine.pieces import Dahan, Invader, InvaderType, Terrain


@dataclass
class Land:
    number: int
    terrain: Terrain
    is_coastal: bool
    adjacent_indices: list[int] = field(default_factory=list)

    # Pieces currently in this land
    invaders: list[Invader] = field(default_factory=list)
    dahan: list[Dahan] = field(default_factory=list)
    blight: int = 0
    presence: dict[str, int] = field(default_factory=dict)  # spirit_id -> count
    defend: int = 0  # defend value for current turn

    @property
    def has_invaders(self) -> bool:
        return len(self.invaders) > 0

    @property
    def has_town_or_city(self) -> bool:
        return any(
            inv.type in (InvaderType.TOWN, InvaderType.CITY) for inv in self.invaders
        )

    @property
    def has_blight(self) -> bool:
        return self.blight > 0

    @property
    def has_dahan(self) -> bool:
        return len(self.dahan) > 0

    @property
    def explorer_count(self) -> int:
        return sum(1 for i in self.invaders if i.type == InvaderType.EXPLORER)

    @property
    def town_count(self) -> int:
        return sum(1 for i in self.invaders if i.type == InvaderType.TOWN)

    @property
    def city_count(self) -> int:
        return sum(1 for i in self.invaders if i.type == InvaderType.CITY)

    @property
    def total_invader_damage(self) -> int:
        return sum(inv.damage_output for inv in self.invaders)

    def total_presence(self) -> int:
        return sum(self.presence.values())

    def has_presence(self, spirit_id: str | None = None) -> bool:
        if spirit_id:
            return self.presence.get(spirit_id, 0) > 0
        return self.total_presence() > 0


# Standard solo island board layout.
# Each board has 8 lands: 2 Jungle, 2 Mountain, 2 Sands, 2 Wetland.
# Lands 1-4 are coastal, lands 5-8 are inland.
# Adjacency based on a standard board layout.

def create_solo_board() -> list[Land]:
    """Create the 8 lands for a standard solo island board."""
    lands = [
        Land(number=1, terrain=Terrain.JUNGLE, is_coastal=True),
        Land(number=2, terrain=Terrain.MOUNTAIN, is_coastal=True),
        Land(number=3, terrain=Terrain.SANDS, is_coastal=True),
        Land(number=4, terrain=Terrain.WETLAND, is_coastal=True),
        Land(number=5, terrain=Terrain.JUNGLE, is_coastal=False),
        Land(number=6, terrain=Terrain.MOUNTAIN, is_coastal=False),
        Land(number=7, terrain=Terrain.SANDS, is_coastal=False),
        Land(number=8, terrain=Terrain.WETLAND, is_coastal=False),
    ]
    # Adjacency (0-indexed). Standard board layout:
    #   Ocean
    #  [1][2][3][4]   <- coastal
    #  [5][6][7][8]   <- inland
    # Each coastal land is adjacent to its neighbors and the inland lands below.
    lands[0].adjacent_indices = [1, 4, 5]       # Land 1 -> 2, 5, 6
    lands[1].adjacent_indices = [0, 2, 4, 5]    # Land 2 -> 1, 3, 5, 6
    lands[2].adjacent_indices = [1, 3, 5, 6]    # Land 3 -> 2, 4, 6, 7
    lands[3].adjacent_indices = [2, 6, 7]        # Land 4 -> 3, 7, 8
    lands[4].adjacent_indices = [0, 1, 2, 5]    # Land 5 -> 1, 2, 3, 6
    lands[5].adjacent_indices = [1, 2, 3, 4, 6, 7]  # Land 6 -> 2, 3, 4, 5, 7, 8
    lands[6].adjacent_indices = [2, 3, 5, 7]    # Land 7 -> 3, 4, 6, 8
    lands[7].adjacent_indices = [3, 6]            # Land 8 -> 4, 7
    return lands


def populate_board(lands: list[Land]) -> None:
    """Place starting invaders, dahan, and blight per rulebook setup icons.

    Standard Board D setup (commonly used for solo):
    - Land 1: 1 Town, 1 Dahan
    - Land 2: 1 City, 1 Dahan
    - Land 3: 1 Dahan
    - Land 4: 1 Dahan
    - Land 5: 1 Town, 1 Dahan, 1 Blight
    - Land 6: (empty)
    - Land 7: 1 Explorer, 1 Dahan
    - Land 8: (empty)
    """
    # Land 1: Town + Dahan
    lands[0].invaders.append(Invader(InvaderType.TOWN))
    lands[0].dahan.append(Dahan())

    # Land 2: City + Dahan
    lands[1].invaders.append(Invader(InvaderType.CITY))
    lands[1].dahan.append(Dahan())

    # Land 3: Dahan
    lands[2].dahan.append(Dahan())

    # Land 4: Dahan
    lands[3].dahan.append(Dahan())

    # Land 5: Town + Dahan + Blight
    lands[4].invaders.append(Invader(InvaderType.TOWN))
    lands[4].dahan.append(Dahan())
    lands[4].blight = 1

    # Land 7: Explorer + Dahan
    lands[6].invaders.append(Invader(InvaderType.EXPLORER))
    lands[6].dahan.append(Dahan())
