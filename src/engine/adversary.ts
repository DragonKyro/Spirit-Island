// The three base-game Adversaries. Difficulty values follow the rulebook's
// Adversary & Scenario Difficulty Chart. Level effects are cumulative; they are
// implemented in phases.ts (setup, invader deck, Ravage/Build/Explore hooks).

import type { AdversaryId } from './types';

export interface AdversaryLevel {
  level: number;
  difficulty: number;
  name: string;
  text: string;
  /** Fear Cards per Terror Level group (top / middle / bottom) */
  fear: [number, number, number];
  /** Brandenburg-Prussia: Invader Deck stage order, e.g. "11-3-2222-3333" */
  deckOrder?: string;
}

export interface AdversaryDef {
  id: AdversaryId;
  name: string;
  summary: string;
  lossCondition?: string;
  escalation: { name: string; text: string } | null;
  levels: AdversaryLevel[];
}

export const ADVERSARIES: Record<AdversaryId, AdversaryDef> = {
  none: {
    id: 'none',
    name: 'No Adversary',
    summary: 'The standard game. Escalation flags on Stage II cards are ignored.',
    escalation: null,
    levels: [{ level: 0, difficulty: 0, name: 'Standard', text: 'No adversary rules.', fear: [3, 3, 3] }],
  },
  prussia: {
    id: 'prussia',
    name: 'The Kingdom of Brandenburg-Prussia',
    summary: 'Speed is the name of the game: the Invaders do everything at a faster tempo. Cards with 2 land types come up much earlier.',
    escalation: { name: 'Land Rush', text: 'On each board with Town / City, add 1 Town to a land without Town.' },
    levels: [
      { level: 0, difficulty: 1, name: 'Base', text: 'Escalation only.', fear: [3, 3, 3] },
      { level: 1, difficulty: 2, name: 'Fast Start', text: 'During Setup, on each board add 1 Town to land #3.', fear: [3, 3, 3] },
      { level: 2, difficulty: 4, name: 'Surge of Colonists', text: 'When making the Invader Deck, put 1 of the Stage III cards between Stage I and Stage II. (111-3-2222-3333)', fear: [3, 3, 3], deckOrder: '111-3-2222-3333' },
      { level: 3, difficulty: 6, name: 'Efficient', text: 'When making the Invader Deck, remove an additional Stage I card. (11-3-2222-3333)', fear: [3, 4, 3], deckOrder: '11-3-2222-3333' },
      { level: 4, difficulty: 7, name: 'Aggressive Timetable', text: 'When making the Invader Deck, remove an additional Stage II card. (11-3-222-3333)', fear: [4, 4, 3], deckOrder: '11-3-222-3333' },
      { level: 5, difficulty: 9, name: 'Ruthlessly Efficient', text: 'When making the Invader Deck, remove an additional Stage I card. (1-3-222-3333)', fear: [4, 4, 3], deckOrder: '1-3-222-3333' },
      { level: 6, difficulty: 10, name: 'Terrifyingly Efficient', text: 'When making the Invader Deck, remove all Stage I cards. (3-222-3333)', fear: [4, 4, 4], deckOrder: '3-222-3333' },
    ],
  },
  england: {
    id: 'england',
    name: 'The Kingdom of England',
    summary: 'Buildings, buildings, and more buildings — the colonies spill over into unexplored lands, pushing hard to found a capital during Stage II.',
    lossCondition: 'Proud & Mighty Capital: If 7 or more Town / City are ever in a single land, the Invaders win.',
    escalation: { name: 'Building Boom', text: 'On each board with Town / City, Build in the land with the most Town / City.' },
    levels: [
      { level: 0, difficulty: 1, name: 'Base', text: 'Escalation and additional loss condition only.', fear: [3, 3, 3] },
      { level: 1, difficulty: 3, name: 'Indentured Servants Earn Land', text: 'Invader Build Cards affect matching lands without Invaders if they are adjacent to at least 2 Town / City.', fear: [3, 4, 3] },
      { level: 2, difficulty: 4, name: 'Criminals and Malcontents', text: 'During Setup, on each board add 1 City to land #1 and 1 Town to land #2.', fear: [4, 4, 3] },
      { level: 3, difficulty: 6, name: 'High Immigration (I)', text: 'Put the High Immigration tile to the left of Ravage. The Invaders take this Build action each Invader Phase before Ravaging. Cards slide left from Ravage to it, and from it to the discard. Remove the tile when a Stage II card slides onto it, discarding that card.', fear: [4, 5, 4] },
      { level: 4, difficulty: 7, name: 'High Immigration (full)', text: 'The extra Build tile remains out the entire game.', fear: [4, 5, 5] },
      { level: 5, difficulty: 9, name: 'Local Autonomy', text: 'Town / City have +1 Health.', fear: [4, 5, 5] },
      { level: 6, difficulty: 10, name: 'Independent Resolve', text: 'During Setup, add an additional Fear to the Fear Pool per player. During any Invader Phase where you resolve no Fear Cards, perform the Build from High Immigration twice.', fear: [4, 5, 4] },
    ],
  },
  sweden: {
    id: 'sweden',
    name: 'The Kingdom of Sweden',
    summary: "Sweden's Ravages are more dangerous than most, with advanced military tactics and a large population interested in farming and mining; the Crown favours assimilating the Dahan.",
    escalation: {
      name: 'Swayed by the Invaders',
      text: 'After Invaders Explore into each land this Phase, if that land has at least as many Invaders as Dahan, replace 1 Dahan with 1 Town.',
    },
    levels: [
      { level: 0, difficulty: 1, name: 'Base', text: 'Escalation only.', fear: [3, 3, 3] },
      { level: 1, difficulty: 2, name: 'Heavy Mining', text: 'If the Invaders do at least 6 Damage to the land during Ravage, add an extra Blight. The additional Blight does not destroy Presence or cause cascades.', fear: [3, 4, 3] },
      { level: 2, difficulty: 3, name: 'Population Pressure at Home', text: 'During Setup, on each board add 1 City to land #4. On boards where land #4 starts with Blight, put that Blight in land #5 instead.', fear: [3, 4, 3] },
      { level: 3, difficulty: 5, name: 'Fine Steel for Tools and Guns', text: 'Town deal 3 Damage. City deal 5 Damage.', fear: [3, 4, 3] },
      { level: 4, difficulty: 6, name: 'Royal Backing', text: 'During Setup, after adding all other Invaders, discard the top card of the Invader Deck. On each board, add 1 Town to the land of that terrain with the fewest Invaders.', fear: [3, 4, 4] },
      { level: 5, difficulty: 7, name: 'Mining Rush', text: 'When Ravaging adds at least 1 Blight to a land, also add 1 Town to an adjacent land without Town / City. Cascading Blight does not cause this effect.', fear: [4, 4, 4] },
      { level: 6, difficulty: 8, name: 'Prospecting Outpost', text: 'During Setup, on each board add 1 Town and 1 Blight to land #8. The Blight comes from the box, not the Blight Card.', fear: [4, 4, 5] },
    ],
  },
};

export const ADVERSARY_ORDER: AdversaryId[] = ['none', 'prussia', 'england', 'sweden'];

export function adversaryLevel(id: AdversaryId, level: number): AdversaryLevel {
  const a = ADVERSARIES[id];
  return a.levels.find((l) => l.level === level) ?? a.levels[0];
}

/** Is level `n` of the current adversary active? (levels are cumulative) */
export function advAt(adv: AdversaryId, level: number, id: AdversaryId, n: number): boolean {
  return adv === id && level >= n;
}
