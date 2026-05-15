export interface BlightCard {
  name: string;
  healthyBlight: number;
  blightedBlight: number;
  blightedEffect: string;
  immediateEffect: string;
  blightedLoss: boolean;
  isStillHealthy: boolean;
  isFlipped: boolean;
  blightRemaining: number;
}

interface BlightCardSpec {
  name: string;
  healthyBlight: number;
  blightedBlight: number;
  blightedEffect: string;
  immediateEffect?: string;
  blightedLoss?: boolean;
  isStillHealthy?: boolean;
}

function spec(s: BlightCardSpec): BlightCard {
  return {
    name: s.name,
    healthyBlight: s.healthyBlight,
    blightedBlight: s.blightedBlight,
    blightedEffect: s.blightedEffect,
    immediateEffect: s.immediateEffect ?? '',
    blightedLoss: s.blightedLoss ?? true,
    isStillHealthy: s.isStillHealthy ?? false,
    isFlipped: false,
    blightRemaining: 0,
  };
}

export const BLIGHT_CARDS: BlightCard[] = [
  // Standard Blighted Island
  spec({ name: 'Aid from Lesser Spirits', healthyBlight: 2, blightedBlight: 2,
    immediateEffect: 'Draw 1 Minor Power Card per player plus 1 more. Give 1 to each Spirit. They may be used every turn as if played, but cost no Card Plays/Energy. Place unselected cards in Minor Powers discard pile.',
    blightedEffect: '' }),
  spec({ name: 'Downward Spiral', healthyBlight: 2, blightedBlight: 5,
    blightedEffect: 'At the start of each Invader Phase each Spirit destroys 1 of their Presence.' }),
  spec({ name: 'Unnatural Proliferation', healthyBlight: 2, blightedBlight: 3,
    immediateEffect: 'Each Spirit adds 1 Blight to a land with their Presence. On Each Board: Add 1 Town to a land with City, and 2 Explorers to the land with fewest Towns/Cities (min. 1).',
    blightedEffect: '' }),
  spec({ name: 'Memory Fades to Dust', healthyBlight: 2, blightedBlight: 4,
    blightedEffect: 'At the start of each Invader Phase each Spirit Forgets a Power or destroys 1 of their Presence.' }),
  spec({ name: 'Back Against the Wall', healthyBlight: 2, blightedBlight: 2,
    blightedEffect: 'Every Spirit Phase each Spirit gains +1 Energy and +1 Card Play.' }),
  spec({ name: 'All Things Weaken', healthyBlight: 2, blightedBlight: 3,
    blightedEffect: 'Ongoing, starting next turn: Invaders and Dahan have -1 Health (min. 1). The land takes Blight on 1 less Damage (normally 1). When you add Blight, it Destroys all Explorers/Towns in that land and 1 Presence (total) in an adjacent land.' }),
  spec({ name: 'Tipping Point', healthyBlight: 2, blightedBlight: 5,
    immediateEffect: 'Destroy 3 Presence from each Spirit.',
    blightedEffect: '' }),
  spec({ name: 'Erosion of Will', healthyBlight: 2, blightedBlight: 3,
    immediateEffect: '2 Fear per player. Each Spirit destroys 1 of their Presence and loses 1 Energy.',
    blightedEffect: '' }),
  spec({ name: 'Blight Corrodes the Spirit', healthyBlight: 2, blightedBlight: 4,
    blightedEffect: 'Each Invader Phase: On Each Board, Destroy 1 Presence in a land with Blight.' }),
  spec({ name: 'Thriving Communities', healthyBlight: 2, blightedBlight: 4,
    immediateEffect: 'On each board: In 4 different lands with Explorer/Town, Replace 1 Town with 1 City or Replace 1 Explorer with 1 Town.',
    blightedEffect: '' }),
  spec({ name: 'Promising Farmlands', healthyBlight: 2, blightedBlight: 4,
    immediateEffect: 'On each board: Add 1 Town and 1 Explorer to an Inland land with no Town/City.',
    blightedEffect: '' }),
  spec({ name: 'Burn Brightest Before the End', healthyBlight: 2, blightedBlight: 2,
    immediateEffect: 'Each Spirit Adds 1 Presence to one of their lands or removes 1 Presence from their Presence Tracks. (Presence removed from Tracks goes to the supply.)',
    blightedEffect: '' }),
  spec({ name: 'Disintegrating Ecosystem', healthyBlight: 2, blightedBlight: 5,
    immediateEffect: 'On each board: Destroy 1 Beast, then add 1 Blight to a land with Town/City.',
    blightedEffect: '' }),
  spec({ name: 'Intensifying Exploitation', healthyBlight: 2, blightedBlight: 5,
    blightedEffect: 'Ongoing, starting next turn: During Ravage Actions, Invaders deal +2 Damage (per land).' }),
  spec({ name: 'A Pall Upon the Land', healthyBlight: 2, blightedBlight: 3,
    immediateEffect: 'On each board: destroy 1 Presence and remove 1 City.',
    blightedEffect: '' }),
  spec({ name: 'Power Corrodes the Spirit', healthyBlight: 2, blightedBlight: 4,
    blightedEffect: 'At the start of each Invader Phase each Spirit Destroys 1 of their Presence if they have 3 or more Power Cards in play, or have a Power Card in play costing 4 or more (printed) Energy.' }),
  spec({ name: 'Shattered Fragments of Power', healthyBlight: 2, blightedBlight: 2,
    immediateEffect: 'Draw 1 Major Power Card per Spirit plus 2 more. Each Spirit Takes 1 and gains 2 Energy. (Discard the 2 unselected cards.)',
    blightedEffect: '' }),
  spec({ name: 'Slow Dissolution of Will', healthyBlight: 2, blightedBlight: 3,
    immediateEffect: 'Each Spirit chooses one of Mountains, Beasts, or Wilds.',
    blightedEffect: 'Each Invader Phase: Each Spirit Replaces 1 Presence with their chosen type of Spirit Token.' }),
  spec({ name: 'Attenuated Essence', healthyBlight: 2, blightedBlight: 4,
    blightedEffect: 'Each Invader Phase: Each Spirit with at least 5 Presence on the island Destroys 1 Presence.' }),
  spec({ name: 'Untended Land Crumbles', healthyBlight: 2, blightedBlight: 4,
    blightedEffect: 'At the start of each Invader Phase, On Each Board: Add 1 Blight to a land adjacent to Blight. Spirits may prevent this on any/all boards; each board to be protected requires jointly paying 3 Energy or Destroying 1 Presence from that board.' }),

  // Still-Healthy Island (no loss when empty)
  spec({ name: 'Strong Earth Shatters Slowly', healthyBlight: 2, blightedBlight: 0,
    immediateEffect: 'Each player adds 1 Blight (from this card) to a land adjacent to Blight.',
    blightedEffect: '', blightedLoss: false, isStillHealthy: true }),
  spec({ name: 'Invaders Find the Land to Their Liking', healthyBlight: 2, blightedBlight: 0,
    immediateEffect: 'If the Terror Level is I / II / III, add 1 / 1.5 / 2 Fear Markers per player to the Fear pool. (Round down at Terror Level II.)',
    blightedEffect: '', blightedLoss: false, isStillHealthy: true }),
  spec({ name: 'The Border of Life and Death', healthyBlight: 1, blightedBlight: 0,
    blightedEffect: 'Now and Each Invader Phase: Each Spirit with at least 2 Presence on the island Destroys 1 Presence and may discard a Power Card to gain 1 Energy.',
    blightedLoss: false, isStillHealthy: true }),
  spec({ name: 'Thriving Crops', healthyBlight: 2, blightedBlight: 0,
    immediateEffect: 'On Each Board, Build in 3 lands. (Build Actions in lands without Invaders normally Build 1 Explorer.)',
    blightedEffect: '', blightedLoss: false, isStillHealthy: true }),
];

export function setupBlight(card: BlightCard, numPlayers: number): void {
  card.blightRemaining = card.healthyBlight * numPlayers;
  card.isFlipped = false;
}

/** Returns true if game can continue, false if game is lost. */
export function removeBlight(card: BlightCard): boolean {
  card.blightRemaining -= 1;
  if (card.blightRemaining <= 0 && !card.isFlipped) {
    card.isFlipped = true;
    card.blightRemaining = card.blightedBlight;
    return true;
  }
  if (card.blightRemaining <= 0 && card.isFlipped) {
    return !card.blightedLoss;
  }
  return true;
}

export function returnBlight(card: BlightCard): void {
  card.blightRemaining += 1;
}

export function cloneBlightCard(card: BlightCard): BlightCard {
  return { ...card };
}
