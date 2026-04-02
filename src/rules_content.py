# Transcribed from the Spirit Island rulebook PDF.
# Each entry is (section_title, body_text).

RULES_SECTIONS: list[tuple[str, str]] = [
    (
        "Setup",
        """\
OPTIONAL: Select an Adversary and/or Scenario. Follow any specified setup instructions.

NEW PLAYERS:
- Choose a low-complexity Spirit (Lightning's Swift Strike, Vital Strength of the Earth, \
River Surges in Sunlight, or Shadows Flicker Like Flame).
- Take the Power Progression Card for your Spirit. Set aside all Major and Minor Powers \
listed and, when gaining a new Power Card during the game, add the next Power Card listed instead.
- Do not use a Blight Card, Adversary, or Scenario.

INVADER BOARD:
- Place to one side of play area.
- Place 4 Fear Markers per player into the Fear Pool.
- Shuffle the Fear Cards and place 9 on the Fear Deck Space. Divide the deck into 3 groups \
of 3 cards each. Place the "Terror Level 2" divider between the top and middle groups. \
Place the "Terror Level 3" divider between the middle and bottom groups.
- Invader Deck: Shuffle the cards from each Stage separately. Select 5 Stage III cards and \
place them on the Invader Board on the Explore Action Space. Select 4 Stage II cards and \
place them on top of the Stage III cards. Then select 3 Stage I cards and place them on top \
to complete the Invader Deck.
- Take a random Blight Card and cover the Blight Space, "Healthy Island" side up, without \
looking at the back. If not using a Blight Card use the Blight instructions printed on the \
board instead.
- Place the shown amount of Blight on the card/board.

THE ISLAND AND SUPPLY:
- Randomly pick 1 Island Board per player and arrange them to form the Island.
- Populate the Island Boards with Invaders, Dahan, and Blight (from the box, not the Blight \
Card) as indicated by the icons in each land.
- Shuffle the Minor and Major Power Decks separately. Place them near the board with room \
for discards.
- Put the Energy, Cities, Towns, Explorers, and Dahan near the board for easy access.

PLAYER SETUP:
- Each player takes all Spirit Presence and Single-Turn Effect Markers of one color. Then, \
choose a Spirit. Take its Spirit Panel and its 4 Unique Power Cards.
- Each player starts on a different Island Board, following the Setup instructions on the \
back of their Spirit Panel to place starting Presence. Then flip the Spirit Panels and place \
all remaining Presence on the dashed circles on their Presence Tracks.

INVADERS' STARTING ACTION:
- Reveal the top card of the Invader Deck, complete the Explore action in that land type, \
then place that card face-up in the "Build" Action Space.""",
    ),
    (
        "Sequence of Play",
        """\
Each turn has the following phases:

1. SPIRIT PHASE
   1. Growth
   2. Gain Energy
   3. Play and Pay for Power Cards

2. FAST POWER PHASE (Cards and Innate)

3. INVADER PHASE
   1. Blighted Island Effect (once appropriate)
   2. Fear Effects
   3. Invader Actions
      a. Ravage
      b. Build
      c. Explore
   4. Advance Invader Cards

4. SLOW POWER PHASE (Cards and Innate)

5. TIME PASSES

Play is simultaneous within each phase.""",
    ),
    (
        "Spirit Phase",
        """\
Each Spirit does 3 things, in order:

GROWTH:
Choose 1 option (unless stated otherwise) next to "Growth" at the upper-right of the \
Spirit Panel. Each section is a single choice. You must do everything shown, but may \
choose the order.

Common Growth Options:
- Add 1 Presence to the board at Range 2 (up to 2 lands away from your existing Presence). \
Whenever you would add Presence, you may choose to move 1 already on the board instead.
- Gain 2 Energy (in addition to this turn's normal Energy income).
- Gain a Power Card.
- Reclaim all played Power Cards from your personal discard pile. Return them to your hand.

GAIN ENERGY:
Gain an amount of Energy equal to the highest uncovered number on your Energy Presence \
Track. Place any gained Energy on or near your Spirit Panel.
Energy is individual and cannot be transferred between Spirits. Unspent Energy carries \
over to the next turn.

PLAY AND PAY FOR POWER CARDS:
Select Power Cards (Fast and Slow) from your hand to play this turn. The maximum you can \
play is the highest uncovered number on the Card Plays Presence Track, even if you have \
enough Energy to pay for more.
You must immediately pay Energy for all Power Cards played. Energy costs are in the circle \
in the top left corner of the card. You immediately gain all Elements but do not resolve \
card effects at this time.
Card Plays are individual and cannot be shared with other Spirits. Unused Card Plays do \
NOT carry over to future turns.""",
    ),
    (
        "Fast Powers",
        """\
Players resolve Fast Powers - both Innate Powers printed on their Spirit Panel and played \
Power Cards marked with a red energy cost circle.

Resolution can be mostly simultaneous. If timing is important, Powers may be resolved in \
any order but may not interrupt another.

If a player does not (or cannot) use a Power's text effect they may skip it entirely. \
Elements are still gained.

You cannot delay using Fast Powers until a later phase.""",
    ),
    (
        "Invader Phase",
        """\
BLIGHTED ISLAND (once appropriate):
If the Blight Card has flipped to "Blighted Island", follow the instructions there. The \
Blight Card never flips back.

FEAR:
If any Fear Cards have been earned, pick up the entire stack, flip it over and resolve the \
cards one at a time in the order they were earned. For "each player" effects, one player \
fully resolves effects, then the next, etc.
Use only the effect listed next to the current Terror Level. Fear effects last only for the \
current turn. Discard them to the Fear Discard Space after use.

RAVAGE:
Invaders Ravage (deal damage simultaneously to the land and Dahan) in each land of the \
shown type only.
  Explorers = 1 Damage | Towns = 2 Damage | Cities = 3 Damage
Reduce Damage dealt by any Defend Powers played.

1. Invaders Damage the Land - If 2 or more total Damage is dealt, add a Blight to the \
land from the Blight Card/Space. Only 1 Blight is added, no matter how much Damage is \
dealt. Ignore partial Damage.
   - Cascade: If the land already has Blight, you must also add a Blight to 1 adjacent \
land. If the adjacent land has Blight, it cascades again, etc.
   - Destroy Presence: Adding Blight to a land destroys 1 Presence from each Spirit in \
that land. Destroyed Presence is removed from play.
2. Invaders Fight the Dahan - Every 2 points of Damage destroys 1 Dahan. You must destroy \
Dahan as efficiently as possible. If a Dahan is dealt 1 Damage, it is Damaged (flip it). \
Surviving Damaged Dahan recover at the end of the turn.
3. Dahan Fight Back - After Invader Damage has been fully resolved in a land (even if no \
Damage was dealt), each surviving Dahan deals 2 Damage to the Invaders, divided how you \
choose. (Skip this step in a land only if the Ravage action in that land was skipped or \
stopped.)
   - Destroying a Town generates 1 Fear.
   - Destroying a City generates 2 Fear.

BUILD:
Invaders Build either 1 City or 1 Town in each land of the shown type where they are \
present. Do not Build in lands without Invaders.
- If the land has more Towns than Cities, add a City.
- In all other cases, add a Town.

EXPLORE:
Turn the top card of the Invader Deck face up. If the card has a flag icon and you are \
playing with an Adversary, first perform the Escalation effect.
Invaders Explore in accessible lands of the shown type only. Add an Explorer if the land:
- Contains a Town or City; or
- Is adjacent to a Town, City, or Ocean.
Only add 1 Explorer, regardless of the number of adjacent sources. If there is no card to \
turn up, you lose.

ADVANCE INVADER CARDS:
Slide all Invader Cards left one space.""",
    ),
    (
        "Slow Powers",
        """\
Players resolve Slow Powers - both Innate Powers printed on their Spirit Panel and played \
Power Cards marked with a blue energy cost circle.

Resolution can be mostly simultaneous. If timing is important, Powers may be resolved in \
any order but may not interrupt another.

If a player does not (or cannot) use a Power's text effect they may skip it entirely. \
Elements are still gained.""",
    ),
    (
        "Time Passes",
        """\
DISCARD:
Players discard all Power Cards played this turn to their personal discard piles.

DAMAGE AND ELEMENTS CLEAR:
All Elements and Damage done during the turn go away. Any pieces on their sides noting \
partial Damage are returned upright.

Remove any Reminder Tokens.""",
    ),
    (
        "Victory & Defeat",
        """\
VICTORY:
You win immediately any time you meet the current victory condition for the Terror Level.
- Terror Level 1: No Invaders on the island at all.
- Terror Level 2: No Cities and no Towns on the island.
- Terror Level 3: No Cities on the island.

At the start of the game, Invaders are at Terror Level 1. As you earn Fear Cards you will \
reach new Terror Levels with easier victory conditions.

DEFEAT (you lose three ways):
- Too Much Blight: If the last Blight comes off the Blight Card, follow the instructions \
(often "you lose").
- A Spirit Is Destroyed: If any Spirit has no Presence left on the island, you lose.
- Time Runs Out: If you need to draw an Invader Card (to Explore) but that deck is empty, \
you lose.

SACRIFICE VICTORY:
If an effect causes you to both win and lose simultaneously, you win a Sacrifice Victory. \
You are destroyed but the island, Dahan, and many other Spirits survive.""",
    ),
    (
        "Fear & Terror",
        """\
Fear is generated by Spirit Powers with the Fear symbol and by destruction:
- Destroying a Town generates 1 Fear.
- Destroying a City generates 2 Fear.

For each Fear generated, advance one Fear Marker from the Fear Pool to the Generated Fear \
area.

When all Fear Markers have advanced:
- Move the top card of the Fear Deck face-down into the Earned Fear Cards area.
- If this reveals a Terror Level divider, move it to cover the old Terror Level. The new \
Terror Level and victory conditions take effect immediately.
- Move the Fear Markers back to the Fear Pool. Leftover Fear after earning a card is moved \
back to the Generated Fear area.

Cards in the Earned Fear Cards space are flipped and resolved during the next Invader \
Phase. Fear Card effects last the current turn only, unless they change the board in some \
way. After each Fear Card is resolved, move it to the Fear Discard space.

If a new Fear Card is earned from a Fear effect, place it at the bottom of the stack \
you're currently resolving.""",
    ),
    (
        "Boards & Lands",
        """\
The game is played with 1 island board per player, laid out to make an island. Each island \
board is divided into 8 numbered lands, with 2 of each terrain (Jungle, Mountain, Sands, \
and Wetland).

Most pieces only affect other pieces in the same land, unless specified.

ADJACENCY:
Two lands are adjacent when they touch, even if they're not on the same board or meet only \
at a corner.

COASTAL AND INLAND:
Each board shows a swath of Ocean, to indicate which lands are readily accessible by sea. \
Lands adjacent to the Ocean are Coastal. Lands not adjacent to the Ocean are Inland. The \
Ocean itself is not a land and is not in play.""",
    ),
    (
        "Presence",
        """\
SPIRIT PRESENCE:
Spirit Presence marks the lands a Spirit occupies. Lands with your Presence are sometimes \
referred to as "your lands".
Destroyed Presence is removed and placed next to the island. It is not returned to the \
Spirit Panels. If any Spirit ever has no Presence left on the island, the players \
immediately lose.
A land can hold any number of Presence from any number of Spirits.

SACRED SITES:
A Spirit's Sacred Sites are lands where that Spirit has more than 1 Presence. Some Powers \
can only be used from Sacred Sites.

PRESENCE TRACKS:
Each Spirit Panel contains 2 Presence Tracks. The top one is Energy Gained per turn and \
the bottom one is Card Plays. To start, all but the leftmost space on each track is \
covered by Presence. When placing Presence on the island, you can choose which track to \
take it from, but always take it from left to right.
Spirits use only the highest revealed number for their Energy Gains or Card Plays. The \
benefits are not additive.

RECLAIM ONE:
Some Spirits have a "Reclaim One" space. While this space is revealed, the Spirit may \
return 1 Power Card to their hand any time during the Spirit Phase. This ability can be \
used the same turn it is revealed.

PERMANENT ELEMENTS:
Some Spirits have bonus Elements on their Presence Tracks. These constantly provide 1 of \
the shown Elements for as long as the space is revealed. A space marked "Any" grants one \
Element each turn (chosen once per turn, cannot be changed until next turn).""",
    ),
    (
        "Powers",
        """\
Spirits affect the game using Powers - either Power Cards or Innate Powers printed on a \
Spirit Panel.

ELEMENTS:
When you play a Power Card you gain the Elements shown down the left side of the card. \
There are 8 Elements: Sun, Moon, Fire, Air, Water, Earth, Plant, and Animal.
You gain the Elements the moment you pay for a Power Card, regardless whether the Power \
is Fast or Slow, and they go away during Time Passes. Elements do not carry over from \
turn to turn.
Elements are never spent, only checked to see if they are in play.

ELEMENTAL THRESHOLDS:
Optional effects which can only be used on turns you have gained all the required Elements. \
If you meet more than one threshold under a Power, do each of them in order, from top to \
bottom. You may always resolve a Power as if you had fewer elements than you actually do.

ENERGY COST (Power Cards only):
Displayed in the circle in the top-left corner. A red circle = Fast Power. A blue circle \
= Slow Power.

RANGE:
The maximum number of lands away from your Presence this Power can reach. Range 0 means a \
land where you have Presence. Some Powers require using them from a Sacred Site or specific \
terrain (shown left of the range icon).

TARGET:
The land type this Power can target. "ANY" Powers can target any land type. Powers always \
target a single land unless specified.

INNATE POWERS (printed on Spirit Panel):
Function similarly to Power Cards, except they are automatically available every turn and \
require having certain Elements rather than spending Energy. Innate Powers never cost \
Energy or use Card Plays.

GAINING POWER CARDS:
Choose whether to gain a Minor or Major Power. Draw 4 cards and add 1 to your hand. \
Discard the others.
After you gain a Major Power you must Forget (permanently lose) one of your Power Cards.
You may Forget any card from your hand, discard, or cards in play. If you Forget a Power \
Card from play you immediately lose its Elements.

GENERAL PRINCIPLES:
- Do as much as you can: skip parts that don't apply.
- You can skip using a Power's effect entirely (you keep Elements but don't get Energy back).
- One land, one turn, one use (unless a Power explicitly says otherwise).""",
    ),
    (
        "Invaders",
        """\
There are 3 types of Invaders. A land containing any number of these is "a land with \
Invaders". Their number is not limited by the supply of pieces.

EXPLORERS:
- 1 Health, 1 Damage during Ravage.

TOWNS:
- 2 Health, 2 Damage during Ravage.
- Act as an Invader source during Explore.
- Generate 1 Fear when Destroyed.

CITIES:
- 3 Health, 3 Damage during Ravage.
- Act as an Invader source during Explore.
- Generate 2 Fear when Destroyed.

TRACKING DAMAGE:
- City takes 1 Damage: 2 more to destroy.
- City takes 2 Damage: 1 more to destroy.
- Town takes 1 Damage: 1 more to destroy.
- When a piece has taken Damage >= its Health it is Destroyed. Return it to the Supply.
- At the end of each turn (Time Passes), Damage clears.

Destroying a Town generates 1 Fear. Destroying a City generates 2 Fear.
Removing or replacing Towns/Cities does NOT generate Fear.""",
    ),
    (
        "Blight",
        """\
Blight represents environmental and spiritual harm to the island.

When Blight is added during play, take it from the Blight Card/Space. If you remove \
Blight from the island, return it to the Blight Card/Space.

If you run out of Blight on the card/space, follow its instructions. Flipped Blight Cards \
never flip back.

When Blight is added to a land (including when it Cascades) it has two effects:
1. CASCADE: If the land already has Blight, you must also add a Blight to 1 adjacent land. \
If the adjacent land has Blight, it Cascades again, etc.
2. DESTROY PRESENCE: Adding Blight to a land destroys 1 Presence from each Spirit in that \
land. Destroyed Presence is removed from play.

BLIGHT CARD:
Starts "Healthy Island" side up. When all Blight on the front is emptied onto the board, \
the card flips to "Blighted Island". If all Blight on the Blighted side runs out, the \
players lose.""",
    ),
    (
        "Dahan",
        """\
Each island board starts with 6 Dahan. Their number is not limited by the supply of pieces.

Dahan only attack Invaders when a Spirit Power prompts them to do so, or when attacked \
themselves (Dahan Fight Back during Ravage).

After Invaders Ravage a land, any surviving Dahan in that land each deal 2 Damage to the \
Invaders, divided how you choose.

Each Dahan has 2 Health. They are Destroyed by 2 Damage from Invaders. Damage from Spirits \
does not hurt Dahan, although some Spirit Powers cause Dahan casualties as a side effect.

If a Dahan takes 1 Damage, it is Damaged (flip it). Surviving Damaged Dahan recover at \
the end of the turn (Time Passes).""",
    ),
    (
        "Power Effects",
        """\
DAMAGE, DESTRUCTION, AND REMOVAL:
- Remove: return to the Supply. Does NOT generate Fear.
- Replace: remove and put something else in its place (keeps any Damage).
- Destroy: return to the Supply. Destroying a Town = 1 Fear, City = 2 Fear.
- Unless specified, "Damage" means "Damage to Invaders", divided how you choose.
- If an Invader takes Damage >= its Health it is immediately Destroyed.

DEFEND:
Reduces total Damage done by Invaders to the land and Dahan by the specified amount. \
Multiple Defend effects stack. Defend lasts the entire turn.

GATHER:
Move that many things into the target land from adjacent land(s). Multiple Gathered things \
can come from the same or different lands. Range boosts do not affect Gathering distance.

PUSH:
Move that many things out of the target land to adjacent land(s) - only 1 land away. \
Multiple Pushed things can go to the same or different lands. You cannot Push off the \
board or into the Ocean. Range boosts do not affect Push distance.

REPEAT:
Activate a Power's effects again. Repeated Powers match the original's speed (Fast/Slow). \
Elements are not gained again. Repeats cannot be chained. You may make different choices \
and choose any valid target.""",
    ),
    (
        "Solo Mode",
        """\
Solo games work much like normal games, but with a single board as the whole island.

The only difference is that you can target yourself with Powers that specifically target \
"Another Spirit", though you do not gain extra benefits from Powers that are better when \
used on another Spirit (like Gift of Constancy or Elemental Boon).

The luck of the draw is high, and you have no fellow Spirits to compensate for your \
Spirit's weaknesses or limitations.""",
    ),
    (
        "Adversaries",
        """\
Adversaries are specific colonizing Powers. If using one, choose it before Setup begins \
as some may change the Setup rules.

The Adversary panel specifies an Escalation Effect, performed when the Escalation symbol \
is revealed on Stage II Invader Cards. Some Adversaries also include additional loss \
conditions.

Each Adversary offers multiple increased difficulty levels. All listed game effects are \
cumulative: Level 3 includes effects from Levels 1 and 2.

FEAR CARDS:
As difficulty increases, reaching higher Terror levels becomes harder. Each level shows how \
many Fear cards to use and how to divide the Fear Deck.

THE KINGDOM OF BRANDENBURG-PRUSSIA:
Excellent first Adversary with few new rules; most changes occur during Setup. The Invaders \
do everything at a faster tempo. Notably harder for Spirits which need time to develop.

THE KINGDOM OF ENGLAND:
Buildings everywhere - England sends so many immigrants that colonies spill into unexplored \
lands. Constantly pushes borders forward and will push hard to found a capital during \
Stage II. Notably easier for Spirits good at wrecking Towns.

THE KINGDOM OF SWEDEN:
Sweden's Ravages are more dangerous with advanced military tactics. The Crown's policies \
favor assimilating the Dahan where Invader population is large. Notably easier for Spirits \
which can prevent Ravages. Note: Sweden can add Blight during Setup - this Blight does NOT \
Cascade or destroy Presence.""",
    ),
    (
        "Scenarios",
        """\
Scenarios change the situation the Spirits find themselves in, or the capabilities of the \
Spirits. They may involve different victory conditions or additional prerequisites.

All Scenarios have a difficulty rating on a scale of 0 (No Change) to 10 (Insanely \
Difficult).

You may play with an Adversary and a Scenario, or just one or the other. If rules from an \
Adversary and Scenario contradict, the Scenario takes precedence.""",
    ),
    (
        "Scoring",
        """\
VICTORY SCORE:
- 5 x Difficulty
- +10 Bonus for winning
- +2 per Invader Card remaining in the deck
- +1 per X living Dahan (where X = number of players)
- -1 per X Blight on the island (where X = number of players)

DEFEAT SCORE:
- 2 x Difficulty
- +1 per Invader Card not in the deck (discard + face-up under Invader Actions)
- +1 per X living Dahan (where X = number of players)
- -1 per X Blight on the island (where X = number of players)""",
    ),
]
