import { describe, expect, it } from 'vitest';
import { aiChoose } from '../../src/engine/ai';
import { applyAnswer, newGame } from '../../src/engine/game';
import type { Game } from '../../src/engine/game';
import type { GameSetup } from '../../src/engine/state';
import type { AdversaryId, SpiritId } from '../../src/engine/types';

/** Let the AI answer every decision until the game ends (or a step cap). */
export function playAI(g: Game, maxSteps = 4000): number {
  let steps = 0;
  while (g.gs.result.kind === 'IN_PROGRESS' && steps < maxSteps) {
    const dec = g.gs.pending[0];
    const k = aiChoose(g, dec);
    expect(dec.options.some((o) => o.key === k)).toBe(true);
    expect(applyAnswer(g, { d: dec.id, k })).toBe(true);
    steps++;
  }
  return steps;
}

describe('heuristic AI', () => {
  it('plays complete games without getting stuck', () => {
    for (const [sid, adv] of [['river', 'none'], ['lightning', 'prussia']] as [SpiritId, AdversaryId][]) {
      const setup: GameSetup = { v: 1, seed: 31, spirits: [sid], boards: ['A'], adversary: adv, adversaryLevel: adv === 'none' ? 0 : 1 };
      const g = newGame(setup);
      const steps = playAI(g);
      expect(g.gs.result.kind, `${sid} stuck after ${steps}`).not.toBe('IN_PROGRESS');
    }
  }, 120000);
});
