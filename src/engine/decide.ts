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

/**
 * What a decision is about, for programs that read decisions (the AI's input encoding).
 * Core rules set it explicitly; elsewhere `choose` infers it from the options, and
 * `sourceId` says which Power / Fear Card / rule asked.
 */
export const DECISION_KINDS = [
  // top-level menus
  'growth', 'growthOrder', 'play', 'power',
  // Presence
  'presenceTrack', 'presenceAdd', 'presenceMove', 'presenceDestroy',
  // targeting
  'targetLand', 'targetSpirit',
  // pieces
  'damage', 'pickPiece', 'push', 'pushTo', 'gather',
  // lands chosen by effects and rules
  'land', 'cascade', 'invaderAdd',
  // Power Cards
  'powerDeck', 'cardKeep', 'cardForget', 'cardReclaim', 'card',
  // everything else
  'element', 'choice', 'yesNo', 'fear',
] as const;
export type DecisionKind = (typeof DECISION_KINDS)[number];

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
  kind: DecisionKind;
  /**
   * What asked, as an id: `card:<id>`, `innate:<id>`, `fear:<id>`, `blight:<id>` or
   * `rule:<name>` (Growth, Setup, adversary rules, Spirit special rules).
   */
  sourceId?: string;
  /** context for effects in progress: the land acted on / moved from, the piece moving, step n of max */
  about?: { space?: string; piece?: PieceKind; n?: number; max?: number };
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
  kind?: DecisionKind;
  sourceId?: string;
  about?: Decision['about'];
}

/** The kind of a decision whose call site didn't say, from its menu or its options. */
export function inferKind(options: Option[], menu?: Decision['menu']): DecisionKind {
  if (menu) return menu;
  const main = options.filter((o) => !o.done);
  if (!main.length) return 'choice';
  if (main.every((o) => o.piece)) return 'pickPiece';
  if (main.every((o) => o.space)) return 'land';
  if (main.every((o) => o.element)) return 'element';
  if (main.every((o) => o.card)) return 'card';
  if (main.every((o) => o.spirit !== undefined)) return 'targetSpirit';
  return 'choice';
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
    kind: opts.kind ?? inferKind(options, opts.menu),
    sourceId: opts.sourceId ?? gs.activityId ?? undefined,
    about: opts.about,
  };
  const ans = yield [dec];
  return ans.k;
}

export function* confirm(gs: GameState, owner: number, prompt: string, yes = 'Yes', no = 'No', opts: ChooseOpts = {}): Eff<boolean> {
  const k = yield* choose(gs, owner, prompt, [{ key: 'yes', label: yes }, { key: 'no', label: no, done: true }], {
    kind: 'yesNo',
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
