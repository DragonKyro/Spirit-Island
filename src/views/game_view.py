"""Main game view - displays board state and runs the turn loop."""

from __future__ import annotations

import arcade
import arcade.gui

from src.constants import (
    BUTTON_BG,
    BUTTON_BG_HOVER,
    BUTTON_BG_PRESS,
    BUTTON_BORDER,
    BUTTON_TEXT,
    COLOR_BACKGROUND,
    COLOR_TITLE,
    WINDOW_HEIGHT,
    WINDOW_WIDTH,
)
from src.engine.adversary import Adversary
from src.engine.card_images import get_card_image_path
from src.engine.game_state import GameResult, GameState
from src.engine.spirit import Spirit
from src.engine.turn_manager import TurnManager
from src.views.card_overlay import CardOverlay


def _btn_style(font_size: int = 13) -> dict:
    return {
        "normal": arcade.gui.UIFlatButton.UIStyle(
            font_size=font_size, font_color=BUTTON_TEXT,
            bg=BUTTON_BG, border=BUTTON_BORDER, border_width=1,
        ),
        "hover": arcade.gui.UIFlatButton.UIStyle(
            font_size=font_size, font_color=(255, 255, 240, 255),
            bg=BUTTON_BG_HOVER, border=(160, 180, 120, 255), border_width=1,
        ),
        "press": arcade.gui.UIFlatButton.UIStyle(
            font_size=font_size, font_color=BUTTON_TEXT,
            bg=BUTTON_BG_PRESS, border=BUTTON_BORDER, border_width=1,
        ),
    }


# Colors for terrain rendering
TERRAIN_COLORS = {
    "JUNGLE": (45, 90, 39, 255),
    "MOUNTAIN": (139, 115, 85, 255),
    "SANDS": (194, 178, 128, 255),
    "WETLAND": (74, 122, 140, 255),
}

LOG_AREA_WIDTH = 440
BOARD_AREA_WIDTH = WINDOW_WIDTH - LOG_AREA_WIDTH

# Board layout constants
BOARD_MARGIN = 15
LAND_H = 150
LAND_W = (BOARD_AREA_WIDTH - BOARD_MARGIN * 3) // 4

# Piece colors matching the SVG assets
PIECE_COLORS = {
    "explorer": (204, 68, 68, 255),
    "town": (204, 68, 68, 255),
    "city": (180, 40, 40, 255),
    "dahan": (212, 165, 74, 255),
    "blight": (102, 85, 68, 255),
    "presence": (102, 153, 204, 255),
}
PIECE_SIZE = 14


def _create_piece_textures() -> dict[str, arcade.Texture]:
    """Create small textures for each piece type."""
    textures = {}
    textures["explorer"] = arcade.make_circle_texture(
        PIECE_SIZE, PIECE_COLORS["explorer"]
    )
    textures["town"] = arcade.make_soft_square_texture(
        PIECE_SIZE, PIECE_COLORS["town"], 255, 255
    )
    textures["city"] = arcade.make_soft_square_texture(
        PIECE_SIZE + 4, PIECE_COLORS["city"], 255, 255
    )
    textures["dahan"] = arcade.make_circle_texture(
        PIECE_SIZE, PIECE_COLORS["dahan"]
    )
    textures["blight"] = arcade.make_circle_texture(
        PIECE_SIZE, PIECE_COLORS["blight"]
    )
    textures["presence"] = arcade.make_soft_circle_texture(
        PIECE_SIZE, PIECE_COLORS["presence"]
    )
    return textures


def _land_center(i: int) -> tuple[float, float]:
    """Return the (x, y) center of the i-th land tile."""
    col = i % 4
    row = i // 4
    x = BOARD_MARGIN + col * (LAND_W + BOARD_MARGIN // 2) + LAND_W // 2
    y = (WINDOW_HEIGHT - 50) - row * (LAND_H + BOARD_MARGIN) - LAND_H // 2
    return x, y


class GameView(arcade.View):
    def __init__(
        self,
        home_view: arcade.View,
        spirits: list[Spirit] | None = None,
        adversary: Adversary | None = None,
        adversary_level: int = 0,
        loaded_state: GameState | None = None,
    ):
        super().__init__()
        self.home_view = home_view
        self.ui = arcade.gui.UIManager()

        if loaded_state is not None:
            self.game_state = loaded_state
        else:
            self.game_state = GameState(
                spirits=spirits or [],
                adversary=adversary or Adversary(name="No Adversary", description="", escalation_effect=""),
                adversary_level=adversary_level,
            )
            self.game_state.setup()
        self.turn_manager = TurnManager(self.game_state)
        self.turn_manager.on_card_display = self._on_card_event

        # Log scroll position
        self.log_scroll_offset = 0
        self.max_visible_log_lines = 35

        # Piece textures
        self.piece_textures = _create_piece_textures()

        # Card image overlay
        self.card_overlay = CardOverlay()
        # Queue of card images to show (type, name) - shown one at a time
        self.card_queue: list[tuple[str, str]] = []

        # Pre-created Text objects (populated in _build_text_objects)
        self.title_text: arcade.Text | None = None

        # Board land labels: [i] -> (name_text, terrain_text)
        self.land_name_texts: list[arcade.Text] = []
        self.land_terrain_texts: list[arcade.Text] = []

        # Legend labels
        self.legend_texts: list[arcade.Text] = []

        # Info panel texts (spirit lines + invader/fear/blight)
        self.spirit_info_texts: list[arcade.Text] = []
        self.invader_info_text: arcade.Text | None = None
        self.fear_info_text: arcade.Text | None = None
        self.blight_info_text: arcade.Text | None = None

        # Event log texts
        self.log_header_text: arcade.Text | None = None
        self.log_line_texts: list[arcade.Text] = []
        self.log_scroll_text: arcade.Text | None = None

    def on_show_view(self):
        self.ui.enable()
        self._build_ui()
        self._build_text_objects()

    def on_hide_view(self):
        self.ui.disable()

    def _build_ui(self):
        self.ui.clear()

        # Control buttons at the bottom
        btn_layout = arcade.gui.UIBoxLayout(vertical=False, space_between=10)

        btn_next_phase = arcade.gui.UIFlatButton(
            text="Next Phase", width=130, height=36, style=_btn_style(),
        )
        btn_next_phase.on_click = self._on_next_phase

        btn_full_turn = arcade.gui.UIFlatButton(
            text="Full Turn", width=130, height=36, style=_btn_style(),
        )
        btn_full_turn.on_click = self._on_full_turn

        btn_auto_play = arcade.gui.UIFlatButton(
            text="Auto Play (10 turns)", width=180, height=36, style=_btn_style(),
        )
        btn_auto_play.on_click = self._on_auto_play

        btn_quit = arcade.gui.UIFlatButton(
            text="Quit to Menu", width=130, height=36, style=_btn_style(),
        )
        btn_quit.on_click = self._on_quit

        btn_save = arcade.gui.UIFlatButton(
            text="Save Game", width=130, height=36, style=_btn_style(),
        )
        btn_save.on_click = self._on_save

        btn_blight = arcade.gui.UIFlatButton(
            text="Blight Card", width=120, height=36, style=_btn_style(),
        )
        btn_blight.on_click = self._on_view_blight

        btn_layout.add(btn_next_phase)
        btn_layout.add(btn_full_turn)
        btn_layout.add(btn_auto_play)
        btn_layout.add(btn_save)
        btn_layout.add(btn_blight)
        btn_layout.add(btn_quit)

        anchor = self.ui.add(arcade.gui.UIAnchorLayout())
        anchor.add(btn_layout, anchor_x="left", anchor_y="bottom",
                   align_x=20, align_y=10)

    def _build_text_objects(self):
        """Pre-create all arcade.Text objects used in rendering."""

        # Title
        self.title_text = arcade.Text(
            f"Spirit Island - Turn {self.game_state.turn_number + 1}",
            x=BOARD_AREA_WIDTH / 2, y=WINDOW_HEIGHT - 20,
            color=COLOR_TITLE, font_size=18,
            anchor_x="center", anchor_y="center", bold=True,
        )

        # Board land labels (static positions, static text)
        self.land_name_texts = []
        self.land_terrain_texts = []
        for i, land in enumerate(self.game_state.lands):
            cx, cy = _land_center(i)
            terrain_name = land.terrain.name
            self.land_name_texts.append(arcade.Text(
                f"Land {land.number}",
                x=cx, y=cy + LAND_H // 2 - 15,
                color=(255, 255, 255, 255), font_size=13,
                anchor_x="center", bold=True,
            ))
            self.land_terrain_texts.append(arcade.Text(
                terrain_name.title() + (" (Coastal)" if land.is_coastal else " (Inland)"),
                x=cx, y=cy + LAND_H // 2 - 32,
                color=(220, 220, 220, 200), font_size=9,
                anchor_x="center",
            ))

        # Legend labels (static)
        self.legend_texts = []
        lx = 15
        ly = WINDOW_HEIGHT - 375
        legend_items = [
            ("city", "City"), ("town", "Town"), ("explorer", "Explorer"),
            ("dahan", "Dahan"), ("blight", "Blight"), ("presence", "Presence"),
        ]
        for _, label in legend_items:
            self.legend_texts.append(arcade.Text(
                label, x=lx + PIECE_SIZE // 2 + 6, y=ly - 5,
                color=(180, 180, 170, 255), font_size=9,
            ))
            lx += len(label) * 7 + PIECE_SIZE + 15

        # Spirit info lines (one per spirit, max 4)
        info_y = WINDOW_HEIGHT - 400
        self.spirit_info_texts = []
        for _ in range(4):
            self.spirit_info_texts.append(arcade.Text(
                "", x=15, y=info_y,
                color=(180, 200, 160, 255), font_size=11,
            ))
            info_y -= 20

        # Invader / fear / blight info
        self.invader_info_text = arcade.Text(
            "", x=15, y=info_y - 5,
            color=(200, 160, 140, 255), font_size=11,
        )
        self.fear_info_text = arcade.Text(
            "", x=15, y=info_y - 25,
            color=(170, 140, 180, 255), font_size=11,
        )
        self.blight_info_text = arcade.Text(
            "", x=15, y=info_y - 45,
            color=(180, 150, 120, 255), font_size=11,
        )

        # Event log
        log_x = BOARD_AREA_WIDTH + 5
        self.log_header_text = arcade.Text(
            "Event Log",
            x=log_x + LOG_AREA_WIDTH // 2, y=WINDOW_HEIGHT - 15,
            color=COLOR_TITLE, font_size=14,
            anchor_x="center", bold=True,
        )

        self.log_line_texts = []
        log_y = WINDOW_HEIGHT - 38
        for _ in range(self.max_visible_log_lines):
            self.log_line_texts.append(arcade.Text(
                "", x=log_x + 5, y=log_y,
                color=(160, 160, 150, 255), font_size=9,
            ))
            log_y -= 16

        self.log_scroll_text = arcade.Text(
            "", x=log_x + 5, y=10,
            color=(100, 100, 100, 255), font_size=8,
        )

    # ─── Button handlers ─────────────────────────────────────────────────

    def _on_next_phase(self, _event):
        if self.game_state.result == GameResult.IN_PROGRESS:
            self.turn_manager.advance_phase()
            self._update_title()
            self._scroll_log_to_bottom()

    def _on_full_turn(self, _event):
        if self.game_state.result == GameResult.IN_PROGRESS:
            self.turn_manager.run_full_turn()
            self._update_title()
            self._scroll_log_to_bottom()

    def _on_auto_play(self, _event):
        for _ in range(10):
            if self.game_state.result != GameResult.IN_PROGRESS:
                break
            self.turn_manager.run_full_turn()
        self._update_title()
        self._scroll_log_to_bottom()

    def _on_save(self, _event):
        from src.engine.save_load import save_game
        path = save_game(self.game_state)
        self.game_state.log(f"Game saved: {path}")
        self._scroll_log_to_bottom()

    def _on_view_blight(self, _event):
        if self.game_state.blight_card:
            self._show_card("blight", self.game_state.blight_card.name)

    def _on_quit(self, _event):
        self.window.show_view(self.home_view)

    # ─── Card overlay helpers ────────────────────────────────────────────

    def _on_card_event(self, card_type: str, card_name: str) -> None:
        """Callback from TurnManager when a card should be displayed."""
        self.queue_card_display(card_type, card_name)

    def _show_card(self, card_type: str, card_name: str) -> None:
        """Show a card image overlay."""
        path = get_card_image_path(card_name, card_type)
        if path:
            title_prefix = card_type.replace("_", " ").title()
            self.card_overlay.show(path, title=f"{title_prefix}: {card_name}")

    def _show_next_queued_card(self) -> None:
        """Show the next card in the queue, if any."""
        if self.card_queue:
            card_type, card_name = self.card_queue.pop(0)
            self._show_card(card_type, card_name)

    def queue_card_display(self, card_type: str, card_name: str) -> None:
        """Queue a card to be shown. If nothing is showing, show it immediately."""
        if not self.card_overlay.visible:
            self._show_card(card_type, card_name)
        else:
            self.card_queue.append((card_type, card_name))

    def on_mouse_press(self, x, y, button, modifiers):
        """Dismiss card overlay on click."""
        if self.card_overlay.visible:
            self.card_overlay.hide()
            self._show_next_queued_card()
            return  # consume the click

    def _update_title(self):
        if self.game_state.result == GameResult.IN_PROGRESS:
            self.title_text.text = (
                f"Spirit Island - Turn {self.game_state.turn_number + 1} "
                f"({self.game_state.phase.name})"
            )
        else:
            result_text = self.game_state.result.name.replace("_", " ").title()
            self.title_text.text = f"Spirit Island - {result_text}"

    def _scroll_log_to_bottom(self):
        total = len(self.game_state.event_log)
        if total > self.max_visible_log_lines:
            self.log_scroll_offset = total - self.max_visible_log_lines

    def on_mouse_scroll(self, x, y, scroll_x, scroll_y):
        if x >= BOARD_AREA_WIDTH:
            self.log_scroll_offset -= int(scroll_y * 3)
            total = len(self.game_state.event_log)
            max_offset = max(0, total - self.max_visible_log_lines)
            self.log_scroll_offset = max(0, min(self.log_scroll_offset, max_offset))

    # ─── Drawing ─────────────────────────────────────────────────────────

    def on_draw(self):
        self.clear()

        # Background
        arcade.draw_rect_filled(
            arcade.rect.XYWH(
                WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2,
                WINDOW_WIDTH, WINDOW_HEIGHT,
            ),
            color=COLOR_BACKGROUND,
        )

        self.title_text.draw()
        self._draw_board()
        self._draw_legend()
        self._draw_spirit_info()
        self._draw_event_log()
        self.ui.draw()

        # Card overlay on top of everything
        self.card_overlay.draw()

    def _draw_board(self):
        """Draw the 8 lands as colored rectangles with piece sprites."""
        for i, land in enumerate(self.game_state.lands):
            cx, cy = _land_center(i)
            terrain_name = land.terrain.name
            color = TERRAIN_COLORS.get(terrain_name, (80, 80, 80, 255))

            # Land background
            arcade.draw_rect_filled(
                arcade.rect.XYWH(cx, cy, LAND_W, LAND_H), color=color,
            )
            arcade.draw_rect_outline(
                arcade.rect.XYWH(cx, cy, LAND_W, LAND_H),
                color=(60, 60, 60, 255), border_width=2,
            )

            # Land labels (pre-created Text objects)
            self.land_name_texts[i].draw()
            self.land_terrain_texts[i].draw()

            # Draw piece sprites
            piece_list: list[tuple[str, int]] = []
            if land.city_count > 0:
                piece_list.append(("city", land.city_count))
            if land.town_count > 0:
                piece_list.append(("town", land.town_count))
            if land.explorer_count > 0:
                piece_list.append(("explorer", land.explorer_count))
            if land.has_dahan:
                piece_list.append(("dahan", len(land.dahan)))
            if land.blight > 0:
                piece_list.append(("blight", land.blight))
            if land.total_presence() > 0:
                piece_list.append(("presence", land.total_presence()))

            if piece_list:
                sprite_y = cy - 5
                sprite_x_start = cx - LAND_W // 2 + 15
                col_offset = 0
                for tex_key, count in piece_list:
                    tex = self.piece_textures[tex_key]
                    for _ in range(min(count, 6)):
                        sx = sprite_x_start + col_offset
                        arcade.draw_texture_rect(
                            tex,
                            arcade.rect.XYWH(sx, sprite_y, PIECE_SIZE, PIECE_SIZE),
                        )
                        col_offset += PIECE_SIZE + 2
                    if col_offset > LAND_W - 30:
                        col_offset = 0
                        sprite_y -= PIECE_SIZE + 4

    def _draw_legend(self):
        """Draw piece legend below the board."""
        lx = 15
        ly = WINDOW_HEIGHT - 375
        legend_keys = ["city", "town", "explorer", "dahan", "blight", "presence"]
        legend_labels = ["City", "Town", "Explorer", "Dahan", "Blight", "Presence"]

        for idx, tex_key in enumerate(legend_keys):
            tex = self.piece_textures[tex_key]
            arcade.draw_texture_rect(
                tex, arcade.rect.XYWH(lx, ly, PIECE_SIZE, PIECE_SIZE),
            )
            self.legend_texts[idx].draw()
            lx += len(legend_labels[idx]) * 7 + PIECE_SIZE + 15

    def _draw_spirit_info(self):
        """Draw spirit/invader/fear/blight status panel."""
        # Update spirit info text content
        for idx, text_obj in enumerate(self.spirit_info_texts):
            if idx < len(self.game_state.spirits):
                spirit = self.game_state.spirits[idx]
                text_obj.text = (
                    f"{spirit.name}  |  Energy: {spirit.energy}  |  "
                    f"Cards in hand: {len(spirit.hand)}  |  "
                    f"Presence on board: {spirit.presence_on_board}  |  "
                    f"Card Plays: {spirit.card_plays}"
                )
                text_obj.draw()
            else:
                text_obj.text = ""

        # Invader deck info
        deck = self.game_state.invader_deck
        inv_info = f"Invader Deck: {deck.cards_remaining} remaining"
        if deck.ravage_card:
            inv_info += f"  |  Ravage: {deck.ravage_card.label}"
        if deck.build_card:
            inv_info += f"  |  Build: {deck.build_card.label}"
        self.invader_info_text.text = inv_info
        self.invader_info_text.draw()

        # Fear / Terror info
        fear = self.game_state.fear_system
        self.fear_info_text.text = (
            f"Terror Level: {fear.terror_level.value}  |  "
            f"Fear Pool: {fear.fear_pool}  |  "
            f"Generated: {fear.generated_fear}  |  "
            f"Fear Cards remaining: {len(fear.fear_deck)}"
        )
        self.fear_info_text.draw()

        # Blight info
        if self.game_state.blight_card:
            bc = self.game_state.blight_card
            side = "BLIGHTED" if bc.is_flipped else "Healthy"
            self.blight_info_text.text = (
                f"Blight Card: {bc.name} ({side}) - {bc.blight_remaining} remaining"
            )
            self.blight_info_text.draw()

    def _draw_event_log(self):
        """Draw scrollable event log on the right side."""
        log_x = BOARD_AREA_WIDTH + 5

        # Log background
        arcade.draw_rect_filled(
            arcade.rect.XYWH(
                log_x + LOG_AREA_WIDTH // 2, WINDOW_HEIGHT // 2,
                LOG_AREA_WIDTH, WINDOW_HEIGHT,
            ),
            color=(15, 18, 25, 255),
        )

        # Header
        self.log_header_text.draw()

        # Update and draw visible log lines
        log = self.game_state.event_log
        start = self.log_scroll_offset
        end = start + self.max_visible_log_lines
        visible = log[start:end]

        for idx, text_obj in enumerate(self.log_line_texts):
            if idx < len(visible):
                line = visible[idx]
                text_obj.text = line[:60] if len(line) > 60 else line
            else:
                text_obj.text = ""
            text_obj.draw()

        # Scroll indicator
        if len(log) > self.max_visible_log_lines:
            self.log_scroll_text.text = (
                f"[{start + 1}-{min(end, len(log))}/{len(log)}] Scroll to navigate"
            )
        else:
            self.log_scroll_text.text = ""
        self.log_scroll_text.draw()
