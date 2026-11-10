// The shipped neural player: its file, token fitting, the forward pass on real decisions, and the stall guard.
// (That the forward pass equals PyTorch's is checked in training/spirit/test_training.py.)
import { readFileSync, statSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import type { Decision } from '../../src/engine/decide';
import { applyAnswer, newGame } from '../../src/engine/game';
import { capsFor, fitObservation } from '../../src/engine/nn/fit';
import { STALL_LIMIT, StallTracker, neuralChoose, neuralSupports, replayTracked } from '../../src/engine/nn/neural';
import { SpiritPolicy } from '../../src/engine/nn/runtime';
import { OBS_VERSION, observe } from '../../src/engine/observe';
import type { GameSetup } from '../../src/engine/state';
import { playRandomly, sampleSetups } from './play';

const FILE = new URL('../../src/engine/nn/spirit-policy.bin', import.meta.url);
const policy = SpiritPolicy.parse(readFileSync(FILE));
const solo = sampleSetups().slice(0, 8);

describe('the shipped policy file', () => {
  it('is small, solo, and matches the current observation layout', () => {
    expect(statSync(FILE).size).toBeLessThan(1_000_000);
    expect(policy.players).toBe(1);
    expect(policy.obsVersion).toBe(OBS_VERSION);
    expect(policy.meta.source).toBe('update_001000.json');
  });

  it('rejects files that are not policies, and observations from another layout', () => {
    expect(() => SpiritPolicy.parse(new Uint8Array(64))).toThrow(/not a Spirit Island policy/);
    const g = newGame(solo[0], { quiet: true });
    const o = fitObservation(observe(g.gs, g.gs.pending[0]), capsFor(1));
    expect(() => policy.logits({ ...o, version: OBS_VERSION + 1 })).toThrow(/observation v/);
  });

  it('plays solo tables only', () => {
    expect(neuralSupports(solo[0], policy)).toBe(true);
    expect(neuralSupports(sampleSetups()[8], policy)).toBe(false);
  });
});

describe('forward pass on real decisions', () => {
  it('scores every option, deterministically and quickly', () => {
    let rows = 0;
    let ms = 0;
    for (const setup of solo) {
      const g = newGame(setup, { quiet: true });
      playRandomly(g, setup.seed + 6, (game, d) => {
        if (d.options.length < 2 || rows > 400) return;
        const o = observe(game.gs, d);
        const t0 = performance.now();
        const a = policy.scoreOptions(o);
        ms += performance.now() - t0;
        rows++;
        expect(a.length).toBe(d.options.length);
        expect(a.every(Number.isFinite)).toBe(true);
        expect(policy.scoreOptions(o)).toEqual(a);
        const best = policy.choose(o);
        expect(a[best]).toBe(Math.max(...a));
      });
    }
    expect(rows).toBeGreaterThan(100);
    console.log(`neural forward pass: ${(ms / rows).toFixed(1)} ms per decision (${rows} decisions)`);
    expect(ms / rows).toBeLessThan(100);
  }, 120_000);

  it('plays whole games to the end (the search AI steps in if it stalls)', () => {
    for (const setup of [solo[1], solo[4]]) {
      const g = newGame(setup, { quiet: true });
      let steps = 0;
      const tracker = new StallTracker();
      while (g.gs.result.kind === 'IN_PROGRESS' && steps++ < 6000) {
        const d = g.gs.pending[0];
        const { key } = neuralChoose(policy, g, d, tracker.update(g.gs, g.answers.length));
        expect(d.options.some((o) => o.key === key)).toBe(true);
        applyAnswer(g, { d: d.id, k: key }, d.owner >= 0 ? d.owner : undefined);
      }
      expect(g.gs.result.kind).not.toBe('IN_PROGRESS');
    }
  }, 300_000);
});

describe('fitting observations', () => {
  it('leaves what fits alone and cuts the rest consistently', () => {
    const g = newGame(solo[3], { quiet: true });
    let checked = 0;
    playRandomly(g, 11, (game, d: Decision) => {
      if (checked > 40 || d.options.length < 3) return;
      checked++;
      const o = observe(game.gs, d);
      const same = fitObservation(o, capsFor(1));
      expect(same.overflow).toBe(0);
      expect(same.land).toEqual(o.land);
      expect(same.option).toEqual(o.option);
      const tiny = fitObservation(o, { lands: 4, spirits: 1, cards: 2, options: 2 });
      expect(tiny.land.n).toBe(4);
      expect(tiny.card.n).toBe(Math.min(2, o.card.n));
      expect(tiny.option.n).toBe(2);
      expect(tiny.overflow).toBe(o.land.n - 4 + Math.max(0, o.card.n - 2) + (o.option.n - 2));
      expect(tiny.dist.length).toBe(16);
      for (let r = 0; r < 4; r++) for (let c = 0; c < 4; c++) expect(tiny.dist[r * 4 + c]).toBe(o.dist[r * o.land.n + c]);
      for (let r = 0; r < 2; r++) {
        const [land, card, spirit] = [tiny.optionRef[r * 3], tiny.optionRef[r * 3 + 1], tiny.optionRef[r * 3 + 2]];
        expect(land === -1 || land < 4).toBe(true);
        expect(card === -1 || card < tiny.card.n).toBe(true);
        expect(spirit === -1 || spirit < 1).toBe(true);
        // a reference that survives still points at the same token
        if (land >= 0) expect(land).toBe(o.optionRef[r * 3]);
      }
      expect(tiny.landIds).toEqual(o.landIds.slice(0, 4));
      // the cut observation is still scorable
      expect(policy.logits(tiny).length).toBe(2);
    });
    expect(checked).toBeGreaterThan(10);
  });
});

describe('the stall guard', () => {
  it('counts answers since the turn or phase last changed', () => {
    const g = newGame(solo[0], { quiet: true });
    const t = new StallTracker();
    expect(t.update(g.gs, 0)).toBe(0);
    expect(t.update(g.gs, 5)).toBe(5);
    g.gs.phase = 'FAST';
    expect(t.update(g.gs, 6)).toBe(0);
    expect(t.update(g.gs, 9)).toBe(3);
    g.gs.turn++;
    expect(t.update(g.gs, 9)).toBe(0);
  });

  it('replays a game and reports how long it has been in this phase', () => {
    const setup: GameSetup = solo[2];
    const g = newGame(setup, { quiet: true });
    playRandomly(g, 5, undefined, 200);
    const { game, stalled } = replayTracked(setup, g.answers);
    expect(game.answers).toEqual(g.answers);
    expect(stalled).toBeGreaterThanOrEqual(0);
    expect(stalled).toBeLessThanOrEqual(g.answers.length);
  });

  it('hands over to the search AI once a game has stalled', () => {
    const g = newGame(solo[0], { quiet: true });
    const d = g.gs.pending.find((x) => x.options.length > 1)!;
    const stuck = neuralChoose(policy, g, d, STALL_LIMIT);
    expect(stuck.byNetwork).toBe(false);
    expect(d.options.some((o) => o.key === stuck.key)).toBe(true);
    expect(neuralChoose(policy, g, d, 0).byNetwork).toBe(true);
  });
});
