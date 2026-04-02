"""Save and load game state to/from JSON files."""

from __future__ import annotations

import json
import os
from datetime import datetime
from pathlib import Path

from src.engine.adversary import ALL_ADVERSARIES, Adversary, NO_ADVERSARY
from src.engine.blight import BlightCard
from src.engine.fear import FearCard, FearSystem, TerrorLevel
from src.engine.game_state import GamePhase, GameResult, GameState
from src.engine.invader_deck import InvaderCard, InvaderDeck, InvaderStage
from src.engine.land import Land
from src.engine.pieces import (
    Dahan,
    Element,
    Invader,
    InvaderType,
    PowerCard,
    PowerSpeed,
    Terrain,
)
from src.engine.spirit import ALL_SPIRITS, GrowthOption, PresenceTrack, Spirit

SAVES_DIR = Path(__file__).resolve().parent.parent.parent / "saves"


# ─── Serialization ──────────────────────────────────────────────────────────

def _serialize_invader(inv: Invader) -> dict:
    return {"type": inv.type.name, "damage_taken": inv.damage_taken}


def _serialize_dahan(d: Dahan) -> dict:
    return {"damage_taken": d.damage_taken}


def _serialize_invader_card(card: InvaderCard | None) -> dict | None:
    if card is None:
        return None
    return {
        "stage": card.stage.name,
        "terrains": [t.name for t in card.terrains],
        "has_escalation": card.has_escalation,
    }


def _serialize_fear_card(card: FearCard) -> dict:
    return {
        "name": card.name,
        "terror_1_effect": card.terror_1_effect,
        "terror_2_effect": card.terror_2_effect,
        "terror_3_effect": card.terror_3_effect,
    }


def _serialize_power_card(card: PowerCard) -> dict:
    return {
        "name": card.name,
        "cost": card.cost,
        "speed": card.speed.name,
        "range": card.range,
        "target": card.target,
        "elements": [e.name for e in card.elements],
        "description": card.description,
    }


def _serialize_land(land: Land) -> dict:
    return {
        "number": land.number,
        "terrain": land.terrain.name,
        "is_coastal": land.is_coastal,
        "adjacent_indices": land.adjacent_indices,
        "invaders": [_serialize_invader(i) for i in land.invaders],
        "dahan": [_serialize_dahan(d) for d in land.dahan],
        "blight": land.blight,
        "presence": land.presence,
        "defend": land.defend,
    }


def _serialize_presence_track(track: PresenceTrack) -> dict:
    return {
        "values": track.values,
        "presence_remaining": track.presence_remaining,
    }


def _serialize_growth_option(opt: GrowthOption) -> dict:
    return {
        "description": opt.description,
        "add_presence_range": opt.add_presence_range,
        "gain_energy": opt.gain_energy,
        "gain_power_card": opt.gain_power_card,
        "reclaim_all": opt.reclaim_all,
    }


def _serialize_spirit(spirit: Spirit) -> dict:
    return {
        "name": spirit.name,
        "complexity": spirit.complexity,
        "energy_track": _serialize_presence_track(spirit.energy_track),
        "card_plays_track": _serialize_presence_track(spirit.card_plays_track),
        "growth_options": [_serialize_growth_option(g) for g in spirit.growth_options],
        "starting_presence_lands": spirit.starting_presence_lands,
        "hand": [_serialize_power_card(c) for c in spirit.hand],
        "discard_pile": [_serialize_power_card(c) for c in spirit.discard_pile],
        "played_cards": [_serialize_power_card(c) for c in spirit.played_cards],
        "energy": spirit.energy,
        "elements": {e.name: v for e, v in spirit.elements.items()},
        "total_presence": spirit.total_presence,
        "presence_on_board": spirit.presence_on_board,
        "innate_powers": spirit.innate_powers,
    }


def _serialize_invader_deck(deck: InvaderDeck) -> dict:
    return {
        "deck": [_serialize_invader_card(c) for c in deck.deck],
        "ravage_card": _serialize_invader_card(deck.ravage_card),
        "build_card": _serialize_invader_card(deck.build_card),
        "discard": [_serialize_invader_card(c) for c in deck.discard],
    }


def _serialize_fear_system(fear: FearSystem) -> dict:
    return {
        "fear_markers_per_player": fear.fear_markers_per_player,
        "num_players": fear.num_players,
        "fear_pool": fear.fear_pool,
        "generated_fear": fear.generated_fear,
        "fear_deck": [_serialize_fear_card(c) for c in fear.fear_deck],
        "earned_fear_cards": [_serialize_fear_card(c) for c in fear.earned_fear_cards],
        "fear_discard": [_serialize_fear_card(c) for c in fear.fear_discard],
        "terror_level_2_at": fear.terror_level_2_at,
        "terror_level_3_at": fear.terror_level_3_at,
        "total_cards_earned": fear.total_cards_earned,
        "terror_level": fear.terror_level.name,
    }


def _serialize_blight_card(card: BlightCard | None) -> dict | None:
    if card is None:
        return None
    return {
        "name": card.name,
        "healthy_blight": card.healthy_blight,
        "blighted_blight": card.blighted_blight,
        "blighted_effect": card.blighted_effect,
        "blighted_loss": card.blighted_loss,
        "is_flipped": card.is_flipped,
        "blight_remaining": card.blight_remaining,
    }


def serialize_game_state(state: GameState) -> dict:
    """Convert full game state to a JSON-serializable dict."""
    return {
        "version": 1,
        "saved_at": datetime.now().isoformat(),
        "spirits": [_serialize_spirit(s) for s in state.spirits],
        "adversary_name": state.adversary.name,
        "adversary_level": state.adversary_level,
        "difficulty": state.difficulty,
        "lands": [_serialize_land(l) for l in state.lands],
        "invader_deck": _serialize_invader_deck(state.invader_deck),
        "fear_system": _serialize_fear_system(state.fear_system),
        "blight_card": _serialize_blight_card(state.blight_card),
        "phase": state.phase.name,
        "turn_number": state.turn_number,
        "result": state.result.name,
        "event_log": state.event_log,
    }


# ─── Deserialization ────────────────────────────────────────────────────────

def _deserialize_invader(data: dict) -> Invader:
    return Invader(
        type=InvaderType[data["type"]],
        damage_taken=data["damage_taken"],
    )


def _deserialize_dahan(data: dict) -> Dahan:
    return Dahan(damage_taken=data["damage_taken"])


def _deserialize_invader_card(data: dict | None) -> InvaderCard | None:
    if data is None:
        return None
    return InvaderCard(
        stage=InvaderStage[data["stage"]],
        terrains=[Terrain[t] for t in data["terrains"]],
        has_escalation=data["has_escalation"],
    )


def _deserialize_fear_card(data: dict) -> FearCard:
    return FearCard(
        name=data["name"],
        terror_1_effect=data["terror_1_effect"],
        terror_2_effect=data["terror_2_effect"],
        terror_3_effect=data["terror_3_effect"],
    )


def _deserialize_power_card(data: dict) -> PowerCard:
    return PowerCard(
        name=data["name"],
        cost=data["cost"],
        speed=PowerSpeed[data["speed"]],
        range=data["range"],
        target=data["target"],
        elements=[Element[e] for e in data["elements"]],
        description=data["description"],
    )


def _deserialize_land(data: dict) -> Land:
    return Land(
        number=data["number"],
        terrain=Terrain[data["terrain"]],
        is_coastal=data["is_coastal"],
        adjacent_indices=data["adjacent_indices"],
        invaders=[_deserialize_invader(i) for i in data["invaders"]],
        dahan=[_deserialize_dahan(d) for d in data["dahan"]],
        blight=data["blight"],
        presence=data["presence"],
        defend=data["defend"],
    )


def _deserialize_presence_track(data: dict) -> PresenceTrack:
    return PresenceTrack(
        values=data["values"],
        presence_remaining=data["presence_remaining"],
    )


def _deserialize_growth_option(data: dict) -> GrowthOption:
    return GrowthOption(
        description=data["description"],
        add_presence_range=data["add_presence_range"],
        gain_energy=data["gain_energy"],
        gain_power_card=data["gain_power_card"],
        reclaim_all=data["reclaim_all"],
    )


def _deserialize_spirit(data: dict) -> Spirit:
    return Spirit(
        name=data["name"],
        complexity=data["complexity"],
        energy_track=_deserialize_presence_track(data["energy_track"]),
        card_plays_track=_deserialize_presence_track(data["card_plays_track"]),
        growth_options=[_deserialize_growth_option(g) for g in data["growth_options"]],
        starting_presence_lands=data["starting_presence_lands"],
        hand=[_deserialize_power_card(c) for c in data["hand"]],
        discard_pile=[_deserialize_power_card(c) for c in data["discard_pile"]],
        played_cards=[_deserialize_power_card(c) for c in data["played_cards"]],
        energy=data["energy"],
        elements={Element[k]: v for k, v in data["elements"].items()},
        total_presence=data["total_presence"],
        presence_on_board=data["presence_on_board"],
        innate_powers=data["innate_powers"],
    )


def _deserialize_invader_deck(data: dict) -> InvaderDeck:
    return InvaderDeck(
        deck=[_deserialize_invader_card(c) for c in data["deck"]],
        ravage_card=_deserialize_invader_card(data["ravage_card"]),
        build_card=_deserialize_invader_card(data["build_card"]),
        discard=[_deserialize_invader_card(c) for c in data["discard"]],
    )


def _deserialize_fear_system(data: dict) -> FearSystem:
    return FearSystem(
        fear_markers_per_player=data["fear_markers_per_player"],
        num_players=data["num_players"],
        fear_pool=data["fear_pool"],
        generated_fear=data["generated_fear"],
        fear_deck=[_deserialize_fear_card(c) for c in data["fear_deck"]],
        earned_fear_cards=[_deserialize_fear_card(c) for c in data["earned_fear_cards"]],
        fear_discard=[_deserialize_fear_card(c) for c in data["fear_discard"]],
        terror_level_2_at=data["terror_level_2_at"],
        terror_level_3_at=data["terror_level_3_at"],
        total_cards_earned=data["total_cards_earned"],
        terror_level=TerrorLevel[data["terror_level"]],
    )


def _deserialize_blight_card(data: dict | None) -> BlightCard | None:
    if data is None:
        return None
    return BlightCard(
        name=data["name"],
        healthy_blight=data["healthy_blight"],
        blighted_blight=data["blighted_blight"],
        blighted_effect=data["blighted_effect"],
        blighted_loss=data["blighted_loss"],
        is_flipped=data["is_flipped"],
        blight_remaining=data["blight_remaining"],
    )


def deserialize_game_state(data: dict) -> GameState:
    """Reconstruct a full GameState from a saved dict."""
    adversary_name = data["adversary_name"]
    adversary = ALL_ADVERSARIES.get(adversary_name, NO_ADVERSARY)

    return GameState(
        spirits=[_deserialize_spirit(s) for s in data["spirits"]],
        adversary=adversary,
        adversary_level=data["adversary_level"],
        difficulty=data["difficulty"],
        lands=[_deserialize_land(l) for l in data["lands"]],
        invader_deck=_deserialize_invader_deck(data["invader_deck"]),
        fear_system=_deserialize_fear_system(data["fear_system"]),
        blight_card=_deserialize_blight_card(data["blight_card"]),
        phase=GamePhase[data["phase"]],
        turn_number=data["turn_number"],
        result=GameResult[data["result"]],
        event_log=data["event_log"],
    )


# ─── File I/O ───────────────────────────────────────────────────────────────

def save_game(state: GameState, filename: str | None = None) -> str:
    """Save game state to a JSON file in the saves directory.

    Args:
        state: The game state to save.
        filename: Optional filename (without extension). Auto-generated if None.

    Returns:
        The full path of the saved file.
    """
    SAVES_DIR.mkdir(parents=True, exist_ok=True)

    if filename is None:
        spirit_names = "_".join(s.name.split()[0] for s in state.spirits)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        filename = f"{spirit_names}_turn{state.turn_number}_{timestamp}"

    filepath = SAVES_DIR / f"{filename}.json"
    data = serialize_game_state(state)

    with open(filepath, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

    return str(filepath)


def load_game(filepath: str) -> GameState:
    """Load game state from a JSON file.

    Args:
        filepath: Full path to the save file.

    Returns:
        The restored GameState.
    """
    with open(filepath, "r", encoding="utf-8") as f:
        data = json.load(f)

    return deserialize_game_state(data)


def list_saves() -> list[dict]:
    """List all save files with metadata.

    Returns list of dicts with keys: filename, filepath, saved_at, spirit, turn, result.
    """
    saves = []
    if not SAVES_DIR.exists():
        return saves

    for f in sorted(SAVES_DIR.glob("*.json"), key=os.path.getmtime, reverse=True):
        try:
            with open(f, "r", encoding="utf-8") as fh:
                data = json.load(fh)
            spirits = ", ".join(s["name"] for s in data.get("spirits", []))
            saves.append({
                "filename": f.stem,
                "filepath": str(f),
                "saved_at": data.get("saved_at", "unknown"),
                "spirits": spirits,
                "turn": data.get("turn_number", 0),
                "result": data.get("result", "unknown"),
                "adversary": data.get("adversary_name", "None"),
                "adversary_level": data.get("adversary_level", 0),
            })
        except (json.JSONDecodeError, KeyError):
            continue

    return saves


def delete_save(filepath: str) -> bool:
    """Delete a save file. Returns True if successful."""
    try:
        os.remove(filepath)
        return True
    except OSError:
        return False
