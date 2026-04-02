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
from src.engine.game_state import GameResult, GameState
from src.engine.spirit import Spirit
from src.engine.turn_manager import TurnManager


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
    # Explorers: small circle
    textures["explorer"] = arcade.make_circle_texture(
        PIECE_SIZE, PIECE_COLORS["explorer"]
    )
    # Towns: square
    textures["town"] = arcade.make_soft_square_texture(
        PIECE_SIZE, PIECE_COLORS["town"], 255, 255
    )
    # Cities: larger square
    textures["city"] = arcade.make_soft_square_texture(
        PIECE_SIZE + 4, PIECE_COLORS["city"], 255, 255
    )
    # Dahan: circle (gold)
    textures["dahan"] = arcade.make_circle_texture(
        PIECE_SIZE, PIECE_COLORS["dahan"]
    )
    # Blight: circle (brown)
    textures["blight"] = arcade.make_circle_texture(
        PIECE_SIZE, PIECE_COLORS["blight"]
    )
    # Presence: soft circle (blue glow)
    textures["presence"] = arcade.make_soft_circle_texture(
        PIECE_SIZE, PIECE_COLORS["presence"]
    )
    return textures


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

        # Log scroll position
        self.log_scroll_offset = 0
        self.max_visible_log_lines = 35

        # Piece textures
        self.piece_textures = _create_piece_textures()

        # Static text objects
        self.title_text: arcade.Text | None = None
        self.status_texts: list[arcade.Text] = []

    def on_show_view(self):
        self.ui.enable()
        self._build_ui()

    def on_hide_view(self):
        self.ui.disable()

    def _build_ui(self):
        self.ui.clear()

        self.title_text = arcade.Text(
            f"Spirit Island - Turn {self.game_state.turn_number + 1}",
            x=BOARD_AREA_WIDTH / 2, y=WINDOW_HEIGHT - 20,
            color=COLOR_TITLE, font_size=18,
            anchor_x="center", anchor_y="center", bold=True,
        )

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

        btn_layout.add(btn_next_phase)
        btn_layout.add(btn_full_turn)
        btn_layout.add(btn_auto_play)
        btn_layout.add(btn_save)
        btn_layout.add(btn_quit)

        anchor = self.ui.add(arcade.gui.UIAnchorLayout())
        anchor.add(btn_layout, anchor_x="left", anchor_y="bottom",
                   align_x=20, align_y=10)

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

    def _on_quit(self, _event):
        self.window.show_view(self.home_view)

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
        # Scroll event log if mouse is over the log area
        if x >= BOARD_AREA_WIDTH:
            self.log_scroll_offset -= int(scroll_y * 3)
            total = len(self.game_state.event_log)
            max_offset = max(0, total - self.max_visible_log_lines)
            self.log_scroll_offset = max(0, min(self.log_scroll_offset, max_offset))

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

    def _draw_board(self):
        """Draw the 8 lands as colored rectangles in a grid."""
        margin = 15
        start_x = margin
        start_y = WINDOW_HEIGHT - 50
        land_w = (BOARD_AREA_WIDTH - margin * 3) // 4
        land_h = 150

        for i, land in enumerate(self.game_state.lands):
            col = i % 4
            row = i // 4
            x = start_x + col * (land_w + margin // 2) + land_w // 2
            y = start_y - row * (land_h + margin) - land_h // 2

            terrain_name = land.terrain.name
            color = TERRAIN_COLORS.get(terrain_name, (80, 80, 80, 255))

            # Land background
            arcade.draw_rect_filled(
                arcade.rect.XYWH(x, y, land_w, land_h), color=color,
            )
            arcade.draw_rect_outline(
                arcade.rect.XYWH(x, y, land_w, land_h),
                color=(60, 60, 60, 255), border_width=2,
            )

            # Land number and terrain
            arcade.draw_text(
                f"Land {land.number}",
                x, y + land_h // 2 - 15,
                color=(255, 255, 255, 255), font_size=13,
                anchor_x="center", bold=True,
            )
            arcade.draw_text(
                terrain_name.title() + (" (Coastal)" if land.is_coastal else " (Inland)"),
                x, y + land_h // 2 - 32,
                color=(220, 220, 220, 200), font_size=9,
                anchor_x="center",
            )

            # Draw piece sprites in the land
            # Collect all pieces to draw as (texture_key, count) pairs
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
                # Layout pieces in rows within the land
                sprite_y = y - 5
                sprite_x_start = x - land_w // 2 + 15
                col_offset = 0
                for tex_key, count in piece_list:
                    tex = self.piece_textures[tex_key]
                    for j in range(min(count, 6)):  # cap at 6 per type to avoid overflow
                        sx = sprite_x_start + col_offset
                        arcade.draw_texture_rect(
                            tex,
                            arcade.rect.XYWH(sx, sprite_y, PIECE_SIZE, PIECE_SIZE),
                        )
                        col_offset += PIECE_SIZE + 2
                    # If more than shown, draw count label
                    if count > 6:
                        arcade.draw_text(
                            f"+{count - 6}",
                            sprite_x_start + col_offset, sprite_y - 4,
                            color=(255, 255, 200, 255), font_size=8,
                        )
                        col_offset += 18
                    # Move to next row if running out of horizontal space
                    if col_offset > land_w - 30:
                        col_offset = 0
                        sprite_y -= PIECE_SIZE + 4

    def _draw_legend(self):
        """Draw a piece legend below the board."""
        y = WINDOW_HEIGHT - 375
        x = 15
        legend_items = [
            ("city", "City"),
            ("town", "Town"),
            ("explorer", "Explorer"),
            ("dahan", "Dahan"),
            ("blight", "Blight"),
            ("presence", "Presence"),
        ]
        for tex_key, label in legend_items:
            tex = self.piece_textures[tex_key]
            arcade.draw_texture_rect(
                tex, arcade.rect.XYWH(x, y, PIECE_SIZE, PIECE_SIZE),
            )
            arcade.draw_text(
                label, x + PIECE_SIZE // 2 + 6, y - 5,
                color=(180, 180, 170, 255), font_size=9,
            )
            x += len(label) * 7 + PIECE_SIZE + 15

    def _draw_spirit_info(self):
        """Draw spirit status below the board."""
        y = WINDOW_HEIGHT - 400
        for spirit in self.game_state.spirits:
            info = (
                f"{spirit.name}  |  Energy: {spirit.energy}  |  "
                f"Cards in hand: {len(spirit.hand)}  |  "
                f"Presence on board: {spirit.presence_on_board}  |  "
                f"Card Plays: {spirit.card_plays}"
            )
            arcade.draw_text(
                info, 15, y,
                color=(180, 200, 160, 255), font_size=11,
            )
            y -= 20

        # Invader deck info
        deck = self.game_state.invader_deck
        inv_info = f"Invader Deck: {deck.cards_remaining} remaining"
        if deck.ravage_card:
            inv_info += f"  |  Ravage: {deck.ravage_card.label}"
        if deck.build_card:
            inv_info += f"  |  Build: {deck.build_card.label}"
        arcade.draw_text(inv_info, 15, y - 5, color=(200, 160, 140, 255), font_size=11)

        # Fear / Terror info
        fear = self.game_state.fear_system
        fear_info = (
            f"Terror Level: {fear.terror_level.value}  |  "
            f"Fear Pool: {fear.fear_pool}  |  "
            f"Generated: {fear.generated_fear}  |  "
            f"Fear Cards remaining: {len(fear.fear_deck)}"
        )
        arcade.draw_text(fear_info, 15, y - 25, color=(170, 140, 180, 255), font_size=11)

        # Blight info
        if self.game_state.blight_card:
            bc = self.game_state.blight_card
            side = "BLIGHTED" if bc.is_flipped else "Healthy"
            bl_info = f"Blight Card: {bc.name} ({side}) - {bc.blight_remaining} remaining"
            arcade.draw_text(bl_info, 15, y - 45, color=(180, 150, 120, 255), font_size=11)

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

        # Log header
        arcade.draw_text(
            "Event Log",
            log_x + LOG_AREA_WIDTH // 2, WINDOW_HEIGHT - 15,
            color=COLOR_TITLE, font_size=14,
            anchor_x="center", bold=True,
        )

        # Log lines
        log = self.game_state.event_log
        start = self.log_scroll_offset
        end = start + self.max_visible_log_lines
        visible = log[start:end]

        y = WINDOW_HEIGHT - 38
        for line in visible:
            # Truncate long lines
            display = line[:60] if len(line) > 60 else line
            arcade.draw_text(
                display, log_x + 5, y,
                color=(160, 160, 150, 255), font_size=9,
            )
            y -= 16

        # Scroll indicator
        if len(log) > self.max_visible_log_lines:
            arcade.draw_text(
                f"[{start + 1}-{min(end, len(log))}/{len(log)}] Scroll to navigate",
                log_x + 5, 10,
                color=(100, 100, 100, 255), font_size=8,
            )
