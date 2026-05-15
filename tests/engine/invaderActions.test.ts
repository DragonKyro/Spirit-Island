import { describe, it, expect } from 'vitest';
import { createSoloBoard, hasInvaders, townCount, cityCount, explorerCount } from '../../src/engine/land';
import { build, explore, ravage } from '../../src/engine/invaderActions';
import { makeInvader, makeDahan } from '../../src/engine/pieces';

// Layout (Board D):
//   L1=Wetland coastal, L2=Jungle coastal, L3=Wetland coastal,
//   L4=Sands inland, L5=Mountain inland, L6=Jungle inland,
//   L7=Sands inland, L8=Mountain inland.
//   L5 (idx 4) borders L8 (idx 7) — both mountain — useful for explore tests.

describe('explore', () => {
  it('adds explorers to matching terrain lands accessible from a town/city', () => {
    const lands = createSoloBoard();
    // Place a town in L5 (idx 4, mountain inland). L8 (idx 7) is mountain
    // and adjacent to L5, so it should also get an explorer.
    lands[4].invaders.push(makeInvader('TOWN'));
    const events = explore(lands, ['MOUNTAIN']);
    expect(explorerCount(lands[4])).toBe(1); // L5 has the town → accessible
    expect(explorerCount(lands[7])).toBe(1); // L8 adjacent to L5
    expect(events.length).toBe(2);
  });

  it('coastal lands are explorable from the ocean without any town/city', () => {
    const lands = createSoloBoard();
    // No towns anywhere. L2 (idx 1) is jungle + coastal — should get explorer.
    // L6 (idx 5) is jungle but inland with no adjacent town/city — should NOT.
    explore(lands, ['JUNGLE']);
    expect(explorerCount(lands[1])).toBe(1);
    expect(explorerCount(lands[5])).toBe(0);
  });

  it('inland land with no adjacent invader source gets nothing', () => {
    const lands = createSoloBoard();
    explore(lands, ['MOUNTAIN']);
    expect(explorerCount(lands[4])).toBe(0); // L5 inland, no source
    expect(explorerCount(lands[7])).toBe(0); // L8 inland, no source
  });
});

describe('build', () => {
  it('builds town if more cities than towns', () => {
    const lands = createSoloBoard();
    lands[0].invaders.push(makeInvader('CITY'));
    build(lands, ['WETLAND']);
    expect(townCount(lands[0])).toBe(1);
    expect(cityCount(lands[0])).toBe(1);
  });

  it('builds city if more towns than cities', () => {
    const lands = createSoloBoard();
    lands[0].invaders.push(makeInvader('TOWN'));
    build(lands, ['WETLAND']);
    expect(cityCount(lands[0])).toBe(1);
    expect(townCount(lands[0])).toBe(1);
  });

  it('skips lands without invaders', () => {
    const lands = createSoloBoard();
    const events = build(lands, ['WETLAND']);
    expect(events.length).toBe(0);
    expect(hasInvaders(lands[0])).toBe(false);
  });
});

describe('ravage', () => {
  it('damages dahan, blights land at >= 2 damage, and dahan fight back', () => {
    const lands = createSoloBoard();
    lands[0].invaders.push(makeInvader('CITY')); // damage 3
    lands[0].dahan.push(makeDahan());

    const result = ravage(lands, ['WETLAND']);
    expect(result.blightLands).toContain(0);
    // City (hp 3) takes 2 from one dahan, not destroyed
    expect(lands[0].invaders.length).toBe(1);
    // Dahan should be destroyed by 3 damage
    expect(lands[0].dahan.length).toBe(0);
    expect(result.fearGenerated).toBe(0);
  });

  it('dahan can destroy explorers without taking blight or fear', () => {
    const lands = createSoloBoard();
    lands[0].invaders.push(makeInvader('EXPLORER')); // hp 1, dmg 1
    lands[0].dahan.push(makeDahan());

    const result = ravage(lands, ['WETLAND']);
    expect(lands[0].invaders.length).toBe(0);
    expect(lands[0].dahan.length).toBe(1);
    expect(result.fearGenerated).toBe(0); // explorer destroyed → 0 fear
  });

  it('defend reduces damage', () => {
    const lands = createSoloBoard();
    lands[0].invaders.push(makeInvader('TOWN'));
    lands[0].defend = 5;
    const result = ravage(lands, ['WETLAND']);
    expect(result.blightLands).not.toContain(0);
    expect(lands[0].defend).toBe(0); // defend consumed
  });
});
