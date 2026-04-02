import arcade
import arcade.gui

from src.constants import (
    COLOR_BACKGROUND,
    COLOR_SUBTITLE,
    COLOR_TITLE,
    BUTTON_BG,
    BUTTON_BG_HOVER,
    BUTTON_BG_PRESS,
    BUTTON_BORDER,
    BUTTON_FONT_SIZE,
    BUTTON_HEIGHT,
    BUTTON_SPACING,
    BUTTON_TEXT,
    BUTTON_WIDTH,
    WINDOW_HEIGHT,
    WINDOW_WIDTH,
)


def make_menu_button(text: str) -> arcade.gui.UIFlatButton:
    style = {
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
    return arcade.gui.UIFlatButton(
        text=text,
        width=BUTTON_WIDTH,
        height=BUTTON_HEIGHT,
        style=style,
    )


class HomeView(arcade.View):
    def __init__(self):
        super().__init__()
        self.ui = arcade.gui.UIManager()
        self.title_text: arcade.Text | None = None
        self.subtitle_text: arcade.Text | None = None

    def on_show_view(self):
        self.ui.enable()
        self._build_ui()

    def on_hide_view(self):
        self.ui.disable()

    def _build_ui(self):
        self.ui.clear()

        self.title_text = arcade.Text(
            "Spirit Island",
            x=WINDOW_WIDTH / 2,
            y=WINDOW_HEIGHT - 100,
            color=COLOR_TITLE,
            font_size=48,
            anchor_x="center",
            anchor_y="center",
            bold=True,
        )
        self.subtitle_text = arcade.Text(
            "Defend the Island",
            x=WINDOW_WIDTH / 2,
            y=WINDOW_HEIGHT - 145,
            color=COLOR_SUBTITLE,
            font_size=16,
            anchor_x="center",
            anchor_y="center",
        )

        layout = arcade.gui.UIBoxLayout(space_between=BUTTON_SPACING)

        btn_play = make_menu_button("Play")
        btn_load = make_menu_button("Load Game")
        btn_rules = make_menu_button("Rules")
        btn_stats = make_menu_button("Stats")
        btn_options = make_menu_button("Options")
        btn_credits = make_menu_button("Credits")
        btn_exit = make_menu_button("Exit")

        btn_play.on_click = self._on_play
        btn_load.on_click = self._on_load
        btn_rules.on_click = self._on_rules
        btn_stats.on_click = self._on_stats
        btn_options.on_click = self._on_options
        btn_credits.on_click = self._on_credits
        btn_exit.on_click = self._on_exit

        for btn in (btn_play, btn_load, btn_rules, btn_stats, btn_options, btn_credits, btn_exit):
            layout.add(btn)

        anchor = self.ui.add(arcade.gui.UIAnchorLayout())
        anchor.add(layout, anchor_x="center", anchor_y="center", align_y=-30)

    def on_draw(self):
        self.clear()
        arcade.draw_rect_filled(
            arcade.rect.XYWH(WINDOW_WIDTH // 2, WINDOW_HEIGHT // 2, WINDOW_WIDTH, WINDOW_HEIGHT),
            color=COLOR_BACKGROUND,
        )

        self.title_text.draw()
        self.subtitle_text.draw()

        self.ui.draw()

    def _on_play(self, _event):
        from src.views.spirit_select_view import SpiritSelectView
        self.window.show_view(SpiritSelectView(home_view=self))

    def _on_load(self, _event):
        from src.views.load_view import LoadView
        self.window.show_view(LoadView(home_view=self))

    def _on_rules(self, _event):
        from src.views.rules_view import RulesView
        self.window.show_view(RulesView(home_view=self))

    def _on_stats(self, _event):
        print("[HomeView] Stats clicked")

    def _on_options(self, _event):
        print("[HomeView] Options clicked")

    def _on_credits(self, _event):
        print("[HomeView] Credits clicked")

    def _on_exit(self, _event):
        arcade.exit()
