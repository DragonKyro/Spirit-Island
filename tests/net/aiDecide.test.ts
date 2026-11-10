// The AI's single entry point: which engine answers, and what happens when the network can't.
import { readFileSync } from 'node:fs';
import { describe, expect, it, vi } from 'vitest';
import { applyAnswer, newGame } from '../../src/engine/game';
import { SpiritPolicy } from '../../src/engine/nn/runtime';
import type { GameSetup } from '../../src/engine/state';

const file = readFileSync(new URL('../../src/engine/nn/spirit-policy.bin', import.meta.url));
let available = true;
vi.mock('../../src/store/neuralPolicy', () => ({
  loadNeuralPolicy: async () => (available ? SpiritPolicy.parse(file) : null),
}));

const solo: GameSetup = { v: 2, seed: 7, spirits: ['river'], boards: ['A'], adversary: 'none', adversaryLevel: 0 };
const duo: GameSetup = { v: 2, seed: 7, spirits: ['river', 'earth'], boards: ['A', 'B'], adversary: 'none', adversaryLevel: 0 };

async function check(setup: GameSetup, engine: 'neural' | 'search') {
  const { decide } = await import('../../src/store/aiDecide');
  const g = newGame(setup);
  const answers = g.answers;
  for (let i = 0; i < 6; i++) {
    const d = g.gs.pending.find((x) => x.options.length > 1)!;
    const k = await decide(setup, answers, d.id, engine);
    expect(d.options.some((o) => o.key === k), `${engine} answered ${k} for ${d.prompt}`).toBe(true);
    applyAnswer(g, { d: d.id, k: k! }, d.owner >= 0 ? d.owner : undefined);
  }
  // a decision that is no longer pending has no answer
  expect(await decide(setup, answers, 999_999, engine)).toBeNull();
}

describe('decide', () => {
  it('answers with either engine in a solo game', async () => {
    await check(solo, 'neural');
    await check(solo, 'search');
  }, 120_000);

  it('the neural engine is the network: it answers like neuralChoose', async () => {
    const { decide } = await import('../../src/store/aiDecide');
    const { neuralChoose, replayTracked } = await import('../../src/engine/nn/neural');
    const policy = SpiritPolicy.parse(file);
    const g = newGame(solo);
    const d = g.gs.pending.find((x) => x.options.length > 1)!;
    const { game, stalled } = replayTracked(solo, []);
    expect(await decide(solo, [], d.id, 'neural')).toBe(neuralChoose(policy, game, d, stalled).key);
  });

  it('falls back to the search AI for tables the network was not trained on, and when its file is missing', async () => {
    await check(duo, 'neural');
    available = false;
    try {
      await check(solo, 'neural');
    } finally {
      available = true;
    }
  }, 120_000);
});
