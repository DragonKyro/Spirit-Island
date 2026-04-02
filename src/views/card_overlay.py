"""Card image overlay - displays a card image over the game view."""

from __future__ import annotations

from pathlib import Path

import arcade

from src.constants import WINDOW_HEIGHT, WINDOW_WIDTH

# Card display dimensions (preserve card aspect ratio ~= 2:3)
CARD_DISPLAY_W = 300
CARD_DISPLAY_H = 420


class CardOverlay:
    """Draws a card image as an overlay on top of the game view.

    Usage:
        overlay = CardOverlay()
        overlay.show(path_to_image, title="Fear Card")
        # In on_draw: overlay.draw()
        # In on_mouse_press: if overlay.visible: overlay.hide()
    """

    def __init__(self):
        self.visible = False
        self.texture: arcade.Texture | None = None
        self.title: str = ""
        self.title_text: arcade.Text | None = None
        self.hint_text: arcade.Text = arcade.Text(
            "Click anywhere to dismiss",
            x=WINDOW_WIDTH / 2, y=WINDOW_HEIGHT / 2 - CARD_DISPLAY_H / 2 - 25,
            color=(150, 150, 140, 200), font_size=10,
            anchor_x="center", anchor_y="center",
        )
        self._texture_cache: dict[str, arcade.Texture] = {}

    def show(self, image_path: Path | str, title: str = "") -> None:
        """Show a card image overlay."""
        path_str = str(image_path)

        if path_str in self._texture_cache:
            self.texture = self._texture_cache[path_str]
        else:
            try:
                self.texture = arcade.load_texture(path_str)
                self._texture_cache[path_str] = self.texture
            except Exception:
                self.texture = None
                return

        self.title = title
        self.title_text = arcade.Text(
            title,
            x=WINDOW_WIDTH / 2, y=WINDOW_HEIGHT / 2 + CARD_DISPLAY_H / 2 + 20,
            color=(220, 200, 140, 255), font_size=16,
            anchor_x="center", anchor_y="center", bold=True,
        )
        self.visible = True

    def hide(self) -> None:
        """Hide the overlay."""
        self.visible = False

    def draw(self) -> None:
        """Draw the overlay if visible."""
        if not self.visible or self.texture is None:
            return

        # Semi-transparent background
        arcade.draw_rect_filled(
            arcade.rect.XYWH(
                WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2,
                WINDOW_WIDTH, WINDOW_HEIGHT,
            ),
            color=(0, 0, 0, 180),
        )

        # Card image
        arcade.draw_texture_rect(
            self.texture,
            arcade.rect.XYWH(
                WINDOW_WIDTH / 2, WINDOW_HEIGHT / 2,
                CARD_DISPLAY_W, CARD_DISPLAY_H,
            ),
        )

        # Title and hint
        if self.title_text:
            self.title_text.draw()
        self.hint_text.draw()
