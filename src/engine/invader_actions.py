"""Invader action logic: Explore, Build, Ravage."""

from __future__ import annotations

from src.engine.land import Land
from src.engine.pieces import Dahan, Invader, InvaderType, Terrain


def explore(lands: list[Land], terrains: list[Terrain]) -> list[str]:
    """Add 1 Explorer to each matching land that is accessible.

    A land is accessible if it:
    - Contains a Town or City, OR
    - Is adjacent to a Town, City, or Ocean (coastal).

    Returns list of event messages.
    """
    events = []
    for land in lands:
        if land.terrain not in terrains:
            continue

        # Check accessibility
        has_town_or_city = land.has_town_or_city
        adjacent_to_source = land.is_coastal  # ocean counts as source

        if not has_town_or_city and not adjacent_to_source:
            # Check adjacent lands for towns/cities
            for adj_idx in land.adjacent_indices:
                if lands[adj_idx].has_town_or_city:
                    adjacent_to_source = True
                    break

        if has_town_or_city or adjacent_to_source:
            land.invaders.append(Invader(InvaderType.EXPLORER))
            events.append(f"Explorer added to Land {land.number} ({land.terrain.name})")

    return events


def build(lands: list[Land], terrains: list[Terrain]) -> list[str]:
    """Build in each matching land that has invaders.

    - If more Towns than Cities: add a City.
    - Otherwise: add a Town.

    Returns list of event messages.
    """
    events = []
    for land in lands:
        if land.terrain not in terrains:
            continue
        if not land.has_invaders:
            continue

        if land.town_count > land.city_count:
            land.invaders.append(Invader(InvaderType.CITY))
            events.append(f"City built in Land {land.number} ({land.terrain.name})")
        else:
            land.invaders.append(Invader(InvaderType.TOWN))
            events.append(f"Town built in Land {land.number} ({land.terrain.name})")

    return events


def ravage(
    lands: list[Land],
    terrains: list[Terrain],
    bonus_damage: int = 0,
) -> tuple[list[str], int, list[int]]:
    """Ravage in each matching land that has invaders.

    Steps per land:
    1. Invaders deal damage to land (blight if >= 2) and Dahan.
    2. Surviving Dahan fight back.

    Args:
        bonus_damage: extra damage from adversary effects (e.g., Sweden).

    Returns (event_messages, total_fear_generated, land_indices_needing_blight).
    """
    events = []
    total_fear = 0
    blight_lands: list[int] = []

    for i, land in enumerate(lands):
        if land.terrain not in terrains:
            continue
        if not land.has_invaders:
            continue

        # Calculate total invader damage
        raw_damage = land.total_invader_damage + bonus_damage
        effective_damage = max(0, raw_damage - land.defend)
        land.defend = 0  # consume defend

        events.append(
            f"Ravage in Land {land.number} ({land.terrain.name}): "
            f"{raw_damage} damage (defend absorbed {raw_damage - effective_damage})"
        )

        # 1. Invaders damage the land
        if effective_damage >= 2:
            blight_lands.append(i)
            events.append(f"  Land {land.number} takes blight")

        # 2. Invaders fight the Dahan
        dahan_damage = effective_damage
        destroyed_dahan = []
        for dahan in land.dahan:
            if dahan_damage <= 0:
                break
            damage_to_this = min(dahan.remaining_health, dahan_damage)
            dahan.damage_taken += damage_to_this
            dahan_damage -= damage_to_this
            if dahan.is_destroyed:
                destroyed_dahan.append(dahan)

        for d in destroyed_dahan:
            land.dahan.remove(d)
            events.append(f"  Dahan destroyed in Land {land.number}")

        # 3. Surviving Dahan fight back
        dahan_total_damage = sum(2 for _ in land.dahan)  # each Dahan deals 2
        if dahan_total_damage > 0:
            fear, inv_events = _apply_damage_to_invaders(land, dahan_total_damage)
            total_fear += fear
            events.extend(f"  {e}" for e in inv_events)

    return events, total_fear, blight_lands


def _apply_damage_to_invaders(land: Land, damage: int) -> tuple[int, list[str]]:
    """Apply damage to invaders in a land, prioritizing efficient kills.

    Returns (fear_generated, event_messages).
    """
    events = []
    fear = 0
    remaining = damage

    # Sort invaders by remaining health ascending for efficient kills
    targets = sorted(land.invaders, key=lambda inv: inv.remaining_health)

    destroyed = []
    for inv in targets:
        if remaining <= 0:
            break
        applied = min(inv.remaining_health, remaining)
        inv.damage_taken += applied
        remaining -= applied
        if inv.is_destroyed:
            destroyed.append(inv)
            fear += inv.fear_on_destroy
            events.append(f"{inv.type.name.title()} destroyed in Land {land.number}")

    for inv in destroyed:
        land.invaders.remove(inv)

    return fear, events
