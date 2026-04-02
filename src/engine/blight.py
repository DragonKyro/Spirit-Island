"""Blight card and blight tracking."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class BlightCard:
    name: str
    healthy_blight: int  # blight on the "Healthy Island" side
    blighted_blight: int  # blight on the "Blighted Island" side
    blighted_effect: str  # text description of the ongoing blighted effect
    blighted_loss: bool = True  # whether running out on blighted side = loss

    # State
    is_flipped: bool = False
    blight_remaining: int = 0

    def setup(self, num_players: int) -> None:
        """Place starting blight on the card (2 per player on healthy side)."""
        self.blight_remaining = self.healthy_blight * num_players
        self.is_flipped = False

    def remove_blight(self) -> bool:
        """Remove one blight from the card to place on island.

        Returns True if still OK, False if the game should be lost.
        """
        self.blight_remaining -= 1

        if self.blight_remaining <= 0 and not self.is_flipped:
            # Flip to blighted side
            self.is_flipped = True
            self.blight_remaining = self.blighted_blight
            return True  # don't lose yet, just flipped

        if self.blight_remaining <= 0 and self.is_flipped:
            # All blight gone from blighted side
            return not self.blighted_loss

        return True

    def return_blight(self) -> None:
        """Return one blight from the island to the card."""
        self.blight_remaining += 1


# Placeholder blight cards (base game has several)
BLIGHT_CARDS = [
    BlightCard(
        name="Aid from Lesser Spirits",
        healthy_blight=2,  # per player
        blighted_blight=3,
        blighted_effect="Each Spirit may choose to gain 1 Energy or to Push 1 Dahan.",
    ),
    BlightCard(
        name="Unnatural Proliferation",
        healthy_blight=2,
        blighted_blight=3,
        blighted_effect="Each turn, add 1 Blight to the land with the most Invaders "
                        "(min. 1 Invader). No cascade.",
    ),
    BlightCard(
        name="Downward Spiral",
        healthy_blight=2,
        blighted_blight=2,
        blighted_effect="Each turn, add 1 Fear to the fear pool per Blighted land.",
    ),
    BlightCard(
        name="Memory Fades to Dust",
        healthy_blight=2,
        blighted_blight=3,
        blighted_effect="Each Spirit must Forget a Power Card.",
    ),
]
