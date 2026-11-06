// The neural AI's input encoding: well-formed for every decision of every Spirit,
// pointing at the right tokens, and pure.
import { describe, expect, it } from 'vitest';
import { newGame } from '../../src/engine/game';
import {
  CARD_CAT, CARD_NUM, DECISION_CAT, DECISION_NUM, GLOBAL_CAT, GLOBAL_NUM, LAND_CAT, LAND_NUM, MAX_DIST, NUM_MAX,
  OPTION_CAT, OPTION_CLASSES, OPTION_NUM, OPTION_REF, POWER_VOCAB, SOURCE_VOCAB, SPIRIT_CAT, SPIRIT_NUM, observe,
} from '../../src/engine/observe';
import type { Observation, TokenBlock } from '../../src/engine/observe';
import { playRandomly, sampleSetups } from './play';

function checkBlock(b: TokenBlock, cat: readonly string[], num: readonly string[], name: string) {
  expect(b.cat.length, name).toBe(b.n * cat.length);
  expect(b.num.length, name).toBe(b.n * num.length);
  const badNum = [...b.num].findIndex((v) => !(v >= 0 && v <= NUM_MAX));
  expect(badNum, `${name}: ${num[badNum % num.length]}`).toBe(-1);
  expect([...b.cat].every((v) => v >= 0), name).toBe(true);
}

function check(o: Observation) {
  checkBlock(o.land, LAND_CAT, LAND_NUM, 'land');
  checkBlock(o.spirit, SPIRIT_CAT, SPIRIT_NUM, 'spirit');
  checkBlock(o.card, CARD_CAT, CARD_NUM, 'card');
  checkBlock(o.global, GLOBAL_CAT, GLOBAL_NUM, 'global');
  checkBlock(o.decision, DECISION_CAT, DECISION_NUM, 'decision');
  checkBlock(o.option, OPTION_CAT, OPTION_NUM, 'option');
  expect(o.dist.length).toBe(o.land.n * o.land.n);
  expect([...o.dist].every((v) => v <= MAX_DIST)).toBe(true);
  const powers = Array.from({ length: o.card.n }, (_, i) => o.card.cat[i * CARD_CAT.length]);
  expect(powers.every((v) => v > 0 && v < POWER_VOCAB.length)).toBe(true);
  const rows = Array.from({ length: o.option.n }, (_, i) => i);
  expect(rows.every((i) => o.option.cat[i * OPTION_CAT.length] < OPTION_CLASSES.length)).toBe(true);
  expect(o.optionRef.length).toBe(o.option.n * OPTION_REF.length);
  expect(rows.every((i) => o.optionRef[i * 3] < o.land.n && o.optionRef[i * 3 + 1] < o.card.n && o.optionRef[i * 3 + 2] < o.spirit.n)).toBe(true);
}

describe('observe', () => {
  it('encodes every decision of random games for every Spirit', () => {
    let n = 0;
    const unknownSources = new Set<string>();
    const classes = new Set<number>();
    for (const setup of sampleSetups()) {
      const g = newGame(setup, { quiet: true });
      playRandomly(g, setup.seed + 5, (game, d) => {
        const o = observe(game.gs, d);
        check(o);
        n++;
        if (d.sourceId && !SOURCE_VOCAB.includes(d.sourceId)) unknownSources.add(d.sourceId);
        // options point at the tokens they mention
        d.options.forEach((opt, i) => {
          classes.add(o.option.cat[i * OPTION_CAT.length]);
          if (opt.space) expect(o.landIds[o.optionRef[i * 3]]).toBe(opt.space);
          if (opt.card) expect(o.cardKeys[o.optionRef[i * 3 + 1]]).toBe(`card:${opt.card}`);
          if (opt.key.startsWith('innate:')) expect(o.cardKeys[o.optionRef[i * 3 + 1]]).toBe(opt.key);
          if (opt.spirit !== undefined) expect(o.optionRef[i * 3 + 2]).toBe(opt.spirit);
        });
        if (d.about?.space) expect(o.landIds[o.decisionRef[0]]).toBe(d.about.space);
      });
    }
    expect(n).toBeGreaterThan(500);
    expect([...unknownSources]).toEqual([]);
    // most option classes show up (some are rare in random play)
    expect(classes.size).toBeGreaterThan(OPTION_CLASSES.length - 6);
  });

  it('is fast', () => {
    const setup = sampleSetups()[1];
    const g = newGame(setup, { quiet: true });
    const obs: [typeof g.gs, (typeof g.gs.pending)[number]][] = [];
    playRandomly(g, 11, (game, d) => void obs.push([structuredClone(game.gs), d]), 300);
    for (let r = 0; r < 3; r++) for (const [gs, d] of obs) observe(gs, d); // warm up
    const t0 = performance.now();
    for (let r = 0; r < 10; r++) for (const [gs, d] of obs) observe(gs, d);
    const us = ((performance.now() - t0) * 1000) / (10 * obs.length);
    console.log(`observe: ${us.toFixed(0)} µs per decision (${obs.length} decisions)`);
    expect(us).toBeLessThan(2000);
  });

  it('is pure and deterministic', () => {
    const setup = sampleSetups()[3];
    const g = newGame(setup, { quiet: true });
    playRandomly(g, 9, (game, d) => {
      if (d.id % 5) return;
      const before = JSON.stringify(game.gs);
      const a = observe(game.gs, d);
      expect(JSON.stringify(game.gs)).toBe(before);
      expect(observe(game.gs, d)).toEqual(a);
    }, 800);
  });

  it('sees the board from the deciding Spirit (multiplayer)', () => {
    const setup = sampleSetups()[8];
    const g = newGame(setup, { quiet: true });
    // play on until two Spirits decide at once (Growth)
    playRandomly(g, 3, undefined, 0);
    while (new Set(g.gs.pending.map((d) => d.owner)).size < 2) playRandomly(g, g.answers.length, undefined, 1);
    const d0 = g.gs.pending[0];
    const d1 = g.gs.pending.find((d) => d.owner !== d0.owner)!;
    const a = observe(g.gs, d0);
    const b = observe(g.gs, d1);
    const isMe = SPIRIT_NUM.indexOf('isMe');
    expect(a.spirit.num[d0.owner * SPIRIT_NUM.length + isMe]).toBe(1);
    expect(b.spirit.num[d1.owner * SPIRIT_NUM.length + isMe]).toBe(1);
    expect(a.spirit.num[d1.owner * SPIRIT_NUM.length + isMe]).toBe(0);
  });
});
