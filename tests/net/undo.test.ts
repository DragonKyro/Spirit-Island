// Online undo-by-agreement and game history (gameStore), driven with synthetic action logs.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { newGame } from '../../src/engine/game';
import type { GameSetup } from '../../src/engine/state';
import { memoryStorage } from './harness';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

const setup: GameSetup = { v: 2, seed: 21, spirits: ['river', 'earth'], boards: ['A', 'B'], adversary: 'none', adversaryLevel: 0 };

/** The first two answers of a fresh game (each spirit's first Growth choice). */
function firstMoves() {
  const g = newGame(setup);
  const [a, b] = g.gs.pending;
  return [
    { d: a.id, k: a.options[0].key, s: a.owner },
    { d: b.id, k: b.options[0].key, s: b.owner },
  ];
}

describe('online undo by agreement', () => {
  it('undoes the last move once every seated player agrees', async () => {
    const { useGameStore } = await import('../../src/store/gameStore');
    const st = useGameStore.getState();
    st.startOnline(setup, 0);
    const [m1, m2] = firstMoves();
    const log: unknown[] = [m1, m2, { u: 'req', n: 2, s: 0 }];
    useGameStore.getState().syncOnline(log);
    expect(useGameStore.getState().game!.answers.length).toBe(2);
    expect(useGameStore.getState().undoRequest?.yes).toEqual([0]);
    log.push({ u: 'yes', r: 2, s: 1 });
    useGameStore.getState().syncOnline(log);
    expect(useGameStore.getState().game!.answers.length).toBe(1);
    expect(useGameStore.getState().undoRequest).toBeNull();
  });

  it('a decline, or a move landing first, cancels the request', async () => {
    const { useGameStore } = await import('../../src/store/gameStore');
    useGameStore.getState().startOnline(setup, 1);
    const [m1, m2] = firstMoves();
    const log: unknown[] = [m1, { u: 'req', n: 1, s: 0 }, { u: 'no', r: 1, s: 1 }];
    useGameStore.getState().syncOnline(log);
    expect(useGameStore.getState().undoRequest).toBeNull();
    expect(useGameStore.getState().game!.answers.length).toBe(1);
    log.push({ u: 'req', n: 1, s: 0 }, m2, { u: 'yes', r: 3, s: 1 });
    useGameStore.getState().syncOnline(log);
    expect(useGameStore.getState().game!.answers.length).toBe(2); // m2 cancelled the request
    expect(useGameStore.getState().undoRequest).toBeNull();
  });

  it('a stale request (wrong move count) is ignored', async () => {
    const { useGameStore } = await import('../../src/store/gameStore');
    useGameStore.getState().startOnline(setup, 0);
    const [m1] = firstMoves();
    useGameStore.getState().syncOnline([m1, { u: 'req', n: 5, s: 0 }]);
    expect(useGameStore.getState().undoRequest).toBeNull();
  });
});

describe('history', () => {
  it('records a finished game once, replacing it if re-finished', async () => {
    const { recordGame, loadHistory } = await import('../../src/store/history');
    const g = newGame({ ...setup, spirits: ['river'], boards: ['A'] });
    recordGame(g, 'local');
    expect(loadHistory().length).toBe(0); // still in progress
    g.gs.result = { kind: 'DEFEAT', reason: 'test' };
    recordGame(g, 'local');
    recordGame(g, 'local');
    const h = loadHistory();
    expect(h.length).toBe(1);
    expect(h[0].result).toBe('DEFEAT');
    expect(h[0].spirits).toEqual(['river']);
  });
});
