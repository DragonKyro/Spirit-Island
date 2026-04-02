"""Turn manager - orchestrates the full turn sequence."""

from __future__ import annotations

from src.engine.game_state import GamePhase, GameResult, GameState
from src.engine.invader_actions import build, explore, ravage


class TurnManager:
    """Runs through the turn sequence for the game.

    The game loop calls advance_phase() repeatedly. Each call executes one phase
    and moves to the next. Player actions are TODO stubs that pass for now.
    """

    def __init__(self, state: GameState):
        self.state = state

    def advance_phase(self) -> bool:
        """Execute the current phase and advance to the next.

        Returns True if the game is still in progress, False if it's over.
        """
        if self.state.result != GameResult.IN_PROGRESS:
            return False

        phase = self.state.phase

        if phase == GamePhase.SPIRIT:
            self._spirit_phase()
            self.state.phase = GamePhase.FAST_POWERS
        elif phase == GamePhase.FAST_POWERS:
            self._fast_powers_phase()
            self.state.phase = GamePhase.INVADER
        elif phase == GamePhase.INVADER:
            self._invader_phase()
            self.state.phase = GamePhase.SLOW_POWERS
        elif phase == GamePhase.SLOW_POWERS:
            self._slow_powers_phase()
            self.state.phase = GamePhase.TIME_PASSES
        elif phase == GamePhase.TIME_PASSES:
            self._time_passes()
            self.state.phase = GamePhase.SPIRIT
            self.state.turn_number += 1

        # Check for game end
        self.state.check_victory()
        if self.state.result != GameResult.IN_PROGRESS:
            self.state.phase = GamePhase.GAME_OVER
            return False

        return True

    def run_full_turn(self) -> bool:
        """Run all 5 phases of a single turn.

        Returns True if the game is still in progress.
        """
        start_turn = self.state.turn_number
        while self.state.result == GameResult.IN_PROGRESS:
            still_going = self.advance_phase()
            if not still_going:
                return False
            # Stop after one complete turn cycle
            if (self.state.turn_number > start_turn
                    and self.state.phase == GamePhase.SPIRIT):
                break
        return self.state.result == GameResult.IN_PROGRESS

    # ─── Phase Implementations ───────────────────────────────────────────

    def _spirit_phase(self) -> None:
        """Spirit Phase: Growth, Gain Energy, Play Cards."""
        self.state.log(f"\n=== TURN {self.state.turn_number + 1} ===")
        self.state.log("-- Spirit Phase --")

        for spirit in self.state.spirits:
            # 1. Growth
            # TODO: Let player choose a growth option
            # For auto-play, pick the first growth option
            if spirit.growth_options:
                option = spirit.growth_options[0]
                self.state.log(f"  {spirit.name} Growth: {option.description}")

                if option.reclaim_all:
                    spirit.reclaim_all()
                    self.state.log(f"    Reclaimed all cards")

                if option.gain_energy > 0:
                    spirit.energy += option.gain_energy
                    self.state.log(f"    Gained {option.gain_energy} bonus energy")

                if option.add_presence_range > 0:
                    # TODO: Let player choose where to place presence
                    # Auto-play: skip placement
                    self.state.log(f"    TODO: Place presence (range {option.add_presence_range})")

                if option.gain_power_card:
                    # TODO: Let player choose minor/major and pick a card
                    self.state.log(f"    TODO: Gain a power card")

            # 2. Gain Energy
            gained = spirit.gain_energy_phase()
            self.state.log(f"  {spirit.name} gains {gained} energy "
                           f"(total: {spirit.energy})")

            # 3. Play and Pay for Power Cards
            # TODO: Let player choose which cards to play
            self.state.log(f"  {spirit.name} can play {spirit.card_plays} cards "
                           f"(TODO: player chooses)")

    def _fast_powers_phase(self) -> None:
        """Fast Power Phase: resolve fast innate and played fast power cards."""
        self.state.log("-- Fast Powers Phase --")
        # TODO: Let player resolve fast powers (innate + played fast cards)
        for spirit in self.state.spirits:
            fast_cards = [c for c in spirit.played_cards if c.speed.name == "FAST"]
            if fast_cards:
                for card in fast_cards:
                    self.state.log(f"  TODO: Resolve {card.name} ({spirit.name})")
            # Check innate powers
            for innate in spirit.innate_powers:
                self.state.log(
                    f"  TODO: Check innate '{innate['name']}' ({spirit.name})"
                )

    def _invader_phase(self) -> None:
        """Invader Phase: Blight Effect, Fear, Ravage, Build, Explore, Advance."""
        self.state.log("-- Invader Phase --")

        # 1. Blighted Island Effect
        if self.state.blight_card and self.state.blight_card.is_flipped:
            self.state.log(f"  Blighted Island: {self.state.blight_card.blighted_effect}")
            # TODO: Implement specific blight card effects

        # 2. Fear Effects
        resolved = self.state.fear_system.resolve_earned_fear_cards()
        for card, effect in resolved:
            self.state.log(f"  Fear Card '{card.name}': {effect}")
            # TODO: Implement fear card effects (most require player choices)

        # 3a. Ravage
        if self.state.invader_deck.ravage_card:
            ravage_card = self.state.invader_deck.ravage_card
            terrains = ravage_card.terrains
            self.state.log(f"  Ravage: {ravage_card.label}")

            # Calculate adversary bonus damage (e.g., Sweden)
            bonus_damage = 0
            # Sweden levels add bonus ravage damage
            if self.state.adversary.name == "Sweden":
                if self.state.adversary_level >= 4:
                    bonus_damage = 2
                elif self.state.adversary_level >= 1:
                    bonus_damage = 1

            events, fear_generated, blight_lands = ravage(
                self.state.lands, terrains, bonus_damage
            )
            for e in events:
                self.state.log(f"    {e}")

            # Handle blight placement from ravage
            for land_idx in blight_lands:
                blight_events = self.state.add_blight_to_land(land_idx)
                for be in blight_events:
                    self.state.log(f"    {be}")
                if self.state.result != GameResult.IN_PROGRESS:
                    return

            # Add fear from destroyed invaders
            if fear_generated > 0:
                fear_events = self.state.fear_system.add_fear(fear_generated)
                self.state.log(f"    {fear_generated} Fear generated from combat")
                for fe in fear_events:
                    self.state.log(f"    {fe}")

        # Check victory after ravage (invaders might be cleared)
        self.state.check_victory()
        if self.state.result != GameResult.IN_PROGRESS:
            return

        # 3b. Build
        if self.state.invader_deck.build_card:
            build_card = self.state.invader_deck.build_card
            self.state.log(f"  Build: {build_card.label}")
            events = build(self.state.lands, build_card.terrains)
            for e in events:
                self.state.log(f"    {e}")

        # 3c. Explore
        new_card = self.state.invader_deck.draw()
        if new_card is None and self.state.invader_deck.is_empty:
            self.state.result = GameResult.DEFEAT_NO_CARDS
            self.state.log("  No Invader Cards left to explore - DEFEAT!")
            return

        if new_card:
            self.state.log(f"  Explore: {new_card.label}")

            # Escalation effect (Stage II cards with adversary)
            if (new_card.has_escalation
                    and self.state.adversary.name != "No Adversary"):
                self.state.log(
                    f"    Escalation! {self.state.adversary.escalation_effect}"
                )
                # TODO: Implement specific adversary escalation effects

            events = explore(self.state.lands, new_card.terrains)
            for e in events:
                self.state.log(f"    {e}")

        # 4. Advance Invader Cards
        self.state.invader_deck.advance(new_card)
        self.state.log("  Invader cards advanced.")

    def _slow_powers_phase(self) -> None:
        """Slow Power Phase: resolve slow innate and played slow power cards."""
        self.state.log("-- Slow Powers Phase --")
        # TODO: Let player resolve slow powers (innate + played slow cards)
        for spirit in self.state.spirits:
            slow_cards = [c for c in spirit.played_cards if c.speed.name == "SLOW"]
            if slow_cards:
                for card in slow_cards:
                    self.state.log(f"  TODO: Resolve {card.name} ({spirit.name})")
            for innate in spirit.innate_powers:
                if innate.get("speed") == "slow":
                    self.state.log(
                        f"  TODO: Check innate '{innate['name']}' ({spirit.name})"
                    )

    def _time_passes(self) -> None:
        """Time Passes: discard played cards, clear damage and elements."""
        self.state.log("-- Time Passes --")

        for spirit in self.state.spirits:
            spirit.time_passes()

        # Clear defend values and damage on all pieces
        for land in self.state.lands:
            land.defend = 0
            for inv in land.invaders:
                inv.damage_taken = 0
            for dahan in land.dahan:
                dahan.damage_taken = 0

        self.state.log("  Cards discarded, damage cleared, elements cleared.")

        # Board summary
        total_invaders = sum(len(l.invaders) for l in self.state.lands)
        total_towns = sum(l.town_count for l in self.state.lands)
        total_cities = sum(l.city_count for l in self.state.lands)
        total_dahan = sum(len(l.dahan) for l in self.state.lands)
        total_blight = sum(l.blight for l in self.state.lands)

        self.state.log(
            f"  Board: {total_invaders} invaders "
            f"({total_cities}C/{total_towns}T), "
            f"{total_dahan} Dahan, {total_blight} Blight"
        )
        self.state.log(
            f"  Terror Level: {self.state.fear_system.terror_level.name}, "
            f"Invader cards remaining: {self.state.invader_deck.cards_remaining}"
        )
