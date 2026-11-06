// Shared by engine tests: random play and a spread of game setups.
import type { Decision } from '../../src/engine/decide';
import { applyAnswer } from '../../src/engine/game';
import type { Game } from '../../src/engine/game';
import { makeRng, nextInt } from '../../src/engine/rng';
import { SPIRIT_ORDER } from '../../src/engine/spiritData';
import type { GameSetup } from '../../src/engine/state';
import type { AdversaryId, BoardName, SpiritId } from '../../src/engine/types';

/** Random play (prefers acting over passing); `visit` sees each decision before it is answered. */
export function playRandomly(game: Game, seed: number, visit?: (g: Game, d: Decision) => void, maxSteps = 4000): void {
  const r = makeRng(seed);
  for (let steps = 0; game.gs.result.kind === 'IN_PROGRESS' && steps < maxSteps; steps++) {
    const pending = game.gs.pending;
    const dec = pending[nextInt(r, pending.length)];
    visit?.(game, dec);
    const nonDone = dec.options.filter((o) => !o.done && o.key !== 'cancel');
    const pool = nonDone.length && nextInt(r, 4) !== 0 ? nonDone : dec.options;
    applyAnswer(game, { d: dec.id, k: pool[nextInt(r, pool.length)].key }, dec.owner === -1 ? undefined : dec.owner);
  }
}

const BOARDS: BoardName[] = ['A', 'B', 'C', 'D'];
const ADVS: [AdversaryId, number][] = [['none', 0], ['prussia', 6], ['england', 6], ['sweden', 6], ['england', 3]];

/** One game per Spirit (rotating adversaries and boards), plus a 3-player game. */
export function sampleSetups(): GameSetup[] {
  const out: GameSetup[] = SPIRIT_ORDER.map((sid, i) => {
    const [adv, lvl] = ADVS[i % ADVS.length];
    return { v: 1, seed: 300 + i * 7, spirits: [sid], boards: [BOARDS[i % 4]], adversary: adv, adversaryLevel: lvl };
  });
  out.push({ v: 1, seed: 991, spirits: ['ocean', 'bringer', 'green'] as SpiritId[], boards: ['A', 'B', 'C'], adversary: 'sweden', adversaryLevel: 4 });
  return out;
}

