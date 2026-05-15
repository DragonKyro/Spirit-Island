import { Terrain } from './pieces';

export type InvaderStage = 'I' | 'II' | 'III';

export interface InvaderCard {
  stage: InvaderStage;
  terrains: Terrain[];
  hasEscalation: boolean;
}

export function invaderCardLabel(card: InvaderCard): string {
  const names = card.terrains
    .map((t) => t.charAt(0) + t.slice(1).toLowerCase())
    .join('/');
  return `Stage ${card.stage}: ${names}`;
}

export const STAGE_I_CARDS: InvaderCard[] = [
  { stage: 'I', terrains: ['JUNGLE'], hasEscalation: false },
  { stage: 'I', terrains: ['MOUNTAIN'], hasEscalation: false },
  { stage: 'I', terrains: ['SANDS'], hasEscalation: false },
  { stage: 'I', terrains: ['WETLAND'], hasEscalation: false },
];

export const STAGE_II_CARDS: InvaderCard[] = [
  { stage: 'II', terrains: ['JUNGLE'], hasEscalation: true },
  { stage: 'II', terrains: ['MOUNTAIN'], hasEscalation: true },
  { stage: 'II', terrains: ['SANDS'], hasEscalation: true },
  { stage: 'II', terrains: ['WETLAND'], hasEscalation: true },
  { stage: 'II', terrains: ['JUNGLE', 'MOUNTAIN'], hasEscalation: true },
  { stage: 'II', terrains: ['JUNGLE', 'SANDS'], hasEscalation: true },
  { stage: 'II', terrains: ['JUNGLE', 'WETLAND'], hasEscalation: true },
  { stage: 'II', terrains: ['MOUNTAIN', 'SANDS'], hasEscalation: true },
  { stage: 'II', terrains: ['MOUNTAIN', 'WETLAND'], hasEscalation: true },
  { stage: 'II', terrains: ['SANDS', 'WETLAND'], hasEscalation: true },
];

export const STAGE_III_CARDS: InvaderCard[] = [
  { stage: 'III', terrains: ['JUNGLE', 'MOUNTAIN'], hasEscalation: false },
  { stage: 'III', terrains: ['JUNGLE', 'SANDS'], hasEscalation: false },
  { stage: 'III', terrains: ['JUNGLE', 'WETLAND'], hasEscalation: false },
  { stage: 'III', terrains: ['MOUNTAIN', 'SANDS'], hasEscalation: false },
  { stage: 'III', terrains: ['MOUNTAIN', 'WETLAND'], hasEscalation: false },
  { stage: 'III', terrains: ['SANDS', 'WETLAND'], hasEscalation: false },
];

export interface InvaderDeck {
  deck: InvaderCard[];
  ravageCard: InvaderCard | null;
  buildCard: InvaderCard | null;
  discard: InvaderCard[];
}

export function deckIsEmpty(d: InvaderDeck): boolean {
  return d.deck.length === 0;
}

export function deckCardsRemaining(d: InvaderDeck): number {
  return d.deck.length;
}

export function deckDraw(d: InvaderDeck): InvaderCard | null {
  return d.deck.shift() ?? null;
}

/** Slide cards left: ravage -> discard, build -> ravage, explore -> build. */
export function deckAdvance(d: InvaderDeck, newExploreCard: InvaderCard | null): void {
  if (d.ravageCard) d.discard.push(d.ravageCard);
  d.ravageCard = d.buildCard;
  d.buildCard = newExploreCard;
}

function sampleAndShuffle<T>(arr: readonly T[], n: number): T[] {
  const copy = [...arr];
  // Fisher-Yates
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j], copy[i]];
  }
  return copy.slice(0, Math.min(n, copy.length));
}

/** 3 Stage I + 4 Stage II + 5 Stage III, shuffled within stage, stacked I→III. */
export function buildInvaderDeck(): InvaderDeck {
  const stageI = sampleAndShuffle(STAGE_I_CARDS, 3);
  const stageII = sampleAndShuffle(STAGE_II_CARDS, 4);
  const stageIII = sampleAndShuffle(STAGE_III_CARDS, 5);
  return {
    deck: [...stageI, ...stageII, ...stageIII],
    ravageCard: null,
    buildCard: null,
    discard: [],
  };
}
