// The neural player: the trained network chooses, the search AI (ai.ts) is the safety net.
//
// The network was trained on solo games only (one Spirit token), so it plays solo games
// only (`neuralSupports`). The shipped one is update 15000 (training round 4): 50.9% wins on
// 576 test games (8 Spirits x no adversary / Sweden 2 / England 3 / Prussia 6), against the
// search AI's 12.5% on the 192-game suite. An early network (trained when Powers could still
// be cancelled at their target) learned that stalling (choose, cancel, repeat) beats a losing
// game. The rules no longer allow that, so a phase always ends; the guard stays as a
// backstop: `StallTracker` counts the answers since the game last moved on to a new turn or
// phase, and past STALL_LIMIT (a normal phase takes well under a hundred answers) the search
// AI answers for the rest of that phase (update 15000 never needed it in those 576 games).

import { aiChoose } from '../ai';
import type { Decision } from '../decide';
import { applyAnswer, newGame } from '../game';
import type { Game, SeatedAnswer } from '../game';
import { OBS_VERSION, observe } from '../observe';
import type { GameSetup, GameState } from '../state';
import type { SpiritPolicy } from './runtime';

export const STALL_LIMIT = 150;

export class StallTracker {
  private mark = '';
  private at = 0;

  /** Answers given since the turn or phase last changed (call after every answer, and before asking). */
  update(gs: GameState, answered: number): number {
    const m = `${gs.turn}:${gs.phase}`;
    if (m !== this.mark) {
      this.mark = m;
      this.at = answered;
    }
    return answered - this.at;
  }
}

/** Replays `answers` (quietly) and reports how long the game has been stuck in its current phase. */
export function replayTracked(setup: GameSetup, answers: readonly SeatedAnswer[]): { game: Game; stalled: number } {
  const game = newGame(setup, { quiet: true });
  const tracker = new StallTracker();
  for (const a of answers) {
    applyAnswer(game, a, a.s);
    tracker.update(game.gs, game.answers.length);
  }
  return { game, stalled: tracker.update(game.gs, game.answers.length) };
}

/** Can this network play this game? (Solo only, and only on the observation layout it was trained on.) */
export function neuralSupports(setup: GameSetup, policy: SpiritPolicy): boolean {
  return setup.spirits.length === policy.players && policy.obsVersion === OBS_VERSION;
}

/** The option key the network picks for `dec`, or the search AI's once the game has stalled. */
export function neuralChoose(policy: SpiritPolicy, game: Game, dec: Decision, stalled: number): { key: string; byNetwork: boolean } {
  if (dec.options.length === 1) return { key: dec.options[0].key, byNetwork: true };
  if (stalled >= STALL_LIMIT) return { key: aiChoose(game, dec), byNetwork: false };
  const i = policy.choose(observe(game.gs, dec));
  return { key: dec.options[Math.min(i, dec.options.length - 1)].key, byNetwork: true };
}
