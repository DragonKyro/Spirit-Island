// The engine driver. A Game is its GameSetup plus the ordered Answers given so far;
// the same inputs always produce the same state (used for undo, saves, and online play).

import { GameOver } from './decide';
import type { Answer, Decision, Eff } from './decide';
import { log } from './ops';
import { gameLoop } from './phases';
import { createState } from './setup';
import { dahanCount, lands } from './state';
import type { GameSetup, GameState } from './state';

export interface Game {
  setup: GameSetup;
  gs: GameState;
  gen: Eff;
  answers: SeatedAnswer[];
}

function step(game: Game, ans?: Answer): void {
  const gs = game.gs;
  try {
    const r = ans === undefined ? game.gen.next() : game.gen.next(ans);
    gs.pending = r.done ? [] : r.value;
  } catch (e) {
    if (e instanceof GameOver) {
      gs.result = e.result;
      gs.phase = 'GAME_OVER';
      gs.pending = [];
      gs.activity = null;
      log(gs, e.result.kind === 'DEFEAT' ? `DEFEAT — ${e.result.reason}` : `${e.result.kind === 'SACRIFICE_VICTORY' ? 'SACRIFICE VICTORY' : 'VICTORY'} — ${e.result.reason}`, 0);
    } else throw e;
  }
}

export function newGame(setup: GameSetup): Game {
  const gs = createState(setup);
  const game: Game = { setup, gs, gen: gameLoop(gs), answers: [] };
  step(game);
  return game;
}

/** Is this answer valid right now (for seat `seat`, if given)? */
export function canApply(game: Game, ans: Answer, seat?: number): Decision | null {
  const gs = game.gs;
  if (gs.result.kind !== 'IN_PROGRESS') return null;
  const dec = gs.pending.find((d) => d.id === ans.d);
  if (!dec) return null;
  if (seat !== undefined && dec.owner !== -1 && dec.owner !== seat) return null;
  if (!dec.options.some((o) => o.key === ans.k)) return null;
  return dec;
}

/** Apply an answer. Invalid / stale answers are ignored (returns false) — deterministically on every device. */
export function applyAnswer(game: Game, ans: Answer, seat?: number): boolean {
  if (!canApply(game, ans, seat)) return false;
  // the seat goes with the answer (online), so a replay re-checks it and undo knows who moved
  game.answers.push(seat === undefined ? { d: ans.d, k: ans.k } : { d: ans.d, k: ans.k, s: seat });
  step(game, ans);
  return true;
}

export interface SeatedAnswer extends Answer {
  /** seat (spirit index) that sent it; omitted in solo */
  s?: number;
}

export function replay(setup: GameSetup, answers: readonly SeatedAnswer[]): Game {
  const game = newGame(setup);
  for (const a of answers) applyAnswer(game, a, a.s);
  return game;
}

/** Decisions a given seat can answer right now (owner = seat, or "anyone"). */
export function decisionsFor(gs: GameState, seat: number): Decision[] {
  return gs.pending.filter((d) => d.owner === seat || d.owner === -1);
}

/** Optional scoring from the rulebook. */
export function score(gs: GameState): { total: number; parts: [string, number][] } | null {
  if (gs.result.kind === 'IN_PROGRESS') return null;
  const players = gs.spirits.length;
  const dahan = lands(gs).reduce((a, s) => a + dahanCount(s), 0);
  const blight = lands(gs).reduce((a, s) => a + s.blight, 0);
  const parts: [string, number][] = [];
  if (gs.result.kind === 'DEFEAT') {
    parts.push(['2 × Difficulty', 2 * gs.difficulty]);
    const inv = gs.invader;
    const out = inv.discard.length + inv.ravage.length + inv.build.length + (inv.highImmigration?.length ?? 0);
    parts.push(['Invader Cards out of the deck', out]);
  } else {
    parts.push(['5 × Difficulty', 5 * gs.difficulty]);
    parts.push(['Victory bonus', 10]);
    parts.push(['2 × Invader Cards left in deck', 2 * gs.invader.deck.length]);
  }
  parts.push([`Living Dahan ÷ ${players}`, Math.floor(dahan / players)]);
  parts.push([`Blight ÷ ${players}`, -Math.floor(blight / players)]);
  return { total: parts.reduce((a, [, v]) => a + v, 0), parts };
}

export type { Answer, Decision, GameSetup, GameState };
