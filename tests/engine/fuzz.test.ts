import { describe, expect, it } from 'vitest';
import { newGame, applyAnswer, replay } from '../../src/engine/game';
import type { Game } from '../../src/engine/game';
import { makeRng, nextInt } from '../../src/engine/rng';
import { SPIRIT_ORDER } from '../../src/engine/spiritData';
import type { AdversaryId, BoardName, SpiritId } from '../../src/engine/types';
import type { GameSetup } from '../../src/engine/state';

/** Random but "sensible" player: prefers acting over passing, never loops on Cancel forever. */
function playRandomly(game: Game, seed: number, maxSteps = 60000): number {
  const r = makeRng(seed);
  let steps = 0;
  while (game.gs.result.kind === 'IN_PROGRESS' && steps < maxSteps) {
    const pending = game.gs.pending;
    expect(pending.length).toBeGreaterThan(0);
    const dec = pending[nextInt(r, pending.length)];
    const nonDone = dec.options.filter((o) => !o.done && o.key !== 'cancel');
    const pool = nonDone.length && nextInt(r, 4) !== 0 ? nonDone : dec.options;
    const opt = pool[nextInt(r, pool.length)];
    const ok = applyAnswer(game, { d: dec.id, k: opt.key }, dec.owner === -1 ? undefined : dec.owner);
    expect(ok).toBe(true);
    steps++;
  }
  return steps;
}

const ADVS: [AdversaryId, number][] = [
  ['none', 0],
  ['prussia', 2],
  ['prussia', 6],
  ['england', 3],
  ['england', 6],
  ['sweden', 4],
  ['sweden', 6],
];
const BOARDS: BoardName[] = ['A', 'B', 'C', 'D'];

describe('engine fuzz: full random games finish', () => {
  for (const sid of SPIRIT_ORDER) {
    it(`solo ${sid}`, () => {
      for (let i = 0; i < 4; i++) {
        const [adv, lvl] = ADVS[(i * 3 + sid.length) % ADVS.length];
        const setup: GameSetup = { v: 1, seed: 1000 + i * 17 + sid.length, spirits: [sid], boards: [BOARDS[i % 4]], adversary: adv, adversaryLevel: lvl };
        const g = newGame(setup);
        const steps = playRandomly(g, 77 + i);
        expect(g.gs.result.kind, `stuck after ${steps} steps`).not.toBe('IN_PROGRESS');
      }
    });
  }

  it('multiplayer islands (2–4 players)', () => {
    for (let n = 2; n <= 4; n++) {
      for (let i = 0; i < 3; i++) {
        const spirits = Array.from({ length: n }, (_, k) => SPIRIT_ORDER[(k * 3 + i + n) % SPIRIT_ORDER.length]) as SpiritId[];
        const uniq = [...new Set(spirits)];
        while (uniq.length < n) uniq.push(SPIRIT_ORDER.find((s) => !uniq.includes(s))!);
        const [adv, lvl] = ADVS[(n + i) % ADVS.length];
        const setup: GameSetup = { v: 1, seed: 5000 + n * 31 + i, spirits: uniq, boards: BOARDS.slice(0, n), adversary: adv, adversaryLevel: lvl };
        const g = newGame(setup);
        playRandomly(g, 900 + n * 7 + i);
        expect(g.gs.result.kind).not.toBe('IN_PROGRESS');
      }
    }
  });

  it('replaying the answer log reproduces the exact state', () => {
    const setup: GameSetup = { v: 1, seed: 4242, spirits: ['shadows', 'thunderspeaker'], boards: ['B', 'C'], adversary: 'sweden', adversaryLevel: 3 };
    const g = newGame(setup);
    playRandomly(g, 4243, 400);
    const again = replay(setup, g.answers);
    const strip = (gm: Game) => JSON.stringify({ ...gm.gs, pending: gm.gs.pending.map((d) => d.id) });
    expect(strip(again)).toBe(strip(g));
  });
});
