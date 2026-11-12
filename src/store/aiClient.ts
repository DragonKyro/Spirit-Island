// Ask the AI for a choice: in a Web Worker when available, otherwise inline.
import type { SeatedAnswer } from '../engine/game';
import type { GameSetup } from '../engine/state';
import { decide } from './aiDecide';
import type { AIEngine } from './aiDecide';

let worker: Worker | null = null;
let broken = false;
let seq = 0;
const waiting = new Map<number, (k: string | null) => void>();

function getWorker(): Worker | null {
  // (dev only: ?noworker runs the AI on the main thread, which headless browsers can wait for)
  if (broken || typeof Worker === 'undefined' || (import.meta.env.DEV && location.search.includes('noworker'))) return null;
  if (!worker) {
    try {
      worker = new Worker(new URL('./aiWorker.ts', import.meta.url), { type: 'module' });
      worker.onmessage = (e: MessageEvent<{ id: number; k: string | null }>) => {
        waiting.get(e.data.id)?.(e.data.k);
        waiting.delete(e.data.id);
      };
      worker.onerror = () => {
        broken = true;
        worker = null;
        for (const [, resolve] of waiting) resolve(null);
        waiting.clear();
      };
    } catch {
      broken = true;
      return null;
    }
  }
  return worker;
}

function inline(setup: GameSetup, answers: SeatedAnswer[], d: number, engine: AIEngine, quick = false): Promise<string | null> {
  return decide(setup, answers, d, engine, quick);
}

/** Stop a worker that is stuck on a long think; the next request starts a fresh one. */
function restartWorker(): void {
  worker?.terminate();
  worker = null;
  for (const [, resolve] of waiting) resolve(null);
  waiting.clear();
}

/** How long the worker may think before this choice is made the quick way instead. */
const THINK_LIMIT = 20000;

export function askAI(setup: GameSetup, answers: SeatedAnswer[], d: number, engine: AIEngine = 'search'): Promise<string | null> {
  const w = getWorker();
  if (!w) return inline(setup, answers, d, engine);
  const id = ++seq;
  return new Promise((resolve) => {
    // never hang: if the worker doesn't answer in time, restart it and choose the quick way
    // (a full think on the main thread would freeze the page)
    const timer = setTimeout(() => {
      if (!waiting.has(id)) return;
      waiting.delete(id);
      restartWorker();
      inline(setup, answers, d, 'search', true).then(resolve);
    }, THINK_LIMIT);
    waiting.set(id, (k) => {
      clearTimeout(timer);
      if (k !== null || !broken) resolve(k);
      else inline(setup, answers, d, engine).then(resolve);
    });
    w.postMessage({ id, setup, answers, d, engine });
  });
}
