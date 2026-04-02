"""Spirit and game settings selection screen."""

import arcade
import arcade.gui

from src.constants import (
    BUTTON_BG,
    BUTTON_BG_HOVER,
    BUTTON_BG_PRESS,
    BUTTON_BORDER,
    BUTTON_FONT_SIZE,
    BUTTON_HEIGHT,
    BUTTON_TEXT,
    BUTTON_WIDTH,
    COLOR_BACKGROUND,
    COLOR_SUBTITLE,
    COLOR_TITLE,
    WINDOW_HEIGHT,
    WINDOW_WIDTH,
)
from src.engine.adversary import ALL_ADVERSARIES
from src.engine.spirit import ALL_SPIRITS


def _menu_style() -> dict:
    return {
        "normal": arcade.gui.UIFlatButton.UIStyle(
            font_size=BUTTON_FONT_SIZE,
            font_color=BUTTON_TEXT,
            bg=BUTTON_BG,
            border=BUTTON_BORDER,
            border_width=2,
        ),
        "hover": arcade.gui.UIFlatButton.UIStyle(
            font_size=BUTTON_FONT_SIZE,
            font_color=(255, 255, 240, 255),
            bg=BUTTON_BG_HOVER,
            border=(160, 180, 120, 255),
            border_width=2,
        ),
        "press": arcade.gui.UIFlatButton.UIStyle(
            font_size=BUTTON_FONT_SIZE,
            font_color=BUTTON_TEXT,
            bg=BUTTON_BG_PRESS,
            border=BUTTON_BORDER,
            border_width=2,
        ),
    }


def _selected_style() -> dict:
    return {
        "normal": arcade.gui.UIFlatButton.UIStyle(
            font_size=BUTTON_FONT_SIZE,
            font_color=(255, 255, 240, 255),
            bg=(65, 80, 60, 255),
            border=(160, 180, 120, 255),
            border_width=2,
        ),
        "hover": arcade.gui.UIFlatButton.UIStyle(
            font_size=BUTTON_FONT_SIZE,
            font_color=(255, 255, 240, 255),
            bg=BUTTON_BG_HOVER,
            border=(160, 180, 120, 255),
            border_width=2,
        ),
        "press": arcade.gui.UIFlatButton.UIStyle(
            font_size=BUTTON_FONT_SIZE,
            font_color=BUTTON_TEXT,
            bg=BUTTON_BG_PRESS,
            border=BUTTON_BORDER,
            border_width=2,
        ),
    }


class SpiritSelectView(arcade.View):
    def __init__(self, home_view: arcade.View):
        super().__init__()
        self.home_view = home_view
        self.ui = arcade.gui.UIManager()

        # Selections
        self.selected_spirits: set[str] = set()
        self.selected_adversary: str = "No Adversary"
        self.adversary_level: int = 0

        # Text objects
        self.title_text: arcade.Text | None = None
        self.spirit_label: arcade.Text | None = None
        self.adversary_label: arcade.Text | None = None
        self.level_label: arcade.Text | None = None
        self.info_text: arcade.Text | None = None

        # Button references for style updates
        self.spirit_buttons: dict[str, arcade.gui.UIFlatButton] = {}
        self.adversary_buttons: dict[str, arcade.gui.UIFlatButton] = {}
        self.level_buttons: dict[int, arcade.gui.UIFlatButton] = {}

    def on_show_view(self):
        self.ui.enable()
        self._build_ui()

    def on_hide_view(self):
        self.ui.disable()

    def _build_ui(self):
        self.ui.clear()
        self.spirit_buttons.clear()
        self.adversary_buttons.clear()
        self.level_buttons.clear()

        self.title_text = arcade.Text(
            "Game Setup",
            x=WINDOW_WIDTH / 2, y=WINDOW_HEIGHT - 35,
            color=COLOR_TITLE, font_size=28,
            anchor_x="center", anchor_y="center", bold=True,
        )

        # ─── Column 1: Spirit Selection ──────────────────────────
        self.spirit_label = arcade.Text(
            "Choose Spirit(s)",
            x=200, y=WINDOW_HEIGHT - 85,
            color=COLOR_SUBTITLE, font_size=16,
            anchor_x="center", anchor_y="center", bold=True,
        )

        spirit_layout = arcade.gui.UIBoxLayout(space_between=8)
        for name in ALL_SPIRITS:
            is_selected = (name in self.selected_spirits)
            btn = arcade.gui.UIFlatButton(
                text=name,
                width=320, height=42,
                style=_selected_style() if is_selected else _menu_style(),
            )
            spirit_name = name
            btn.on_click = lambda _evt, sn=spirit_name: self._select_spirit(sn)
            spirit_layout.add(btn)
            self.spirit_buttons[name] = btn

        anchor = self.ui.add(arcade.gui.UIAnchorLayout())
        anchor.add(spirit_layout, anchor_x="left", anchor_y="top",
                   align_x=40, align_y=-100)

        # ─── Column 2: Adversary Selection ───────────────────────
        self.adversary_label = arcade.Text(
            "Choose Adversary",
            x=620, y=WINDOW_HEIGHT - 85,
            color=COLOR_SUBTITLE, font_size=16,
            anchor_x="center", anchor_y="center", bold=True,
        )

        adversary_layout = arcade.gui.UIBoxLayout(space_between=8)
        for name in ALL_ADVERSARIES:
            is_selected = (name == self.selected_adversary)
            btn = arcade.gui.UIFlatButton(
                text=name,
                width=250, height=42,
                style=_selected_style() if is_selected else _menu_style(),
            )
            adv_name = name
            btn.on_click = lambda _evt, an=adv_name: self._select_adversary(an)
            adversary_layout.add(btn)
            self.adversary_buttons[name] = btn

        anchor2 = self.ui.add(arcade.gui.UIAnchorLayout())
        anchor2.add(adversary_layout, anchor_x="left", anchor_y="top",
                    align_x=495, align_y=-100)

        # ─── Column 3: Adversary Level ───────────────────────────
        self.level_label = arcade.Text(
            "Adversary Level",
            x=1020, y=WINDOW_HEIGHT - 85,
            color=COLOR_SUBTITLE, font_size=16,
            anchor_x="center", anchor_y="center", bold=True,
        )

        level_layout = arcade.gui.UIBoxLayout(space_between=6)
        for lvl in range(7):  # 0-6
            is_selected = (lvl == self.adversary_level)
            label = f"Level {lvl}" if lvl > 0 else "Level 0 (None)"
            btn = arcade.gui.UIFlatButton(
                text=label,
                width=200, height=36,
                style=_selected_style() if is_selected else _menu_style(),
            )
            level_val = lvl
            btn.on_click = lambda _evt, lv=level_val: self._select_level(lv)
            level_layout.add(btn)
            self.level_buttons[lvl] = btn

        anchor3 = self.ui.add(arcade.gui.UIAnchorLayout())
        anchor3.add(level_layout, anchor_x="left", anchor_y="top",
                    align_x=920, align_y=-100)

        # ─── Bottom: Info + Start/Back buttons ───────────────────
        self.info_text = arcade.Text(
            self._get_info_string(),
            x=WINDOW_WIDTH / 2, y=80,
            color=(180, 180, 160, 255), font_size=14,
            anchor_x="center", anchor_y="center",
        )

        bottom_layout = arcade.gui.UIBoxLayout(vertical=False, space_between=20)

        btn_back = arcade.gui.UIFlatButton(
            text="< Back", width=150, height=BUTTON_HEIGHT, style=_menu_style(),
        )
        btn_back.on_click = self._on_back

        btn_start = arcade.gui.UIFlatButton(
            text="Start Game", width=200, height=BUTTON_HEIGHT, style=_menu_style(),
        )
        btn_start.on_click = self._on_start

        bottom_layout.add(btn_back)
        bottom_layout.add(btn_start)

        anchor4 = self.ui.add(arcade.gui.UIAnchorLayout())
        anchor4.add(bottom_layout, anchor_x="center", anchor_y="bottom", align_y=20)

    def _get_info_string(self) -> str:
        spirits = ", ".join(sorted(self.selected_spirits)) if self.selected_spirits else "(none)"
        adv = self.selected_adversary
        lvl = self.adversary_level
        diff = ALL_ADVERSARIES[adv].get_difficulty(lvl) if adv in ALL_ADVERSARIES else 0
        return f"Spirits: {spirits}  |  Adversary: {adv} Lv.{lvl}  |  Difficulty: {diff}"

    def _refresh_styles(self):
        for name, btn in self.spirit_buttons.items():
            btn.style = _selected_style() if name in self.selected_spirits else _menu_style()
        for name, btn in self.adversary_buttons.items():
            btn.style = _selected_style() if name == self.selected_adversary else _menu_style()
        for lvl, btn in self.level_buttons.items():
            btn.style = _selected_style() if lvl == self.adversary_level else _menu_style()
        if self.info_text:
            self.info_text.text = self._get_info_string()

    def _select_spirit(self, name: str):
        if name in self.selected_spirits:
            self.selected_spirits.discard(name)
        else:
            self.selected_spirits.add(name)
        self._refresh_styles()

    def _select_adversary(self, name: str):
        self.selected_adversary = name
        if name == "No Adversary":
            self.adversary_level = 0
        self._refresh_styles()

    def _select_level(self, level: int):
        self.adversary_level = level
        self._refresh_styles()

    def _on_back(self, _event):
        self.window.show_view(self.home_view)

    def _on_start(self, _event):
        if not self.selected_spirits:
            return  # must select at least one spirit

        from src.engine.adversary import ALL_ADVERSARIES
        from src.engine.spirit import ALL_SPIRITS
        from src.views.game_view import GameView

        spirits = []
        for name in self.selected_spirits:
            factory = ALL_SPIRITS[name]
            spirits.append(factory())

        adversary = ALL_ADVERSARIES[self.selected_adversary]

        game_view = GameView(
            home_view=self.home_view,
            spirits=spirits,
            adversary=adversary,
            adversary_level=self.adversary_level,
        )
        self.window.show_view(game_view)

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
        self.spirit_label.draw()
        self.adversary_label.draw()
        self.level_label.draw()
        self.info_text.draw()
        self.ui.draw()
