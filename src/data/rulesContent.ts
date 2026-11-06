// Rules reference, condensed from the Spirit Island rules reference sheet
// (docs/Spirit Island Rules.pdf). Spirit, Adversary and card details are rendered
// from the engine data in RulesView.

export interface RuleSection {
  title: string;
  body: string;
}

export const RULES_SECTIONS: RuleSection[] = [
  {
    title: 'Setup',
    body: `INVADER BOARD
- 4 Fear Markers per player go in the Fear Pool.
- Shuffle the Fear Cards and stack 9 as the Fear Deck in 3 groups of 3: the "Terror Level II" divider goes between the top and middle groups, "Terror Level III" between the middle and bottom groups. (Adversaries change these counts.)
- Invader Deck: shuffle each Stage separately; stack 5 Stage III, then 4 Stage II on top, then 3 Stage I on top.
- Take a random Blight Card, Healthy Island side up, and place the shown amount of Blight on it (2 per player, plus 1).

THE ISLAND
- One Island Board per player, arranged into the island. Populate each with Invaders, Dahan and Blight (Blight from the box, not the card) as its Setup icons show.
- Shuffle the Minor and Major Power decks.

PLAYERS
- Each player chooses a Spirit, takes its Spirit Panel and 4 Unique Power Cards, and follows its Setup instructions to place starting Presence on their own board. All other Presence fills the dashed spaces of the Presence Tracks.

INVADERS' STARTING ACTION
- Reveal the top Invader Card, Explore in that land type, then put the card in the Build space.`,
  },
  {
    title: 'Sequence of Play',
    body: `1. SPIRIT PHASE — Growth, Gain Energy, Play and Pay for Power Cards
2. FAST POWER PHASE — Fast Power Cards and Innate Powers
3. INVADER PHASE
   1. Blighted Island effect (once the Blight Card has flipped)
   2. Fear effects
   3. Invader Actions: Ravage, then Build, then Explore
   4. Advance Invader Cards
4. SLOW POWER PHASE — Slow Power Cards and Innate Powers
5. TIME PASSES

Play is simultaneous within each phase; players may confer as they wish.`,
  },
  {
    title: 'Spirit Phase',
    body: `GROWTH: Choose 1 Growth option (unless stated otherwise). You must do everything shown, but may choose the order.
- Add Presence at Range N: up to N lands from your existing Presence. Whenever you would add Presence, you may move 1 already on the board instead. Take Presence from either track, always left to right.
- Gain Energy: in addition to this turn's normal income.
- Gain a Power Card: choose Minor or Major, draw 4 (reshuffling the discard if needed), keep 1, discard the rest. After gaining a Major Power you must Forget a Power Card.
- Reclaim: return all played cards from your discard pile to your hand.

GAIN ENERGY: Gain Energy equal to the highest uncovered number on your Energy track. Energy is individual, cannot be transferred, and carries over between turns.

PLAY AND PAY FOR POWER CARDS: Play up to the highest uncovered number on your Card Plays track (unused plays do not carry over). Pay each card's Energy cost immediately and gain its Elements now, but resolve its effects later in the matching Power Phase.`,
  },
  {
    title: 'Presence & Tracks',
    body: `Presence marks the lands a Spirit occupies ("your lands"). A Sacred Site is a land where you have 2 or more Presence. Any number of Presence from any Spirits can share a land.

Destroyed Presence is removed from the game (not returned to your tracks). If any Spirit ever has no Presence on the island, the players lose.

PRESENCE TRACKS: Energy (top) and Card Plays (bottom). Only the highest revealed number counts — they are not additive.
- Reclaim One: while revealed, once each Spirit Phase you may return 1 Power Card from discard to hand.
- Bonus Element: provides that Element every turn while revealed. "Any" grants one Element of your choice, fixed for the turn once chosen.`,
  },
  {
    title: 'Powers',
    body: `Powers are Power Cards or the Innate Powers printed on a Spirit Panel.

ELEMENTS: Gained the moment you pay for a card (Fast or Slow) and lost when it leaves play. Elements are never spent — only checked. Threshold effects need all the listed Elements this turn. If you meet several thresholds, do each in order, top to bottom. You may always resolve a Power as if you had fewer Elements.

COST & SPEED: Energy cost in the top-left circle: red = Fast (resolves before the Invader Phase), blue = Slow (after).

RANGE: The most lands away from your Presence a Power can reach; Range 0 is a land with your Presence. Some Powers must be used from a Sacred Site or a land of a given terrain.

TARGET: The land type (or Spirit) a Power affects. Powers target a single land unless specified.

INNATE POWERS: Available every turn without Energy or Card Plays, but only if you have the Elements. Each triggers at most once per turn.

GENERAL PRINCIPLES
- Do as much as you can: if part of an effect can't be done, skip it and do the rest.
- You may skip a Power's effect entirely (no Energy refund, but you keep its Elements).
- One land, one turn, one use: all of a Power's effects apply to the same land; effects that don't change the board last only this turn; each Power is used once (a Slow Power made Fast may only be used in the Fast phase).
- Fast and Slow Powers may be resolved in any order, but may not interrupt one another. You cannot delay a Fast Power to a later phase.`,
  },
  {
    title: 'Effects Glossary',
    body: `DAMAGE: Means "Damage to Invaders" unless stated. Divide it among Invaders in the land as you choose; an Invader taking Damage ≥ its Health is Destroyed. Damage from several Powers combines.
DESTROY: Remove from the board to the supply. Destroying a Town = 1 Fear; a City = 2 Fear.
REMOVE: Return to the supply — no Fear.
REPLACE: Remove a piece and put another in its place (a replaced Invader keeps its Damage). No Fear.
DEFEND N: Reduces the total Damage Invaders deal to the land and Dahan by N. Defends in a land add up and last the whole turn.
GATHER: Move pieces into the target land from adjacent lands.
PUSH: Move pieces out of the target land into adjacent lands (never off the board or into the Ocean). Range boosts don't affect Gather / Push distance.
REPEAT: Use a Power's effects again (same speed, no new Elements; may pick a new target). Repeats never chain.
FORGET: Permanently lose a Power Card from hand, discard or play (Unique cards leave the game). Forgetting a card in play removes its Elements.
UP TO: may be zero.
OUTNUMBER: "A outnumbers B" is true where there is no B, as long as there is at least one A.`,
  },
  {
    title: 'Invader Phase',
    body: `BLIGHTED ISLAND: once the Blight Card has flipped, follow its instructions. It never flips back.

FEAR: Flip the earned Fear Cards and resolve them in the order earned, using only the effect for the current Terror Level. "Each player" effects: one player fully resolves, then the next. A Fear Card earned during this goes to the bottom of the stack being resolved.

The Invader Card in each Action space chooses the land type(s) affected; with no card there, that action doesn't happen.

RAVAGE (in each land of the shown type with Invaders): Explorers deal 1, Towns 2, Cities 3 Damage, minus any Defend.
1. Damage the land: 2 or more Damage adds 1 Blight (only 1, however much Damage).
2. Fight the Dahan: every 2 Damage destroys 1 Dahan, as efficiently as possible; a Dahan with 1 Damage is damaged until end of turn.
3. Dahan fight back (skipped if this Ravage was stopped): each surviving Dahan deals 2 Damage to the Invaders, divided as you choose.

BUILD (in each land of the shown type that has Invaders): if the land has more Towns than Cities, add a City; otherwise add a Town.

EXPLORE: Reveal the top Invader Card (if it has the Escalation flag and you're playing an Adversary, do its Escalation first). If there is no card to reveal, you lose. In each land of the shown type that contains a Town / City, or is adjacent to a Town, City or the Ocean, add 1 Explorer (only 1 per land).

ADVANCE: Slide every Invader Card one space left (Ravage → discard, Build → Ravage, Explore → Build).`,
  },
  {
    title: 'Time Passes',
    body: `- Discard every Power Card played this turn to your personal discard pile.
- All Elements and Damage clear; damaged pieces are restored. Defend and other this-turn effects end.`,
  },
  {
    title: 'Fear & Terror',
    body: `Fear comes from Powers with the Fear symbol and from destroying Towns (1) and Cities (2).

Each Fear moves one marker from the Fear Pool to Generated Fear. When the pool is empty, the top Fear Card is earned (face-down), the markers return to the pool, and leftover Fear stays generated.

If earning a card reveals a Terror Level divider, the new Terror Level — and its easier victory condition — takes effect immediately. Earned Fear Cards are resolved during the next Invader Phase. If you earn the last Fear Card, the Invaders flee and you win.`,
  },
  {
    title: 'Blight',
    body: `When Blight is added during play it comes from the Blight Card; removed Blight returns there.

After Setup, adding Blight to a land:
- CASCADE: if the land already had Blight, also add Blight to 1 adjacent land (which can Cascade again).
- DESTROY PRESENCE: destroys 1 Presence of each Spirit in that land.

When the last Blight leaves the Healthy Island side, flip the card to Blighted Island and add the Blight it shows (per player). If the last Blight ever leaves the Blighted Island side, you lose.

Blight added during Setup (e.g. by an Adversary) does not Cascade or destroy Presence.`,
  },
  {
    title: 'Invaders & Dahan',
    body: `EXPLORER: 1 Health, 1 Damage.
TOWN: 2 Health, 2 Damage. An Invader source for Explore. 1 Fear when Destroyed.
CITY: 3 Health, 3 Damage. An Invader source for Explore. 2 Fear when Destroyed.
Invader numbers are not limited by the pieces in the box.

DAHAN: 2 Health. Each board starts with 6. Dahan only attack when a Spirit Power prompts them or when attacked: after Invaders Ravage a land, each surviving Dahan there deals 2 Damage. Damage from Spirits never hurts Dahan, though some Powers destroy them as a side effect.`,
  },
  {
    title: 'Boards & Lands',
    body: `Each island board has 8 numbered lands, 2 of each terrain (Jungle, Mountain, Sands, Wetland). Two lands are adjacent when they touch — even across boards or only at a corner. Lands touching the Ocean are Coastal; the rest are Inland. The Ocean is not a land and is not in play (except for Ocean's Hungry Grasp).`,
  },
  {
    title: 'Victory & Defeat',
    body: `You win immediately whenever you meet the victory condition for the current Terror Level:
- Terror Level I: no Invaders on the island.
- Terror Level II: no Towns or Cities.
- Terror Level III: no Cities.

You lose if:
- Too much Blight: the last Blight comes off the Blight Card (Blighted side).
- A Spirit is destroyed: any Spirit has no Presence on the island.
- Time runs out: you must reveal an Invader Card to Explore but the deck is empty.
- (Some Adversaries add a loss condition.)

If an effect causes you to both win and lose, you win a Sacrifice Victory.`,
  },
  {
    title: 'Scoring',
    body: `VICTORY: 5 × Difficulty, +10, +2 per Invader Card left in the deck, +1 per (players) living Dahan, −1 per (players) Blight on the island.
DEFEAT: 2 × Difficulty, +1 per Invader Card not in the deck (discard and face-up), +1 per (players) living Dahan, −1 per (players) Blight on the island.`,
  },
  {
    title: 'Solo Play',
    body: `A solo game works like a normal game with a single board as the whole island. You may target yourself with Powers that target "Another Spirit", but you get no extra benefit from Powers that are better when used on another Spirit (like Gift of Constancy or Elemental Boon). The luck of the draw is high, and you have no fellow Spirits to cover your Spirit's weaknesses.`,
  },
  {
    title: 'In This App',
    body: `- All rules are enforced automatically; Invader actions, Fear, Blight and Terror Levels are resolved for you, and you are asked whenever a rule gives a choice (where to Push, how to divide Damage, where Blight Cascades…).
- Power Cards are gained the standard way (choose Minor or Major, draw 4, keep 1). The beginner Power Progression cards are not used.
- A random base-game Blight Card (Downward Spiral or Memory Fades to Dust) is always used.
- Boards A–D join in the standard layouts for 1–4 players. Land shapes are traced from the printed boards, and every land, terrain, adjacency and Setup piece matches them.
- After each Invader Phase a playback panel steps through what happened (Fear, Ravage, Build, Explore), highlighting the lands involved; replay it any time with "▶ Invaders".
- Solo games save automatically in this browser; Undo steps back one choice. Online, any player can ask to undo the last move — it happens once every seated player agrees.
- Finished games are kept under "History & stats" on the home screen.`,
  },
];
