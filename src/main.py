import arcade

from src.constants import WINDOW_HEIGHT, WINDOW_TITLE, WINDOW_WIDTH
from src.views.home_view import HomeView


def main():
    window = arcade.Window(WINDOW_WIDTH, WINDOW_HEIGHT, WINDOW_TITLE)
    home = HomeView()
    window.show_view(home)
    arcade.run()


if __name__ == "__main__":
    main()
