// Hidden information: quiet games, determinize(), and the AI's simulations not peeking.
import { describe, expect, it } from 'vitest';
import { DECISION_KINDS } from '../../src/engine/decide';
import { newGame, replay } from '../../src/engine/game';
import { determinize, unseenFearCards } from '../../src/engine/hidden';
import { observe } from '../../src/engine/observe';
import type { GameState } from '../../src/engine/state';
import { playRandomly, sampleSetups } from './play';

/** The whole state as JSON, without the log (and the quiet switch). */
const stateJson = (gs: GameState) => JSON.stringify({ ...gs, log: undefined, quiet: undefined });
const hiddenJson = (gs: GameState) =>
  JSON.stringify([gs.invader.deck.map((c) => c.id), gs.fear.deck, gs.fear.earned, gs.minorDeck, gs.majorDeck, gs.blight.card, gs.rng]);

describe('quiet games', () => {
  it('play out exactly like logged ones, without a log', () => {
    for (const setup of sampleSetups().slice(0, 4)) {
      const g = newGame(setup);
      playRandomly(g, setup.seed + 1, undefined, 600);
      const q = replay(setup, g.answers, { quiet: true });
      expect(q.gs.log).toEqual([]);
      expect(g.gs.log.length).toBeGreaterThan(0);
      expect(stateJson(q.gs)).toBe(stateJson(g.gs));
      expect(q.gs.pending.map((d) => d.id)).toEqual(g.gs.pending.map((d) => d.id));
    }
  });
});

describe('determinize', () => {
  it('re-deals only hidden information, consistently, and the game plays on', () => {
    let changed = 0;
    for (const setup of sampleSetups()) {
      const g = newGame(setup, { quiet: true });
      let checks = 0;
      playRandomly(g, setup.seed + 2, (game, d) => {
        if (checks >= 30 || d.id % 7) return;
        checks++;
        const sim = replay(game.setup, game.answers, { quiet: true });
        const before = observe(sim.gs, d);
        const stages = sim.gs.invader.deck.map((c) => c.stage);
        const minor = [...sim.gs.minorDeck].sort();
        const was = hiddenJson(sim.gs);
        determinize(sim.gs, 12345 + d.id);
        if (hiddenJson(sim.gs) !== was) changed++;
        // public information is untouched: the observation is identical
        expect(observe(sim.gs, d)).toEqual(before);
        // deck positions keep their stage; no card is in two places
        const inv = sim.gs.invader;
        expect(inv.deck.map((c) => c.stage)).toEqual(stages);
        const ids = [...inv.deck, ...inv.discard, ...inv.ravage, ...inv.build, ...(inv.highImmigration ?? [])].map((c) => c.id);
        expect(new Set(ids).size).toBe(ids.length);
        const f = sim.gs.fear;
        const fear = [...f.deck, ...f.earned, ...f.discard];
        expect(new Set(fear).size).toBe(fear.length);
        expect([...sim.gs.minorDeck].sort()).toEqual(minor);
        // the sampled world is a legal game: it plays on to the end
        if (checks % 10 === 1) {
          playRandomly(sim, d.id);
          expect(sim.gs.result.kind).not.toBe('IN_PROGRESS');
        }
      });
      expect(checks).toBeGreaterThan(0);
    }
    expect(changed).toBeGreaterThan(20);
  });

  it('depends only on public information and the seed', () => {
    for (const setup of sampleSetups()) {
      const g = newGame(setup, { quiet: true });
      playRandomly(g, setup.seed + 3, undefined, 150 + setup.seed % 50);
      if (g.gs.result.kind !== 'IN_PROGRESS') continue;
      // two worlds that look the same to the players (b's hidden parts already re-dealt differently)…
      const a = replay(setup, g.answers, { quiet: true });
      const b = replay(setup, g.answers, { quiet: true });
      determinize(b.gs, 999);
      // …come out identical from the same seed
      determinize(a.gs, 7);
      determinize(b.gs, 7);
      expect(stateJson(b.gs)).toBe(stateJson(a.gs));
    }
  });

  it('keeps Fear Cards turned face-up where they are', () => {
    const g = newGame({ v: 2, seed: 5, spirits: ['bringer'], boards: ['A'], adversary: 'none', adversaryLevel: 0 }, { quiet: true });
    const gs = g.gs;
    const id = gs.fear.deck[2];
    gs.fear.revealed.push(id);
    expect(unseenFearCards(gs)).not.toContain(id);
    for (let seed = 1; seed < 20; seed++) {
      determinize(gs, seed);
      expect(gs.fear.deck[2]).toBe(id);
      expect(gs.fear.deck.filter((x) => x === id)).toHaveLength(1);
    }
  });
});

describe('decision kinds', () => {
  it('every decision has a kind, and the core ones all occur', () => {
    const seen = new Set<string>();
    for (const setup of sampleSetups()) {
      const g = newGame(setup, { quiet: true });
      playRandomly(g, setup.seed + 4, (_g, d) => {
        expect(DECISION_KINDS).toContain(d.kind);
        seen.add(d.kind);
      });
    }
    for (const k of ['growth', 'play', 'power', 'presenceTrack', 'presenceAdd', 'targetLand', 'damage', 'push', 'pushTo', 'gather', 'cardKeep', 'powerDeck', 'fear']) {
      expect(seen, k).toContain(k);
    }
  });
});
