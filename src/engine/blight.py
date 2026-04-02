"""Blight card and blight tracking."""

from __future__ import annotations

from dataclasses import dataclass


@dataclass
class BlightCard:
    name: str
    healthy_blight: int  # blight per player on the "Healthy Island" side
    blighted_blight: int  # blight per player on the "Blighted Island" side
    blighted_effect: str  # text description of the ongoing blighted effect
    immediate_effect: str = ""  # one-time effect when the card flips
    blighted_loss: bool = True  # whether running out on blighted side = loss
    is_still_healthy: bool = False  # "Still-Healthy Island" variant

    # State
    is_flipped: bool = False
    blight_remaining: int = 0

    def setup(self, num_players: int) -> None:
        """Place starting blight on the card."""
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


# ─── All blight cards transcribed from card images ──────────────────────────
# Cards are either "Blighted Island" (standard) or "Still-Healthy Island"
# (when blight runs out, draw a new Blight Card already flipped).

BLIGHT_CARDS = [
    # ── Standard Blighted Island cards ──────────────────────────────────
    BlightCard(
        name="Aid from Lesser Spirits",
        healthy_blight=2,
        blighted_blight=2,
        immediate_effect=(
            "Draw 1 Minor Power Card per player plus 1 more. Give 1 to each Spirit. "
            "They may be used every turn as if played, but cost no Card Plays/Energy. "
            "Place unselected cards in Minor Powers discard pile."
        ),
        blighted_effect="",
    ),
    BlightCard(
        name="Downward Spiral",
        healthy_blight=2,
        blighted_blight=5,
        immediate_effect="",
        blighted_effect=(
            "At the start of each Invader Phase each Spirit destroys 1 of their Presence."
        ),
    ),
    BlightCard(
        name="Unnatural Proliferation",
        healthy_blight=2,
        blighted_blight=3,
        immediate_effect=(
            "Each Spirit adds 1 Blight to a land with their Presence. "
            "On Each Board: Add 1 Town to a land with City, and 2 Explorers "
            "to the land with fewest Towns/Cities (min. 1)."
        ),
        blighted_effect="",
    ),
    BlightCard(
        name="Memory Fades to Dust",
        healthy_blight=2,
        blighted_blight=4,
        immediate_effect="",
        blighted_effect=(
            "At the start of each Invader Phase each Spirit Forgets a Power "
            "or destroys 1 of their Presence."
        ),
    ),
    BlightCard(
        name="Back Against the Wall",
        healthy_blight=2,
        blighted_blight=2,
        immediate_effect="",
        blighted_effect=(
            "Every Spirit Phase each Spirit gains +1 Energy and +1 Card Play."
        ),
    ),
    BlightCard(
        name="All Things Weaken",
        healthy_blight=2,
        blighted_blight=3,
        immediate_effect="",
        blighted_effect=(
            "Ongoing, starting next turn: Invaders and Dahan have -1 Health (min. 1). "
            "The land takes Blight on 1 less Damage (normally 1). When you add Blight, "
            "it Destroys all Explorers/Towns in that land and 1 Presence (total) in an "
            "adjacent land."
        ),
    ),
    BlightCard(
        name="Tipping Point",
        healthy_blight=2,
        blighted_blight=5,
        immediate_effect="Destroy 3 Presence from each Spirit.",
        blighted_effect="",
    ),
    BlightCard(
        name="Erosion of Will",
        healthy_blight=2,
        blighted_blight=3,
        immediate_effect=(
            "2 Fear per player. Each Spirit destroys 1 of their Presence "
            "and loses 1 Energy."
        ),
        blighted_effect="",
    ),
    BlightCard(
        name="Blight Corrodes the Spirit",
        healthy_blight=2,
        blighted_blight=4,
        immediate_effect="",
        blighted_effect=(
            "Each Invader Phase: On Each Board, Destroy 1 Presence in a land with Blight."
        ),
    ),
    BlightCard(
        name="Thriving Communities",
        healthy_blight=2,
        blighted_blight=4,
        immediate_effect=(
            "On each board: In 4 different lands with Explorer/Town, "
            "Replace 1 Town with 1 City or Replace 1 Explorer with 1 Town."
        ),
        blighted_effect="",
    ),
    BlightCard(
        name="Promising Farmlands",
        healthy_blight=2,
        blighted_blight=4,
        immediate_effect=(
            "On each board: Add 1 Town and 1 Explorer to an Inland land "
            "with no Town/City."
        ),
        blighted_effect="",
    ),
    BlightCard(
        name="Burn Brightest Before the End",
        healthy_blight=2,
        blighted_blight=2,
        immediate_effect=(
            "Each Spirit Adds 1 Presence to one of their lands or removes 1 Presence "
            "from their Presence Tracks. (Presence removed from Tracks goes to the supply.)"
        ),
        blighted_effect="",
    ),
    BlightCard(
        name="Disintegrating Ecosystem",
        healthy_blight=2,
        blighted_blight=5,
        immediate_effect=(
            "On each board: Destroy 1 Beast, then add 1 Blight to a land with Town/City."
        ),
        blighted_effect="",
    ),
    BlightCard(
        name="Intensifying Exploitation",
        healthy_blight=2,
        blighted_blight=5,
        immediate_effect="",
        blighted_effect=(
            "Ongoing, starting next turn: During Ravage Actions, "
            "Invaders deal +2 Damage (per land)."
        ),
    ),
    BlightCard(
        name="A Pall Upon the Land",
        healthy_blight=2,
        blighted_blight=3,
        immediate_effect=(
            "On each board: destroy 1 Presence and remove 1 City."
        ),
        blighted_effect="",
    ),
    BlightCard(
        name="Power Corrodes the Spirit",
        healthy_blight=2,
        blighted_blight=4,
        immediate_effect="",
        blighted_effect=(
            "At the start of each Invader Phase each Spirit Destroys 1 of their Presence "
            "if they have 3 or more Power Cards in play, or have a Power Card in play "
            "costing 4 or more (printed) Energy."
        ),
    ),
    BlightCard(
        name="Shattered Fragments of Power",
        healthy_blight=2,
        blighted_blight=2,
        immediate_effect=(
            "Draw 1 Major Power Card per Spirit plus 2 more. Each Spirit Takes 1 "
            "and gains 2 Energy. (Discard the 2 unselected cards.)"
        ),
        blighted_effect="",
    ),
    BlightCard(
        name="Slow Dissolution of Will",
        healthy_blight=2,
        blighted_blight=3,
        immediate_effect=(
            "Each Spirit chooses one of Mountains, Beasts, or Wilds."
        ),
        blighted_effect=(
            "Each Invader Phase: Each Spirit Replaces 1 Presence with their "
            "chosen type of Spirit Token."
        ),
    ),
    BlightCard(
        name="Attenuated Essence",
        healthy_blight=2,
        blighted_blight=4,
        immediate_effect="",
        blighted_effect=(
            "Each Invader Phase: Each Spirit with at least 5 Presence on the island "
            "Destroys 1 Presence."
        ),
    ),
    BlightCard(
        name="Untended Land Crumbles",
        healthy_blight=2,
        blighted_blight=4,
        immediate_effect="",
        blighted_effect=(
            "At the start of each Invader Phase, On Each Board: Add 1 Blight to a land "
            "adjacent to Blight. Spirits may prevent this on any/all boards; each board "
            "to be protected requires jointly paying 3 Energy or Destroying 1 Presence "
            "from that board."
        ),
    ),

    # ── Still-Healthy Island (For Now) cards ────────────────────────────
    # When blight runs out: draw a new Blight Card, it comes into play
    # already flipped. These do NOT cause a loss when empty.
    BlightCard(
        name="Strong Earth Shatters Slowly",
        healthy_blight=2,
        blighted_blight=0,
        immediate_effect=(
            "Each player adds 1 Blight (from this card) to a land adjacent to Blight."
        ),
        blighted_effect="",
        blighted_loss=False,
        is_still_healthy=True,
    ),
    BlightCard(
        name="Invaders Find the Land to Their Liking",
        healthy_blight=2,
        blighted_blight=0,
        immediate_effect=(
            "If the Terror Level is I / II / III, add 1 / 1.5 / 2 Fear Markers "
            "per player to the Fear pool. (Round down at Terror Level II.)"
        ),
        blighted_effect="",
        blighted_loss=False,
        is_still_healthy=True,
    ),
    BlightCard(
        name="The Border of Life and Death",
        healthy_blight=1,
        blighted_blight=0,
        immediate_effect="",
        blighted_effect=(
            "Now and Each Invader Phase: Each Spirit with at least 2 Presence on the "
            "island Destroys 1 Presence and may discard a Power Card to gain 1 Energy."
        ),
        blighted_loss=False,
        is_still_healthy=True,
    ),
    BlightCard(
        name="Thriving Crops",
        healthy_blight=2,
        blighted_blight=0,
        immediate_effect=(
            "On Each Board, Build in 3 lands. (Build Actions in lands without "
            "Invaders normally Build 1 Explorer.)"
        ),
        blighted_effect="",
        blighted_loss=False,
        is_still_healthy=True,
    ),
]
