import { describe, it, expect } from 'vitest';
import { addFear, makeFearSystem, setupFear } from '../../src/engine/fear';

describe('fear system', () => {
  it('earns a card when generated fear hits the pool size', () => {
    const fs = makeFearSystem();
    setupFear(fs, 1);
    expect(fs.fearPool).toBe(4);
    expect(fs.earnedFearCards.length).toBe(0);

    addFear(fs, 4);
    expect(fs.earnedFearCards.length).toBe(1);
    expect(fs.totalCardsEarned).toBe(1);
  });

  it('advances to terror level 2 after 3 cards', () => {
    const fs = makeFearSystem();
    setupFear(fs, 1);
    expect(fs.terrorLevel).toBe(1);
    addFear(fs, 12); // 3 cards worth
    expect(fs.totalCardsEarned).toBe(3);
    expect(fs.terrorLevel).toBe(2);
  });

  it('advances to terror level 3 after 6 cards', () => {
    const fs = makeFearSystem();
    setupFear(fs, 1);
    addFear(fs, 24);
    expect(fs.totalCardsEarned).toBe(6);
    expect(fs.terrorLevel).toBe(3);
  });

  it('scales pool with player count', () => {
    const fs = makeFearSystem();
    setupFear(fs, 2);
    expect(fs.fearPool).toBe(8);
  });
});
