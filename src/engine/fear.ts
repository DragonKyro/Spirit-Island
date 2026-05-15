export type TerrorLevel = 1 | 2 | 3;

export interface FearCard {
  name: string;
  terror1: string;
  terror2: string;
  terror3: string;
}

const fc = (name: string, t1: string, t2: string, t3: string): FearCard => ({
  name,
  terror1: t1,
  terror2: t2,
  terror3: t3,
});

export const BASE_FEAR_CARDS: FearCard[] = [
  fc('Angry Mobs',
    'Each player may Replace 1 Town with 2 Explorer. 1 Fear per player who does.',
    'In each land with 2+ Explorer, Destroy 1 Explorer/Town per 2 Explorer.',
    'In each land with 2+ Explorer, Destroy 1 Invader per 2 Explorer.'),
  fc('Avoid the Dahan',
    'Invaders do not Explore into lands with at least 2 Dahan.',
    'Invaders do not Build in lands where Dahan outnumber Towns/Cities.',
    'Invaders do not Build in lands with Dahan.'),
  fc('Belief Takes Root',
    'Defend 2 in all lands with Sacred Site.',
    'Defend 2 in all lands with Sacred Site. Each Spirit gains 1 Energy per Sacred Site they have in lands with Invaders.',
    'Each player chooses a different land and removes up to 2 Health worth of Invaders per Sacred Site there.'),
  fc('Beset by Many Troubles',
    'In each land with Wilds/Beasts/Disease/Strife/Badlands, Defend 3.',
    'In each land with Wilds/Beasts/Disease/Strife/Badlands, or adjacent to 3+ such tokens, Defend 5.',
    'Every Wilds/Beasts/Disease/Strife/Badlands grants Defend 3 in its land and adjacent lands.'),
  fc('Civil Unrest',
    'On Each Board: Add 1 Strife to a Town/City in a land not matching a Ravage Card.',
    'On Each Board: Add 1 Strife to a Town/City in a land not matching a Ravage Card. Each Invader takes 1 Damage per Strife it has.',
    'On Each Board: Add 1 Strife. Each Invader takes 1 Damage per Strife it has.'),
  fc('Communities in Disarray',
    'Town/City each deal -1 Damage during Ravage. Invaders do not heal Damage at end of turn.',
    'Explorer/Town/City each deal -1 Damage during Ravage. Invaders do not heal Damage at end of turn.',
    'Explorer/Town/City each deal -2 Damage during Ravage. Invaders do not heal Damage at end of turn.'),
  fc('Dahan Attack',
    'Each player removes 1 Explorer from a land with Dahan.',
    'Each player chooses a different land with Dahan. 1 Damage per Dahan there.',
    'Each player chooses a different land with Town/City. Gather 1 Dahan into that land. Then, 2 Damage per Dahan there.'),
  fc('Dahan Enheartened',
    'Each player may Push 1 Dahan from a land with Invaders or Gather 1 Dahan into a land with Invaders.',
    'Each player chooses a different land. Gather up to 2 Dahan, then 1 Damage if Dahan are present.',
    'Each player chooses a different land. Gather up to 2 Dahan, then 1 Damage per Dahan present.'),
  fc('Dahan Gain the Edge',
    'Each player chooses a different land with Dahan. Defend 2.',
    'Each player chooses a different land with Dahan. 1 Damage and Defend 3.',
    'Each player chooses a different land with Dahan. 2 Damage and Defend 4.'),
  fc('Dahan on Their Guard',
    'In each land, Defend 1 per Dahan.',
    'In each land with Dahan, Defend 1, plus an additional Defend 1 per Dahan.',
    'In each land, Defend 2 per Dahan.'),
  fc('Dahan Raid',
    'Each player chooses a different land with Dahan. 1 Damage there.',
    'Each player chooses a different land with Dahan. 1 Damage per Dahan there.',
    'Each player chooses a different land with Dahan. 2 Damage per Dahan there.'),
  fc('Dahan Reclaim Fishing Grounds',
    'Each player chooses a different Coastal land with Dahan. 1 Damage per Dahan.',
    'Each player chooses a different Coastal land. Gather up to 1 Dahan. 1 Damage per Dahan.',
    'Each player chooses a different Coastal land. Gather up to 1 Dahan. 2 Damage per Dahan.'),
  fc('Dahan Threaten',
    'Each player adds 1 Strife in a land with Dahan.',
    'Each player adds 1 Strife in a land with Dahan. Invaders have -1 Health per Strife (min 1) this turn.',
    'Each player adds 1 Strife in a land with Dahan. In every land with Strife, 1 Damage per Dahan.'),
  fc('Daunted by the Dahan',
    '1 Fear per board with both Invaders and Dahan. Invaders do -6 Damage to Dahan (per land) during Ravage.',
    '1 Fear per board with both Invaders and Dahan. Lands with Dahan have Defend 3. Invaders do -6 Damage to Dahan (per land) during Ravage.',
    '1 Fear per board with both Invaders and Dahan. Lands with Dahan have Defend 3. Invaders do -6 Damage to Dahan (per land) during Ravage. Isolate all lands with Dahan.'),
  fc('Demoralized',
    'Defend 1 in all lands.',
    'Defend 2 in all lands.',
    'Defend 3 in all lands.'),
  fc('Depart the Dangerous Land',
    'Each player removes 1 Explorer from a land with Beasts, Disease, or 2+ Dahan.',
    'Each player removes 1 Explorer/Town from a land with Beasts, Disease, or 2+ Dahan.',
    'Each player removes up to 4 Health worth of Invaders from a land with Beasts, Disease, or 2+ Dahan.'),
  fc('Depopulation',
    'On Each Board: Replace 1 Town with 1 Explorer.',
    'On Each Board: Remove 1 Town.',
    'On Each Board: Remove 1 Town, or Replace 1 City with 1 Town.'),
  fc('Discord',
    'Each player adds 1 Strife in a different land with 2+ Invaders.',
    'Each player adds 1 Strife in a different land with 2+ Invaders. Each Invader takes 1 Damage per Strife it has.',
    'Each player adds 1 Strife in a different land with 2+ Invaders. Each Invader with Strife deals Damage to other Invaders in its land.'),
  fc('Distracted by Local Troubles',
    'On Each Board, in a land matching a Ravage Card: 1 Damage.',
    'Invaders do -1 Damage per Damage they have taken. On Each Board, in a land matching a Ravage Card: 1 Damage each to up to 2 Invaders.',
    'Invaders do -1 Damage per Damage they have taken. On Each Board, in two lands matching a Ravage Card: 2 Damage (per land).'),
  fc('Emigration Accelerates',
    'Each player removes 1 Explorer from a Coastal land.',
    'Each player removes 1 Explorer/Town from a Coastal land.',
    'Each player removes 1 Explorer/Town from any land.'),
  fc('Explorers Are Reluctant',
    'During the next normal Explore, skip the lowest-numbered land matching the Invader Card on each board.',
    'Skip the next normal Explore. During the next Invader Phase, draw an additional Explore Card.',
    'Skip the next normal Explore, but still reveal a card. Cards shift left as usual.'),
  fc('Fear of the Unseen',
    'Each player removes 1 Explorer/Town from a land with Beasts.',
    'Each player removes 1 Explorer/Town from a land with Sacred Site.',
    'Each player removes 1 Explorer/Town from a land with Sacred Site, or 1 City from a land with Beasts.'),
  fc('Flee from Dangerous Lands',
    'On Each Board: Push 1 Explorer/Town from a land with Wilds/Strife/Badlands.',
    'On Each Board: Remove 1 Explorer/Town from a land with Wilds/Strife/Badlands.',
    'On Each Board: Remove 1 Explorer/Town from any land, or Remove 1 City from a land with Wilds/Strife/Badlands.'),
  fc('Flee the Pestilent Land',
    'Each player removes 1 Explorer/Town from a land with Disease.',
    'Each player removes up to 3 Health of Invaders from a land with Disease, or 1 Explorer from an Inland land.',
    'Each player removes up to 5 Health of Invaders from a land with Disease, or 1 Explorer/Town from an Inland land.'),
  fc('Immigration Slows',
    'During the next normal Build, skip the lowest-numbered land matching the Invader Card on each board.',
    'Skip the next normal Build. The Build Card remains in place instead of shifting left.',
    'Skip the next normal Build. The Build Card shifts left as usual.'),
  fc('Isolation',
    'Each player removes 1 Explorer/Town from a land where it is the only Invader.',
    'Each player removes 1 Explorer/Town from a land with 2 or fewer Invaders.',
    'Each player removes an Invader from a land with 2 or fewer Invaders.'),
  fc('Mimic the Dahan',
    'Each player removes 1 Explorer/Town from a land with 2+ Dahan.',
    'Each player replaces 1 Explorer/Town with 1 Dahan in a land with 2+ Dahan.',
    'Each player replaces 1 Explorer/Town with 1 Dahan in a land with Dahan, or adjacent to 3+ Dahan.'),
  fc('Nerves Fray',
    'Each player adds 1 Strife in a land not matching a Ravage Card.',
    'Each player adds 2 Strife in a single land not matching a Ravage Card.',
    'Each player adds 2 Strife in a single land not matching a Ravage Card. 1 Fear per player.'),
  fc('Overseas Trade Seem Safer',
    'Defend 3 in all Coastal lands.',
    'Defend 6 in all Coastal lands. Invaders do not Build City in Coastal lands this turn.',
    'Defend 9 in all Coastal lands. Invaders do not Build in Coastal lands this turn.'),
  fc('Panic',
    'Each player adds 1 Strife in a land with Beasts/Disease/Wilds.',
    'Each player adds 1 Strife in a land with Beasts/Disease/Wilds. Invaders have -1 Health per Strife (min 1) this turn.',
    'Each player adds 1 Strife to an Invader. Invaders have -1 Health per Strife (min 1) this turn.'),
  fc('Panicked by Wild Beasts',
    'Each player adds 1 Strife in a land with or adjacent to Beasts.',
    'Each player adds 1 Strife in a land with or adjacent to Beasts. Invaders skip Explore and Build in lands with Beasts.',
    'Each player adds 1 Strife in a land with or adjacent to Beasts. Invaders skip all normal Actions in lands with Beasts.'),
  fc('Plan for Departure',
    'Each player may Gather 1 Town into a Coastal land.',
    'Each player may Gather 1 Explorer/Town into a Coastal land. Defend 2 in all Coastal lands.',
    'Each player may Gather 2 Explorer/Town into a Coastal land. Defend 4 in all Coastal lands.'),
  fc('Quarantine',
    'Explore does not affect Coastal lands.',
    'Explore does not affect Coastal lands. Lands with Disease are not a source of Invaders when Exploring.',
    'Explore does not affect Coastal lands. Invaders do not act in lands with Disease.'),
  fc('Restlessness',
    'Each player Pushes up to 1 Explorer/Town from a land not matching a Build card.',
    'Each player Pushes up to 3 Explorer/Town from a land not matching a Build card.',
    'Each player Removes up to 3 Explorer/Town from a land not matching a Build card.'),
  fc('Retreat',
    'Each player may Push up to 2 Explorer from an Inland land.',
    'Each player may Push up to 3 Explorer/Town from an Inland land.',
    'Each player may Push any number of Explorer/Town from one land.'),
  fc('Scapegoats',
    'Each Town destroys 1 Explorer in its land.',
    'Each Town destroys 1 Explorer in its land. Each City destroys 2 Explorer in its land.',
    'Destroy all Explorer in lands with Town/City. Each City destroys 1 Town in its land.'),
  fc('Seek Company',
    'On Each Board: Gather up to 1 Explorer into a land with 2+ Invaders.',
    'On Each Board: Gather up to 3 Explorer/Town from a single land into a land with 2+ Invaders.',
    'On Each Board: Gather up to 4 Explorer/Town (total) into lands with 2+ Invaders.'),
  fc('Seek Safety',
    'Each player may Push 1 Explorer into a land with more Town/City than the land it came from.',
    'Each player may Gather 1 Explorer into a land with Town/City, or Gather 1 Town into a land with City.',
    'Each player may remove up to 3 Health worth of Invaders from a land without City.'),
  fc('Sense of Dread',
    'On Each Board: Remove 1 Explorer from a land matching a Ravage Card.',
    'On Each Board: Remove 1 Explorer/Town from a land matching a Ravage Card.',
    'On Each Board: Remove 1 Invader from a land matching a Ravage Card.'),
  fc('Spreading Timidity',
    'Each player chooses a land to Isolate.',
    'Each player chooses a different land to Isolate. Defend 2 in those lands.',
    'Each player chooses a different land to Isolate. Defend 4 in those lands.'),
  fc('Struggles over Farmland',
    'Each player adds 1 Strife in a land with Blight.',
    'Each player adds 1 Strife to a Town or adds 1 Strife in a land with Blight.',
    'Each player adds 1 Strife. In each land with Blight, 1 Invader with Strife does Damage to other Invaders.'),
  fc('Supply Chains Abandoned',
    'On Each Board: Isolate one land.',
    'On Each Board: Isolate one land. If Town/City are present, skip all Build Actions there.',
    'On Each Board: Isolate two lands. In each, if Town/City are present, skip all Build Actions there.'),
  fc('Tall Tales of Savagery',
    'Each player removes 1 Explorer from a land with Dahan.',
    'Each player removes 2 Explorer or 1 Town from a land with Dahan.',
    'Remove 2 Explorer or 1 Town from each land with Dahan. Then, remove 1 City from each land with 2+ Dahan.'),
  fc('Theological Strife',
    'Each player adds 1 Strife in a land with Sacred Site.',
    'Each player adds 1 Strife in a land with Sacred Site. Each Spirit gains 1 Energy per Sacred Site they have in lands with Invaders.',
    'Each player adds 1 Strife in a land with Sacred Site. Each Invader with Strife deals Damage to other Invaders in its land.'),
  fc('Too Many Monsters',
    'Each player removes 1 Explorer/Town from a land with Beasts.',
    'Each player removes 1 Explorer and 1 Town from a land with Beasts or 1 Explorer from a land adjacent to Beasts.',
    'Each player removes 2 Explorer and 2 Town from a land with Beasts or 1 Explorer/Town from a land adjacent to Beasts.'),
  fc('Trade Suffers',
    'Invaders do not Build in lands with City.',
    'Each player may replace 1 Town with 1 Explorer in a Coastal land.',
    'Each player may, in a Coastal land, replace 1 City with 1 Town, or 1 Town with 1 Explorer.'),
  fc('Tread Carefully',
    'Each player may choose a land with Dahan or adjacent to 5+ Dahan. Invaders do not Ravage there this turn.',
    'Each player may choose a land with Dahan or adjacent to 3+ Dahan. Invaders do not Ravage there this turn.',
    'Each player may choose a land with Dahan or adjacent to Dahan. Invaders do not Ravage there this turn.'),
  fc('Unrest',
    'Each player adds 1 Strife to a Town.',
    'Each player adds 1 Strife to a Town. Invaders have -1 Health per Strife (min 1) this turn.',
    'Each player adds 1 Strife to an Invader. Invaders have -1 Health per Strife (min 1) this turn.'),
  fc('Unsettled',
    'On Each Board: Choose a land with Beasts/Strife/Wilds. Downgrade 1 Town/City there.',
    'On Each Board: Choose a land with Beasts/Strife/Wilds. Downgrade 1 Town/City there or skip the next Build Action there.',
    'On Each Board: Choose a land with Beasts/Strife/Wilds. Remove 1 Invader there or skip the next Build Action there.'),
  fc('Wary of the Interior',
    'Each player removes 1 Explorer from an Inland land.',
    'Each player removes 1 Explorer/Town from an Inland land.',
    'Each player removes 1 Explorer/Town from any land.'),
];

export interface FearSystem {
  fearMarkersPerPlayer: number;
  numPlayers: number;
  fearPool: number;
  generatedFear: number;
  fearDeck: FearCard[];
  earnedFearCards: FearCard[];
  fearDiscard: FearCard[];
  terrorLevel2At: number;
  terrorLevel3At: number;
  totalCardsEarned: number;
  terrorLevel: TerrorLevel;
}

export function makeFearSystem(): FearSystem {
  return {
    fearMarkersPerPlayer: 4,
    numPlayers: 1,
    fearPool: 4,
    generatedFear: 0,
    fearDeck: [],
    earnedFearCards: [],
    fearDiscard: [],
    terrorLevel2At: 3,
    terrorLevel3At: 6,
    totalCardsEarned: 0,
    terrorLevel: 1,
  };
}

function shuffle<T>(arr: T[]): T[] {
  const copy = [...arr];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy;
}

export function setupFear(fs: FearSystem, numPlayers: number = 1): void {
  fs.numPlayers = numPlayers;
  fs.fearPool = fs.fearMarkersPerPlayer * numPlayers;
  fs.generatedFear = 0;
  fs.totalCardsEarned = 0;
  fs.terrorLevel = 1;
  fs.fearDeck = shuffle(BASE_FEAR_CARDS).slice(0, 9);
  fs.earnedFearCards = [];
  fs.fearDiscard = [];
  fs.terrorLevel2At = 3;
  fs.terrorLevel3At = 6;
}

export function addFear(fs: FearSystem, amount: number): string[] {
  const events: string[] = [];
  fs.generatedFear += amount;

  while (fs.generatedFear >= fs.fearPool) {
    fs.generatedFear -= fs.fearPool;
    if (fs.fearDeck.length > 0) {
      const card = fs.fearDeck.shift()!;
      fs.earnedFearCards.push(card);
      fs.totalCardsEarned += 1;
      events.push(`Fear Card earned: ${card.name}`);

      if (fs.totalCardsEarned >= fs.terrorLevel3At && fs.terrorLevel !== 3) {
        fs.terrorLevel = 3;
        events.push('TERROR LEVEL 3 reached!');
      } else if (fs.totalCardsEarned >= fs.terrorLevel2At && fs.terrorLevel === 1) {
        fs.terrorLevel = 2;
        events.push('TERROR LEVEL 2 reached!');
      }
    }
  }
  return events;
}

export function resolveEarnedFearCards(fs: FearSystem): Array<{ card: FearCard; effect: string }> {
  const resolved: Array<{ card: FearCard; effect: string }> = [];
  while (fs.earnedFearCards.length > 0) {
    const card = fs.earnedFearCards.shift()!;
    const effect =
      fs.terrorLevel === 1 ? card.terror1 :
      fs.terrorLevel === 2 ? card.terror2 :
      card.terror3;
    resolved.push({ card, effect });
    fs.fearDiscard.push(card);
  }
  return resolved;
}
