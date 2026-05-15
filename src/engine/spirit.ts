import { Element, PowerCard } from './pieces';

export interface PresenceTrack {
  values: number[];
  presenceRemaining: number;
}

export function makePresenceTrack(values: number[]): PresenceTrack {
  return { values, presenceRemaining: values.length - 1 };
}

export function currentTrackValue(track: PresenceTrack): number {
  const revealedIndex = track.values.length - 1 - track.presenceRemaining;
  return track.values[Math.min(revealedIndex, track.values.length - 1)];
}

export function removeTrackPresence(track: PresenceTrack): number | null {
  if (track.presenceRemaining > 0) {
    track.presenceRemaining -= 1;
    return currentTrackValue(track);
  }
  return null;
}

export interface GrowthOption {
  description: string;
  addPresenceRange: number;
  gainEnergy: number;
  gainPowerCard: boolean;
  reclaimAll: boolean;
}

export interface InnatePower {
  name: string;
  speed: 'fast' | 'slow';
  description: string;
}

export interface Spirit {
  name: string;
  complexity: 'Low' | 'Moderate' | 'High' | 'Very High';
  color: string;

  energyTrack: PresenceTrack;
  cardPlaysTrack: PresenceTrack;
  growthOptions: GrowthOption[];
  startingPresenceLands: number[];

  hand: PowerCard[];
  discardPile: PowerCard[];
  playedCards: PowerCard[];

  energy: number;
  elements: Partial<Record<Element, number>>;

  totalPresence: number;
  presenceOnBoard: number;

  innatePowers: InnatePower[];
}

export function energyPerTurn(s: Spirit): number {
  return currentTrackValue(s.energyTrack);
}

export function cardPlays(s: Spirit): number {
  return currentTrackValue(s.cardPlaysTrack);
}

export function spiritSetup(s: Spirit): void {
  s.energyTrack.presenceRemaining = s.energyTrack.values.length - 1;
  s.cardPlaysTrack.presenceRemaining = s.cardPlaysTrack.values.length - 1;
  s.energy = 0;
  s.elements = {};
  s.playedCards = [];
  s.discardPile = [];
  s.presenceOnBoard = 0;
}

export function gainEnergyPhase(s: Spirit): number {
  const gained = energyPerTurn(s);
  s.energy += gained;
  return gained;
}

export function canPlayCard(s: Spirit, card: PowerCard): boolean {
  return s.playedCards.length < cardPlays(s) && s.energy >= card.cost;
}

export function playCard(s: Spirit, card: PowerCard): void {
  s.energy -= card.cost;
  for (const el of card.elements) {
    s.elements[el] = (s.elements[el] ?? 0) + 1;
  }
  s.hand = s.hand.filter((c) => c !== card);
  s.playedCards.push(card);
}

export function reclaimAll(s: Spirit): void {
  s.hand.push(...s.discardPile);
  s.discardPile = [];
}

export function timePasses(s: Spirit): void {
  s.discardPile.push(...s.playedCards);
  s.playedCards = [];
  s.elements = {};
}

// ─── Spirit definitions ─────────────────────────────────────────────────────

function pc(
  name: string,
  cost: number,
  speed: 'FAST' | 'SLOW',
  range: number,
  target: string,
  elements: Element[],
  description: string,
): PowerCard {
  return { name, cost, speed, range, target, elements, description };
}

export function createLightning(): Spirit {
  return {
    name: "Lightning's Swift Strike",
    complexity: 'Low',
    color: 'var(--presence-lightning)',
    energyTrack: makePresenceTrack([1, 2, 2, 3, 3, 4, 5]),
    cardPlaysTrack: makePresenceTrack([1, 2, 3, 3, 4]),
    growthOptions: [
      { description: 'Reclaim All + Gain 1 Energy', addPresenceRange: 0, gainEnergy: 1, gainPowerCard: false, reclaimAll: true },
      { description: 'Add Presence (Range 1) + Gain Power Card', addPresenceRange: 1, gainEnergy: 0, gainPowerCard: true, reclaimAll: false },
      { description: 'Add Presence (Range 2) + Gain 3 Energy', addPresenceRange: 2, gainEnergy: 3, gainPowerCard: false, reclaimAll: false },
    ],
    startingPresenceLands: [0, 2],
    innatePowers: [
      { name: 'Thundering Destruction', speed: 'slow', description: 'Destroy Invaders based on Fire/Air elements.' },
    ],
    hand: [
      pc('Shatter Homesteads', 1, 'FAST', 1, 'ANY', ['FIRE', 'AIR'], '1 Fear. Destroy 1 Town.'),
      pc('Raging Storm', 3, 'SLOW', 1, 'ANY', ['FIRE', 'AIR', 'WATER'], '2 Damage to each Invader.'),
      pc("Lightning's Boon", 1, 'FAST', 0, 'SPIRIT', ['FIRE', 'AIR'], 'Target Spirit may use 1 Slow Power as Fast.'),
      pc('Harbingers of the Lightning', 0, 'FAST', 2, 'ANY', ['FIRE', 'AIR'], 'Push up to 2 Dahan.'),
    ],
    discardPile: [],
    playedCards: [],
    energy: 0,
    elements: {},
    totalPresence: 0,
    presenceOnBoard: 0,
  };
}

export function createVitalStrength(): Spirit {
  return {
    name: 'Vital Strength of the Earth',
    complexity: 'Low',
    color: 'var(--presence-earth)',
    energyTrack: makePresenceTrack([2, 2, 3, 3, 4, 4, 5]),
    cardPlaysTrack: makePresenceTrack([1, 1, 2, 2, 3]),
    growthOptions: [
      { description: 'Reclaim All + Gain 1 Energy', addPresenceRange: 0, gainEnergy: 1, gainPowerCard: false, reclaimAll: true },
      { description: 'Add Presence (Range 2) + Gain Power Card', addPresenceRange: 2, gainEnergy: 0, gainPowerCard: true, reclaimAll: false },
      { description: 'Add Presence (Range 1) + Gain 2 Energy', addPresenceRange: 1, gainEnergy: 2, gainPowerCard: false, reclaimAll: false },
    ],
    startingPresenceLands: [4, 5],
    innatePowers: [
      { name: 'Rituals of Destruction', speed: 'slow', description: 'Destroy Invaders based on Sun/Earth elements.' },
    ],
    hand: [
      pc('Guard the Healing Land', 3, 'FAST', 1, 'ANY', ['SUN', 'EARTH', 'PLANT'], 'Defend 4. Remove 1 Blight.'),
      pc('A Year of Perfect Stillness', 3, 'FAST', 0, 'ANY', ['SUN', 'EARTH'], 'Invaders skip all Actions in target land this turn.'),
      pc('Draw of the Fruitful Earth', 1, 'SLOW', 1, 'ANY', ['SUN', 'EARTH', 'PLANT'], 'Gather up to 2 Explorers. Gather up to 2 Dahan.'),
      pc('Rituals of the Destroying Flame', 2, 'SLOW', 1, 'ANY', ['SUN', 'FIRE', 'EARTH'], '5 Damage.'),
    ],
    discardPile: [],
    playedCards: [],
    energy: 0,
    elements: {},
    totalPresence: 0,
    presenceOnBoard: 0,
  };
}

export function createRiver(): Spirit {
  return {
    name: 'River Surges in Sunlight',
    complexity: 'Low',
    color: 'var(--presence-river)',
    energyTrack: makePresenceTrack([1, 1, 2, 2, 3, 3, 4]),
    cardPlaysTrack: makePresenceTrack([1, 2, 2, 3, 3, 4]),
    growthOptions: [
      { description: 'Reclaim All', addPresenceRange: 0, gainEnergy: 0, gainPowerCard: false, reclaimAll: true },
      { description: 'Add Presence (Range 1) + Gain 1 Energy', addPresenceRange: 1, gainEnergy: 1, gainPowerCard: false, reclaimAll: false },
      { description: 'Add Presence (Range 2) + Gain Power Card', addPresenceRange: 2, gainEnergy: 0, gainPowerCard: true, reclaimAll: false },
    ],
    startingPresenceLands: [0, 1],
    innatePowers: [
      { name: 'Massive Flooding', speed: 'slow', description: 'Deal Damage based on Sun/Water elements.' },
    ],
    hand: [
      pc('Flash Floods', 2, 'FAST', 1, 'ANY', ['SUN', 'WATER'], '1 Damage. If target land is Coastal, +1 Damage.'),
      pc('Wash Away', 1, 'SLOW', 1, 'ANY', ['WATER', 'EARTH'], 'Push up to 3 Explorers / Towns.'),
      pc('Boon of Vigor', 0, 'FAST', 0, 'SPIRIT', ['SUN', 'WATER'], 'Target Spirit gains 1 Energy.'),
      pc("River's Bounty", 0, 'SLOW', 0, 'ANY', ['SUN', 'WATER', 'ANIMAL'], 'Gather up to 2 Dahan. If you have 2 Sun, +1 Dahan.'),
    ],
    discardPile: [],
    playedCards: [],
    energy: 0,
    elements: {},
    totalPresence: 0,
    presenceOnBoard: 0,
  };
}

export function createShadows(): Spirit {
  return {
    name: 'Shadows Flicker Like Flame',
    complexity: 'Low',
    color: 'var(--presence-shadow)',
    energyTrack: makePresenceTrack([1, 2, 2, 3, 3, 4, 5]),
    cardPlaysTrack: makePresenceTrack([1, 2, 2, 3, 4]),
    growthOptions: [
      { description: 'Reclaim All', addPresenceRange: 0, gainEnergy: 0, gainPowerCard: false, reclaimAll: true },
      { description: 'Add Presence (Range 1) + Gain Power Card', addPresenceRange: 1, gainEnergy: 0, gainPowerCard: true, reclaimAll: false },
      { description: 'Add Presence (Range 2) + Gain 2 Energy', addPresenceRange: 2, gainEnergy: 2, gainPowerCard: false, reclaimAll: false },
    ],
    startingPresenceLands: [3, 6],
    innatePowers: [
      { name: 'Darkness Swallows the Unwary', speed: 'fast', description: 'Generate Fear and remove Explorers based on Moon/Air elements.' },
    ],
    hand: [
      pc('Concealing Shadows', 0, 'FAST', 1, 'ANY', ['MOON', 'AIR'], '1 Fear. Dahan take no damage from Invaders this turn.'),
      pc('Favors Called Due', 1, 'FAST', 0, 'ANY', ['MOON', 'AIR', 'ANIMAL'], '2 Fear. Gather up to 4 Dahan.'),
      pc('Mantle of Dread', 1, 'SLOW', 0, 'ANY', ['MOON', 'FIRE', 'AIR'], '2 Fear. Push up to 2 Explorers.'),
      pc('Crops Wither and Fade', 1, 'SLOW', 1, 'ANY', ['MOON', 'FIRE', 'PLANT'], '1 Fear. Remove 1 Explorer. Push up to 2 Dahan.'),
    ],
    discardPile: [],
    playedCards: [],
    energy: 0,
    elements: {},
    totalPresence: 0,
    presenceOnBoard: 0,
  };
}

export const ALL_SPIRITS: Record<string, () => Spirit> = {
  "Lightning's Swift Strike": createLightning,
  'Vital Strength of the Earth': createVitalStrength,
  'River Surges in Sunlight': createRiver,
  'Shadows Flicker Like Flame': createShadows,
};
