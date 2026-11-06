import { describe, expect, it } from 'vitest';
import { CARD_LIST } from '../../src/engine/cardData';
import { CARD_EFFECTS } from '../../src/engine/cards';
import { INNATE_EFFECTS } from '../../src/engine/innates';
import { INNATES, SPIRITS, SPIRIT_ORDER } from '../../src/engine/spiritData';
import { FEAR_CARDS } from '../../src/engine/fearCards';

describe('data coverage', () => {
  it('every Power Card has an effect and vice versa', () => {
    const ids = CARD_LIST.map((c) => c.id);
    expect(ids.filter((id) => !CARD_EFFECTS[id])).toEqual([]);
    expect(Object.keys(CARD_EFFECTS).filter((id) => !ids.includes(id))).toEqual([]);
  });
  it('base game card counts: 32 Unique, 36 Minor, 22 Major', () => {
    expect(CARD_LIST.filter((c) => c.type === 'unique').length).toBe(32);
    expect(CARD_LIST.filter((c) => c.type === 'minor').length).toBe(36);
    expect(CARD_LIST.filter((c) => c.type === 'major').length).toBe(22);
    for (const sid of SPIRIT_ORDER) expect(CARD_LIST.filter((c) => c.spirit === sid).length).toBe(4);
  });
  it('every Innate has an effect', () => {
    expect(Object.keys(INNATES).filter((id) => !INNATE_EFFECTS[id])).toEqual([]);
  });
  it('15 base Fear Cards', () => {
    expect(FEAR_CARDS.length).toBe(15);
  });
  it('8 Spirits', () => {
    expect(Object.keys(SPIRITS).length).toBe(8);
  });
});
