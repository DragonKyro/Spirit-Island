import { describe, it, expect } from 'vitest';
import {
  BLIGHT_CARDS,
  cloneBlightCard,
  removeBlight,
  setupBlight,
} from '../../src/engine/blight';

describe('blight card', () => {
  it('flips to blighted side when healthy side empties', () => {
    // Use a standard card (e.g. 'Downward Spiral': 2 healthy, 5 blighted)
    const card = cloneBlightCard(
      BLIGHT_CARDS.find((c) => c.name === 'Downward Spiral')!,
    );
    setupBlight(card, 1);
    expect(card.blightRemaining).toBe(2);
    expect(card.isFlipped).toBe(false);

    removeBlight(card);
    expect(card.isFlipped).toBe(false);
    const ok = removeBlight(card);
    expect(ok).toBe(true);
    expect(card.isFlipped).toBe(true);
    expect(card.blightRemaining).toBe(5);
  });

  it('returns false (game lost) when blighted side empties on a loss card', () => {
    const card = cloneBlightCard(
      BLIGHT_CARDS.find((c) => c.name === 'Back Against the Wall')!,
    );
    setupBlight(card, 1);
    // 2 healthy + 2 blighted = 4 total removes, last one is loss
    removeBlight(card);
    removeBlight(card); // flips
    removeBlight(card);
    const ok = removeBlight(card);
    expect(ok).toBe(false);
  });

  it('still-healthy card does not lose when empty', () => {
    const card = cloneBlightCard(
      BLIGHT_CARDS.find((c) => c.name === 'Strong Earth Shatters Slowly')!,
    );
    setupBlight(card, 1);
    removeBlight(card);
    const ok = removeBlight(card); // flips (blightedBlight=0 -> goes 0 immediately)
    // After flip blightRemaining = 0. Next removeBlight goes negative; should return true (not loss).
    expect(ok).toBe(true);
    expect(card.isFlipped).toBe(true);
  });
});
