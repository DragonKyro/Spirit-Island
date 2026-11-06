// The game store drives AI seats: in local games, and online (one device plays them).
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { applyAnswer, newGame } from '../../src/engine/game';
import type { GameSetup } from '../../src/engine/state';
import { memoryStorage } from './harness';

beforeEach(() => {
  vi.resetModules();
  vi.stubGlobal('localStorage', memoryStorage());
});
afterEach(() => vi.unstubAllGlobals());

const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
/** Wait until `ok()` holds (the AI's speed depends on the machine and its load). */
async function until(ok: () => boolean, ms = 15000) {
  for (const t0 = Date.now(); !ok() && Date.now() - t0 < ms; ) await wait(50);
}

describe('AI seats in local games', () => {
  it('an all-AI game plays itself, and pausing stops it', { timeout: 30000 }, async () => {
    const { useGameStore } = await import('../../src/store/gameStore');
    useGameStore.getState().setAIFast(true);
    useGameStore.getState().startLocal({ v: 1, seed: 5, spirits: ['shadows'], boards: ['B'], adversary: 'none', adversaryLevel: 0, ai: [true] });
    await until(() => useGameStore.getState().game!.answers.length > 5);
    expect(useGameStore.getState().game!.answers.length).toBeGreaterThan(5);
    useGameStore.getState().setAIPaused(true);
    await wait(400);
    const m = useGameStore.getState().game!.answers.length;
    await wait(400);
    expect(useGameStore.getState().game!.answers.length).toBe(m);
  });

  it('in a mixed game the AI never answers the human seat', { timeout: 30000 }, async () => {
    const { useGameStore, isAIDecision } = await import('../../src/store/gameStore');
    useGameStore.getState().setAIFast(true);
    useGameStore.getState().startLocal({ v: 1, seed: 6, spirits: ['river', 'earth'], boards: ['A', 'B'], adversary: 'none', adversaryLevel: 0, ai: [false, true] });
    await until(() => useGameStore.getState().game!.answers.length > 0);
    await wait(300);
    const g = useGameStore.getState().game!;
    // the human (seat 0) still has their Growth choice waiting; the AI has moved on
    expect(g.gs.pending.some((d) => d.owner === 0 && !isAIDecision(g, d))).toBe(true);
    expect(g.answers.length).toBeGreaterThan(0);
  });
});

describe('AI seats in online games', () => {
  const setup: GameSetup = { v: 1, seed: 8, spirits: ['river', 'earth'], boards: ['A', 'B'], adversary: 'none', adversaryLevel: 0, names: ['Hana', 'AI 1'], ai: [false, true] };

  /** This device plays seat 0; its sends land in `log`, which comes back to it like a room's log. */
  async function table(runner: boolean) {
    const { useGameStore } = await import('../../src/store/gameStore');
    const log: unknown[] = [];
    const st = useGameStore.getState();
    st.setAIFast(true);
    st.startOnline(setup, 0);
    st.setSender((a) => {
      log.push(a);
      setTimeout(() => useGameStore.getState().syncOnline(log.slice()), 0);
    });
    st.setAIRunner(runner);
    return { useGameStore, log };
  }

  it("the AI device sends the AI seat's moves to the log, and never the person's", { timeout: 30000 }, async () => {
    const { useGameStore, log } = await table(true);
    await until(() => log.length > 0 && useGameStore.getState().aiThinking === null && useGameStore.getState().game!.answers.length === log.length);
    expect(log.length).toBeGreaterThan(0);
    expect(log.every((e) => (e as { s: number }).s === 1)).toBe(true);
    const g = useGameStore.getState().game!;
    expect(g.answers.length).toBe(log.length);
    expect(g.gs.pending.some((d) => d.owner === 0)).toBe(true);
  });

  it('other devices leave the AI seats alone', async () => {
    const { log } = await table(false);
    await wait(500);
    expect(log).toEqual([]);
  });
});

describe('online undo with AI seats', () => {
  const setup: GameSetup = { v: 1, seed: 9, spirits: ['river', 'earth', 'shadows'], boards: ['A', 'B', 'C'], adversary: 'none', adversaryLevel: 0, ai: [false, false, true] };

  it('only the people vote, and the undo goes back past AI moves to the last human move', async () => {
    const { useGameStore } = await import('../../src/store/gameStore');
    const ref = newGame(setup);
    const move = (owner: number) => {
      const d = ref.gs.pending.find((x) => x.owner === owner)!;
      const a = { d: d.id, k: d.options[0].key, s: owner };
      applyAnswer(ref, a, owner);
      return a;
    };
    useGameStore.getState().startOnline(setup, 1);
    const log: unknown[] = [move(0), move(2), { u: 'req', n: 2, s: 0 }, { u: 'yes', r: 2, s: 2 }];
    useGameStore.getState().syncOnline(log);
    // the AI seat's vote doesn't count
    expect(useGameStore.getState().undoRequest?.yes).toEqual([0]);
    // an AI move landing doesn't cancel the request
    if (ref.gs.pending.some((x) => x.owner === 2)) log.push(move(2));
    log.push({ u: 'yes', r: 2, s: 1 });
    useGameStore.getState().syncOnline(log);
    const g = useGameStore.getState().game!;
    expect(useGameStore.getState().undoRequest).toBeNull();
    expect(g.answers).toEqual([]);
  });

  it('with one person and AI teammates, asking is enough', async () => {
    const { useGameStore } = await import('../../src/store/gameStore');
    const solo: GameSetup = { ...setup, spirits: ['river', 'earth'], boards: ['A', 'B'], ai: [false, true] };
    const ref = newGame(solo);
    const d0 = ref.gs.pending.find((x) => x.owner === 0)!;
    const d1 = ref.gs.pending.find((x) => x.owner === 1)!;
    useGameStore.getState().startOnline(solo, 0);
    const ai = { d: d1.id, k: d1.options[0].key, s: 1 };
    const me = { d: d0.id, k: d0.options[0].key, s: 0 };
    useGameStore.getState().syncOnline([ai, me, { u: 'req', n: 2, s: 0 }]);
    // the AI's earlier move stays; mine is undone
    expect(useGameStore.getState().game!.answers).toEqual([ai]);
  });
});
