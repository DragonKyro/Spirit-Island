// Runs the heuristic AI off the main thread: rebuild the game from its log, then choose.
import { aiChoose } from '../engine/ai';
import { replay } from '../engine/game';
import type { SeatedAnswer } from '../engine/game';
import type { GameSetup } from '../engine/state';

interface Request {
  id: number;
  setup: GameSetup;
  answers: SeatedAnswer[];
  d: number;
}

self.onmessage = (e: MessageEvent<Request>) => {
  const { id, setup, answers, d } = e.data;
  let k: string | null = null;
  try {
    const g = replay(setup, answers);
    const dec = g.gs.pending.find((x) => x.id === d);
    if (dec) k = aiChoose(g, dec);
  } catch (err) {
    console.warn('[ai] failed', err);
  }
  (self as unknown as Worker).postMessage({ id, k });
};
