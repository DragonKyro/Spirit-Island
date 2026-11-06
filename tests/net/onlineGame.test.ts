// End-to-end: real Spirit Island games played by several devices through the room's
// action log (fake in-memory server). Every device runs its own engine from the
// shared log; they must always agree on the exact game state.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { resetFakeServer } from '../../src/net/fakeTransport';
import { replay } from '../../src/engine/game';
import type { SeatedAnswer } from '../../src/engine/game';
import type { GameSetup } from '../../src/engine/state';
import { makeRng, nextInt } from '../../src/engine/rng';
import { flush, memoryStorage, startedRoom } from './harness';

vi.mock('../../src/net/firebaseRoom', () => ({
  get createFirebaseTransport() {
    throw new Error('tests must not load Firebase');
  },
}));

beforeEach(() => {
  resetFakeServer();
  vi.stubGlobal('localStorage', memoryStorage());
  vi.spyOn(console, 'warn').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const snapshot = (setup: GameSetup, log: unknown[]) => {
  const g = replay(setup, log as SeatedAnswer[]);
  return { g, json: JSON.stringify({ ...g.gs, pending: g.gs.pending.map((d) => d.id) }) };
};

describe('online Spirit Island game', () => {
  it('two devices play simultaneously and stay in sync', async () => {
    const setup: GameSetup = { v: 1, seed: 99, spirits: ['river', 'earth'], boards: ['A', 'B'], adversary: 'england', adversaryLevel: 1, names: ['Hana', 'Kai'] };
    const { devices } = await startedRoom([['guest-uuid', 'Kai']], setup);
    expect(devices.every((d) => d.net().start)).toBe(true);
    const rng = makeRng(5);
    let moves = 0;
    for (let round = 0; round < 250; round++) {
      // Every device decides from its own replay of the log, at the same time.
      const sends: Promise<void>[] = [];
      devices.forEach((dev, seat) => {
        const { g } = snapshot(setup, dev.net().actions);
        if (g.gs.result.kind !== 'IN_PROGRESS') return;
        const mine = g.gs.pending.filter((d) => d.owner === seat || (d.owner === -1 && seat === 0));
        if (!mine.length) return;
        const dec = mine[nextInt(rng, mine.length)];
        const pool = dec.options.filter((o) => !o.done && o.key !== 'cancel');
        const opt = (pool.length && nextInt(rng, 4) ? pool : dec.options)[0];
        sends.push(dev.net().sendAction({ d: dec.id, k: opt.key, s: seat }));
        moves++;
      });
      await Promise.all(sends);
      await flush();
      const states = devices.map((d) => snapshot(setup, d.net().actions).json);
      expect(states[1]).toBe(states[0]);
      if (snapshot(setup, devices[0].net().actions).g.gs.result.kind !== 'IN_PROGRESS') break;
    }
    const { g } = snapshot(setup, devices[0].net().actions);
    expect(moves).toBeGreaterThan(20);
    expect(g.gs.turn).toBeGreaterThanOrEqual(2);
  }, 60000);

  it("a device's answer for the other seat's decision is ignored", async () => {
    const setup: GameSetup = { v: 1, seed: 7, spirits: ['shadows', 'lightning'], boards: ['C', 'D'], adversary: 'none', adversaryLevel: 0 };
    const { devices } = await startedRoom([['guest-uuid', 'Kai']], setup);
    const before = snapshot(setup, devices[0].net().actions);
    const hostsDecision = before.g.gs.pending.find((d) => d.owner === 0)!;
    // the guest (seat 1) tries to answer seat 0's decision
    await devices[1].net().sendAction({ d: hostsDecision.id, k: hostsDecision.options[0].key, s: 1 });
    await flush();
    const after = snapshot(setup, devices[0].net().actions);
    expect(after.g.answers.length).toBe(0);
    expect(after.g.gs.pending.some((d) => d.id === hostsDecision.id)).toBe(true);
  });
});
