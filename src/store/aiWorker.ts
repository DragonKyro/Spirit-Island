// Runs the AI off the main thread: rebuild the game from its log, then choose.
import { decide } from './aiDecide';
import type { AIEngine } from './aiDecide';
import type { SeatedAnswer } from '../engine/game';
import type { GameSetup } from '../engine/state';

interface Request {
  id: number;
  setup: GameSetup;
  answers: SeatedAnswer[];
  d: number;
  engine: AIEngine;
}

self.onmessage = async (e: MessageEvent<Request>) => {
  const { id, setup, answers, d, engine } = e.data;
  let k: string | null = null;
  try {
    k = await decide(setup, answers, d, engine);
  } catch (err) {
    console.warn('[ai] failed', err);
  }
  (self as unknown as Worker).postMessage({ id, k });
};
