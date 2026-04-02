"""Load game view - browse and load saved games."""

import arcade
import arcade.gui

from src.constants import (
    BUTTON_BG,
    BUTTON_BG_HOVER,
    BUTTON_BG_PRESS,
    BUTTON_BORDER,
    BUTTON_TEXT,
    COLOR_BACKGROUND,
    COLOR_SUBTITLE,
    COLOR_TITLE,
    WINDOW_HEIGHT,
    WINDOW_WIDTH,
)
from src.engine.save_load import delete_save, list_saves, load_game


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


def _selected_style(font_size: int = 13) -> dict:
    return {
        "normal": arcade.gui.UIFlatButton.UIStyle(
            font_size=font_size, font_color=(255, 255, 240, 255),
            bg=(65, 80, 60, 255), border=(160, 180, 120, 255), border_width=2,
        ),
        "hover": arcade.gui.UIFlatButton.UIStyle(
            font_size=font_size, font_color=(255, 255, 240, 255),
            bg=BUTTON_BG_HOVER, border=(160, 180, 120, 255), border_width=2,
        ),
        "press": arcade.gui.UIFlatButton.UIStyle(
            font_size=font_size, font_color=BUTTON_TEXT,
            bg=BUTTON_BG_PRESS, border=BUTTON_BORDER, border_width=2,
        ),
    }


class LoadView(arcade.View):
    def __init__(self, home_view: arcade.View):
        super().__init__()
        self.home_view = home_view
        self.ui = arcade.gui.UIManager()
        self.saves: list[dict] = []
        self.selected_index: int | None = None
        self.save_buttons: list[arcade.gui.UIFlatButton] = []
        self.title_text: arcade.Text | None = None
        self.detail_text: arcade.Text | None = None
        self.no_saves_text: arcade.Text | None = None

    def on_show_view(self):
        self.ui.enable()
        self.saves = list_saves()
        self.selected_index = None
        self._build_ui()

    def on_hide_view(self):
        self.ui.disable()

    def _build_ui(self):
        self.ui.clear()
        self.save_buttons.clear()

        self.title_text = arcade.Text(
            "Load Game",
            x=WINDOW_WIDTH / 2, y=WINDOW_HEIGHT - 35,
            color=COLOR_TITLE, font_size=28,
            anchor_x="center", anchor_y="center", bold=True,
        )

        if not self.saves:
            self.no_saves_text = arcade.Text(
                "No saved games found.",
                x=WINDOW_WIDTH / 2, y=WINDOW_HEIGHT / 2,
                color=COLOR_SUBTITLE, font_size=16,
                anchor_x="center", anchor_y="center",
            )
        else:
            self.no_saves_text = None

        # Save file list
        save_layout = arcade.gui.UIBoxLayout(space_between=6)
        for i, save in enumerate(self.saves[:15]):  # max 15 shown
            label = (
                f"{save['spirits']}  |  Turn {save['turn']}  |  "
                f"vs {save['adversary']} Lv{save['adversary_level']}"
            )
            is_selected = (i == self.selected_index)
            btn = arcade.gui.UIFlatButton(
                text=label,
                width=700, height=36,
                style=_selected_style() if is_selected else _btn_style(),
            )
            idx = i
            btn.on_click = lambda _evt, idx=idx: self._select_save(idx)
            save_layout.add(btn)
            self.save_buttons.append(btn)

        anchor = self.ui.add(arcade.gui.UIAnchorLayout())
        anchor.add(save_layout, anchor_x="center", anchor_y="top", align_y=-70)

        # Detail text for selected save
        self.detail_text = arcade.Text(
            "",
            x=WINDOW_WIDTH / 2, y=100,
            color=(180, 180, 160, 255), font_size=12,
            anchor_x="center", anchor_y="center",
        )

        # Bottom buttons
        bottom_layout = arcade.gui.UIBoxLayout(vertical=False, space_between=15)

        btn_back = arcade.gui.UIFlatButton(
            text="< Back", width=150, height=42, style=_btn_style(14),
        )
        btn_back.on_click = self._on_back

        btn_load = arcade.gui.UIFlatButton(
            text="Load", width=150, height=42, style=_btn_style(14),
        )
        btn_load.on_click = self._on_load

        btn_delete = arcade.gui.UIFlatButton(
            text="Delete", width=150, height=42, style=_btn_style(14),
        )
        btn_delete.on_click = self._on_delete

        bottom_layout.add(btn_back)
        bottom_layout.add(btn_load)
        bottom_layout.add(btn_delete)

        anchor2 = self.ui.add(arcade.gui.UIAnchorLayout())
        anchor2.add(bottom_layout, anchor_x="center", anchor_y="bottom", align_y=20)

    def _select_save(self, idx: int):
        self.selected_index = idx
        # Update button styles
        for i, btn in enumerate(self.save_buttons):
            btn.style = _selected_style() if i == idx else _btn_style()
        # Update detail text
        save = self.saves[idx]
        self.detail_text.text = (
            f"Saved: {save['saved_at']}  |  "
            f"Result: {save['result']}  |  "
            f"File: {save['filename']}.json"
        )

    def _on_back(self, _event):
        self.window.show_view(self.home_view)

    def _on_load(self, _event):
        if self.selected_index is None:
            return
        save = self.saves[self.selected_index]
        state = load_game(save["filepath"])

        from src.views.game_view import GameView
        game_view = GameView(home_view=self.home_view, loaded_state=state)
        self.window.show_view(game_view)

    def _on_delete(self, _event):
        if self.selected_index is None:
            return
        save = self.saves[self.selected_index]
        delete_save(save["filepath"])
        # Refresh
        self.saves = list_saves()
        self.selected_index = None
        self._build_ui()

    def on_draw(self):
        self.clear()
        arcade.draw_rect_filled(
            arcade.rect.XYWH(
                WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2,
                WINDOW_WIDTH, WINDOW_HEIGHT,
            ),
            color=COLOR_BACKGROUND,
        )
        self.title_text.draw()
        if self.no_saves_text:
            self.no_saves_text.draw()
        if self.detail_text:
            self.detail_text.draw()
        self.ui.draw()
