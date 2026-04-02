"""Card image loading and name-to-file mapping.

Maps card names to image file paths in assets/imgs/.
Filenames use lowercase with underscores, e.g., "Aid from Lesser Spirits" -> "aid_from_lesser_spirits.jpg"
"""

from __future__ import annotations

import re
from pathlib import Path

ASSETS_DIR = Path(__file__).resolve().parent.parent.parent / "assets" / "imgs"

CARD_DIRS = {
    "blight": ASSETS_DIR / "blights",
    "fear": ASSETS_DIR / "fears",
    "power": ASSETS_DIR / "powers",
    "event": ASSETS_DIR / "events",
    "symbol": ASSETS_DIR / "symbols",
}


def _name_to_filename(name: str) -> str:
    """Convert a card name to its expected filename (without extension).

    "Aid from Lesser Spirits" -> "aid_from_lesser_spirits"
    "A Year of Perfect Stillness" -> "a_year_of_perfect_stillness"
    """
    s = name.lower()
    s = re.sub(r"[''']", "", s)  # remove apostrophes
    s = re.sub(r"[^a-z0-9]+", "_", s)  # non-alphanum -> underscore
    s = s.strip("_")
    return s


def get_card_image_path(card_name: str, card_type: str) -> Path | None:
    """Find the image file for a card by name and type.

    Args:
        card_name: The display name of the card.
        card_type: One of "blight", "fear", "power", "event", "symbol".

    Returns:
        Path to the .jpg file, or None if not found.
    """
    card_dir = CARD_DIRS.get(card_type)
    if card_dir is None or not card_dir.exists():
        return None

    filename = _name_to_filename(card_name)

    # Try .jpg first, then .webp
    for ext in (".jpg", ".webp"):
        path = card_dir / f"{filename}{ext}"
        if path.exists():
            return path

    return None


def list_card_images(card_type: str) -> list[tuple[str, Path]]:
    """List all card images of a given type.

    Returns list of (inferred_name, path) tuples.
    """
    card_dir = CARD_DIRS.get(card_type)
    if card_dir is None or not card_dir.exists():
        return []

    results = []
    for path in sorted(card_dir.glob("*.jpg")):
        # Convert filename back to a readable name
        name = path.stem.replace("_", " ").title()
        results.append((name, path))

    return results
