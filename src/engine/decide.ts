// The decision protocol.
//
// Engine logic is written as generators: whenever a player must choose, the
// generator yields the open Decisions and receives an Answer {d, k}. A whole game
// is therefore a deterministic function of its GameSetup plus the ordered list of
// Answers — which is what gets saved, replayed for undo, and sent over the network.

import type { Element, PieceKind } from './types';
import type { GameResult, GameState } from './state';

export interface Option {
  key: string;
  label: string;
  /** land / ocean this option refers to (UI makes it clickable on the map) */
  space?: string;
  /** power card this option refers to (UI highlights it in hand) */
  card?: string;
  piece?: PieceKind;
  /** damage already on the piece, for display */
  dmg?: number;
  element?: Element;
  spirit?: number;
  /** small grey hint text */
  hint?: string;
  /** marks "Done / Skip / Stop"-style options */
  done?: boolean;
}

export interface Decision {
  id: number;
  /** spirit index whose player decides, or -1 for "any player" (shared Invader-phase choices) */
  owner: number;
  prompt: string;
  options: Option[];
  /** name of the Power / effect being resolved, for context */
  source?: string;
  /** space(s) to highlight while deciding */
  focus?: string[];
  /** a card the UI should show while deciding (e.g. the Fear Card being revealed) */
  show?: { kind: 'powers' | 'fears' | 'blights'; id: string };
  /** top-level menus (not part of resolving an effect): Growth choice, card plays, Power phase */
  menu?: 'growth' | 'play' | 'power';
}

export interface Answer {
  d: number;
  k: string;
}

export type Eff<T = void> = Generator<Decision[], T, Answer>;

/** Thrown from anywhere inside engine logic the moment the game is won or lost. */
export class GameOver extends Error {
  constructor(public readonly result: Exclude<GameResult, { kind: 'IN_PROGRESS' }>) {
    super(result.reason);
  }
}

export interface ChooseOpts {
  source?: string;
  focus?: string[];
  /** ask even when only one option exists */
  always?: boolean;
  show?: Decision['show'];
  menu?: Decision['menu'];
}

/** Ask `owner` to pick one option. Auto-picks when only one option exists (unless `always`). */
export function* choose(
  gs: GameState,
  owner: number,
  prompt: string,
  options: Option[],
  opts: ChooseOpts = {},
): Eff<string> {
  if (options.length === 0) throw new Error(`No options for: ${prompt}`);
  if (options.length === 1 && !opts.always) return options[0].key;
  const dec: Decision = {
    id: gs.nextId++,
    owner,
    prompt,
    options,
    source: opts.source ?? gs.activity ?? undefined,
    focus: opts.focus,
    show: opts.show,
    menu: opts.menu,
  };
  const ans = yield [dec];
  return ans.k;
}

export function* confirm(gs: GameState, owner: number, prompt: string, yes = 'Yes', no = 'No', opts: ChooseOpts = {}): Eff<boolean> {
  const k = yield* choose(gs, owner, prompt, [{ key: 'yes', label: yes }, { key: 'no', label: no, done: true }], {
    ...opts,
    always: true,
  });
  return k === 'yes';
}

/**
 * Run several decision sequences side by side (e.g. each Spirit's Growth). Each
 * sub-generator keeps its own pending decisions; an answer is routed to the one
 * that owns that decision id.
 */
export function* parallel(gens: Eff[]): Eff {
  const cur = gens.map((g) => g.next());
  for (;;) {
    const open: Decision[] = [];
    cur.forEach((r) => {
      if (!r.done) open.push(...r.value);
    });
    if (open.length === 0) return;
    const ans = yield open;
    const i = cur.findIndex((r) => !r.done && r.value.some((d) => d.id === ans.d));
    if (i < 0) continue;
    cur[i] = gens[i].next(ans);
  }
}
