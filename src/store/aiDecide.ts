// One AI decision, for the Web Worker and for the inline fallback alike.

import { aiChoose, aiQuickChoose } from '../engine/ai';
import { replay } from '../engine/game';
import type { SeatedAnswer } from '../engine/game';
import { neuralChoose, neuralSupports, replayTracked } from '../engine/nn/neural';
import type { GameSetup } from '../engine/state';
import { loadNeuralPolicy } from './neuralPolicy';

/** 'neural': the trained network (solo games; instant). 'search': the heuristic AI that looks ahead (any table; slower). */
export type AIEngine = 'neural' | 'search';

/**
 * The option key the AI picks for decision `d` of the game `setup` + `answers`, or null if `d` is
 * no longer pending. The neural engine hands over to the search AI for games it cannot play (more
 * than one Spirit), when its file is unavailable, or if it fails.
 */
export async function decide(setup: GameSetup, answers: SeatedAnswer[], d: number, engine: AIEngine, quick = false): Promise<string | null> {
  if (engine === 'neural' && !quick) {
    try {
      const policy = await loadNeuralPolicy();
      if (policy && neuralSupports(setup, policy)) {
        const { game, stalled } = replayTracked(setup, answers);
        const dec = game.gs.pending.find((x) => x.id === d);
        return dec ? neuralChoose(policy, game, dec, stalled).key : null;
      }
    } catch (e) {
      console.warn('[ai] neural AI failed, using the search AI:', (e as Error).message);
    }
  }
  const g = replay(setup, answers, { quiet: true });
  const dec = g.gs.pending.find((x) => x.id === d);
  return dec ? (quick ? aiQuickChoose : aiChoose)(g, dec) : null;
}
