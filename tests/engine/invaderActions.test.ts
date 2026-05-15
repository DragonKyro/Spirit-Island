import { describe, it, expect } from 'vitest';
import { createSoloBoard, hasInvaders, townCount, cityCount, explorerCount } from '../../src/engine/land';
import { build, explore, ravage } from '../../src/engine/invaderActions';
import { makeInvader, makeDahan } from '../../src/engine/pieces';

describe('explore', () => {
  it('adds explorers to matching terrain lands accessible from town/city', () => {
    const lands = createSoloBoard();
    // Place a town in land 0 (jungle, coastal). Land 4 (jungle, inland, adj to 0) should also get explorer.
    lands[0].invaders.push(makeInvader('TOWN'));
    const events = explore(lands, ['JUNGLE']);
    // Land 0 has town -> accessible. Land 4 is jungle and adjacent to land 0.
    expect(explorerCount(lands[0])).toBe(1);
    expect(explorerCount(lands[4])).toBe(1);
    expect(events.length).toBe(2);
  });

  it('respects coastal access without a town', () => {
    const lands = createSoloBoard();
    // No towns anywhere. Coastal jungle (land 0) should still get an explorer.
    const events = explore(lands, ['JUNGLE']);
    expect(explorerCount(lands[0])).toBe(1);
    // Inland jungle (land 4) has no adjacent town/city -> NOT accessible
    expect(explorerCount(lands[4])).toBe(0);
    expect(events.length).toBe(1);
  });
});

describe('build', () => {
  it('builds town if more cities than towns', () => {
    const lands = createSoloBoard();
    lands[0].invaders.push(makeInvader('CITY'));
    build(lands, ['JUNGLE']);
    expect(townCount(lands[0])).toBe(1);
    expect(cityCount(lands[0])).toBe(1);
  });

  it('builds city if more towns than cities', () => {
    const lands = createSoloBoard();
    lands[0].invaders.push(makeInvader('TOWN'));
    build(lands, ['JUNGLE']);
    expect(cityCount(lands[0])).toBe(1);
    expect(townCount(lands[0])).toBe(1);
  });

  it('skips lands without invaders', () => {
    const lands = createSoloBoard();
    const events = build(lands, ['JUNGLE']);
    expect(events.length).toBe(0);
    expect(hasInvaders(lands[0])).toBe(false);
  });
});

describe('ravage', () => {
  it('damages dahan, blights land at >= 2 damage, and dahan fight back', () => {
    const lands = createSoloBoard();
    lands[0].invaders.push(makeInvader('CITY')); // damage 3
    lands[0].dahan.push(makeDahan()); // hp 2, dmg 2

    const result = ravage(lands, ['JUNGLE']);
    expect(result.blightLands).toContain(0);
    // City (hp 3) takes 2 from one dahan, not destroyed
    expect(lands[0].invaders.length).toBe(1);
    // Dahan should be destroyed by 3 damage
    expect(lands[0].dahan.length).toBe(0);
    // No fear since city survived
    expect(result.fearGenerated).toBe(0);
  });

  it('dahan can destroy invaders and generate fear', () => {
    const lands = createSoloBoard();
    lands[0].invaders.push(makeInvader('EXPLORER')); // hp 1, dmg 1
    lands[0].dahan.push(makeDahan());

    const result = ravage(lands, ['JUNGLE']);
    // Explorer (dmg 1) hits dahan for 1 (not destroyed). Then dahan hits back for 2.
    expect(lands[0].invaders.length).toBe(0);
    expect(lands[0].dahan.length).toBe(1);
    // Explorer destroyed -> 0 fear
    expect(result.fearGenerated).toBe(0);
  });

  it('defend reduces damage', () => {
    const lands = createSoloBoard();
    lands[0].invaders.push(makeInvader('TOWN'));
    lands[0].defend = 5;
    const result = ravage(lands, ['JUNGLE']);
    expect(result.blightLands).not.toContain(0);
    expect(lands[0].defend).toBe(0); // defend consumed
  });
});
