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
from src.rules_content import RULES_SECTIONS

TAB_WIDTH = 180
TAB_HEIGHT = 34
TAB_FONT_SIZE = 12
CONTENT_MARGIN = 20
CONTENT_LEFT = TAB_WIDTH + CONTENT_MARGIN * 2
CONTENT_WIDTH = WINDOW_WIDTH - CONTENT_LEFT - CONTENT_MARGIN
CONTENT_TOP = WINDOW_HEIGHT - 60
CONTENT_HEIGHT = CONTENT_TOP - CONTENT_MARGIN

ACTIVE_BG = (65, 80, 60, 255)
INACTIVE_BG = (35, 42, 35, 255)


def _tab_style(active: bool) -> dict:
    bg = ACTIVE_BG if active else INACTIVE_BG
    return {
        "normal": arcade.gui.UIFlatButton.UIStyle(
            font_size=TAB_FONT_SIZE,
            font_color=BUTTON_TEXT if not active else (255, 255, 240, 255),
            bg=bg,
            border=BUTTON_BORDER if active else (80, 90, 70, 255),
            border_width=1,
        ),
        "hover": arcade.gui.UIFlatButton.UIStyle(
            font_size=TAB_FONT_SIZE,
            font_color=(255, 255, 240, 255),
            bg=BUTTON_BG_HOVER,
            border=(160, 180, 120, 255),
            border_width=1,
        ),
        "press": arcade.gui.UIFlatButton.UIStyle(
            font_size=TAB_FONT_SIZE,
            font_color=BUTTON_TEXT,
            bg=BUTTON_BG_PRESS,
            border=BUTTON_BORDER,
            border_width=1,
        ),
    }


def _back_style() -> dict:
    return {
        "normal": arcade.gui.UIFlatButton.UIStyle(
            font_size=13,
            font_color=BUTTON_TEXT,
            bg=BUTTON_BG,
            border=BUTTON_BORDER,
            border_width=1,
        ),
        "hover": arcade.gui.UIFlatButton.UIStyle(
            font_size=13,
            font_color=(255, 255, 240, 255),
            bg=BUTTON_BG_HOVER,
            border=(160, 180, 120, 255),
            border_width=1,
        ),
        "press": arcade.gui.UIFlatButton.UIStyle(
            font_size=13,
            font_color=BUTTON_TEXT,
            bg=BUTTON_BG_PRESS,
            border=BUTTON_BORDER,
            border_width=1,
        ),
    }


class RulesView(arcade.View):
    def __init__(self, home_view: arcade.View):
        super().__init__()
        self.home_view = home_view
        self.ui = arcade.gui.UIManager()
        self.active_tab = 0
        self.title_text: arcade.Text | None = None
        self.tab_buttons: list[arcade.gui.UIFlatButton] = []
        self.text_area: arcade.gui.UITextArea | None = None

    def on_show_view(self):
        self.ui.enable()
        self._build_ui()

    def on_hide_view(self):
        self.ui.disable()

    def _build_ui(self):
        self.ui.clear()
        self.tab_buttons.clear()

        self.title_text = arcade.Text(
            "Rules Reference",
            x=WINDOW_WIDTH / 2,
            y=WINDOW_HEIGHT - 30,
            color=COLOR_TITLE,
            font_size=24,
            anchor_x="center",
            anchor_y="center",
            bold=True,
        )

        # --- Left-side tab column ---
        tab_layout = arcade.gui.UIBoxLayout(space_between=4)

        for i, (title, _body) in enumerate(RULES_SECTIONS):
            btn = arcade.gui.UIFlatButton(
                text=title,
                width=TAB_WIDTH,
                height=TAB_HEIGHT,
                style=_tab_style(active=(i == self.active_tab)),
            )
            idx = i  # capture for closure
            btn.on_click = lambda _evt, idx=idx: self._switch_tab(idx)
            tab_layout.add(btn)
            self.tab_buttons.append(btn)

        # Back button at the bottom of tabs
        btn_back = arcade.gui.UIFlatButton(
            text="< Back",
            width=TAB_WIDTH,
            height=TAB_HEIGHT,
            style=_back_style(),
        )
        btn_back.on_click = self._on_back
        tab_layout.add(btn_back)

        anchor = self.ui.add(arcade.gui.UIAnchorLayout())
        anchor.add(
            tab_layout,
            anchor_x="left",
            anchor_y="top",
            align_x=CONTENT_MARGIN,
            align_y=-60,
        )

        # --- Right-side content area ---
        self._create_text_area()

    def _create_text_area(self):
        _title, body = RULES_SECTIONS[self.active_tab]
        self.text_area = arcade.gui.UITextArea(
            x=CONTENT_LEFT,
            y=CONTENT_MARGIN,
            width=CONTENT_WIDTH,
            height=CONTENT_HEIGHT,
            text=body,
            font_name=("Consolas", "Courier New", "monospace"),
            font_size=13,
            text_color=(220, 220, 200, 255),
        )
        self.ui.add(self.text_area)

    def _switch_tab(self, idx: int):
        if idx == self.active_tab:
            return
        self.active_tab = idx
        # Update tab button styles
        for i, btn in enumerate(self.tab_buttons):
            btn.style = _tab_style(active=(i == self.active_tab))
        # Rebuild text area with new content
        if self.text_area:
            self.ui.remove(self.text_area)
        self._create_text_area()

    def _on_back(self, _event):
        self.window.show_view(self.home_view)

    def on_draw(self):
        self.clear()
        arcade.draw_rect_filled(
            arcade.rect.XYWH(
                WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2, WINDOW_WIDTH, WINDOW_HEIGHT
            ),
            color=COLOR_BACKGROUND,
        )
        self.title_text.draw()

        # Draw separator line between tabs and content
        arcade.draw_line(
            TAB_WIDTH + CONTENT_MARGIN + 5, CONTENT_MARGIN,
            TAB_WIDTH + CONTENT_MARGIN + 5, CONTENT_TOP,
            color=(80, 90, 70, 255),
            line_width=1,
        )

        self.ui.draw()
