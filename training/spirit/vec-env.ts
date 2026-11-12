// A batch of independent Spirit Island games for a learner to drive.
//
// Every Spirit is played by the network being trained (the game is cooperative, so
// a 2–4 player table is one team with one reward). Each env plays on its own —
// single-option decisions are answered right here — until a real choice comes up,
// then reports it: the encoded observation (src/engine/observe.ts, public
// information only) padded to fixed sizes, and which options are legal. The learner
// answers each env with an option index. Finished games auto-reset: `done[i]` marks
// that env i's game ended during the last advance, and its row is already the next
// game's first decision. With `quota` (or `fixed`) set, an env stops after its games
// and reports an idle row (active 0; its answer is ignored).
//
// New games are drawn from `mix` (weighted Spirit / adversary / level entries; the
// trainer's curriculum rewrites it with `configure`), on random boards, with seeds
// from each env's own RNG. A `probeShare` of new games are probe games drawn from
// `probeMix` instead: rows of a probe game have `probe[i]` set, and the learner plays
// them greedily and keeps them out of training (they measure the policy for the
// curriculum). `fixed` instead gives every env a list of exact setups (env i plays
// fixed[i], fixed[i + numEnvs], …), for evals on the same games.
//
// A game that spends `maxPhaseSteps` answers in one phase (turn and phase unchanged) is
// cut off as a loss. The rules leave no way to stall (a chosen Power must be targeted),
// so this is a backstop for loops nobody has found yet; Episode.reason says which cap hit.
//
// Rewards accrue between consecutive rows of an env (credit reward[i] to env i's
// previous decision):
//   - game end: +1 + speedBonus × (share of the Invader Deck left) for a win, −1 for
//     a loss (also when cut off at maxSteps)
//   - potential-based shaping: Φ = shaping × tanh(evaluate() / (60 × players)), paid
//     as Φ(now) − Φ(previous decision) and −Φ at the end, so over a game it adds up
//     to −Φ(first decision), the same whatever the policy does (no stalling to farm it)
//
// With `teacher` on, every row also carries the option the heuristic AI
// (src/engine/ai.ts) would pick, or −1: the imitation target. `driver: 'heuristic'`
// plays whole games with the heuristic instead (baselines on the same setups).
//
// Fault tolerance: an error inside a game abandons just that game (Episode.result
// 'ABORTED', no terminal reward) and starts a new one, reported on stderr.

import { ADVERSARIES, ADVERSARY_ORDER, adversaryLevel } from '../../src/engine/adversary';
import { aiChoose, aiQuickChoose, evaluate } from '../../src/engine/ai';
import type { Decision } from '../../src/engine/decide';
import { applyAnswer, newGame, score } from '../../src/engine/game';
import type { Game } from '../../src/engine/game';
import {
  CARD_CAT, CARD_NUM, DECISION_CAT, DECISION_NUM, DECISION_REF, GLOBAL_CAT, GLOBAL_NUM, LAND_CAT, LAND_NUM,
  OBS_VERSION, OPTION_CAT, OPTION_CLASSES, OPTION_NUM, OPTION_REF, POWER_VOCAB, SOURCE_VOCAB, SPIRIT_CAT, SPIRIT_NUM, observe,
} from '../../src/engine/observe';
import type { TokenBlock } from '../../src/engine/observe';
import { DECISION_KINDS } from '../../src/engine/decide';
import { capsFor, fitObservation } from '../../src/engine/nn/fit';
import { StallTracker, neuralChoose } from '../../src/engine/nn/neural';
import { SpiritPolicy } from '../../src/engine/nn/runtime';
import { readFileSync } from 'node:fs';
import { makeRng, nextFloat, nextInt } from '../../src/engine/rng';
import type { Rng } from '../../src/engine/rng';
import { SPIRIT_ORDER } from '../../src/engine/spiritData';
import type { GameSetup } from '../../src/engine/state';
import { BOARD_NAMES } from '../../src/engine/types';
import type { AdversaryId, BoardName, SpiritId } from '../../src/engine/types';

export interface SetupChoice {
  spirit: SpiritId;
  adversary: AdversaryId;
  level: number;
  weight: number;
}

export interface VecEnvOptions {
  numEnvs: number;
  seed: number;
  /** Spirits per game (1 = solo). Fixes the padded sizes. */
  players: number;
  /** what new games are drawn from */
  mix: SetupChoice[];
  /** exact setups to play instead of `mix` (env i: fixed[i], fixed[i + numEnvs], …) */
  fixed: GameSetup[] | null;
  /** decisions (any, incl. forced ones) before a game is cut off */
  maxSteps: number;
  /** answers in one phase before a game is cut off as stuck (0 = no cap) */
  maxPhaseSteps: number;
  /** share of new games that are probe games, drawn from probeMix */
  probeShare: number;
  probeMix: SetupChoice[];
  shaping: number;
  speedBonus: number;
  /** games per env before it idles (0 = forever) */
  quota: number;
  teacher: 'off' | 'full' | 'quick';
  /**
   * who plays: 'net' = the learner (rows go out), 'heuristic' = the search AI plays whole games,
   * 'shipped' = whole games with the app's neural player (a shipped policy file + stall guard)
   */
  driver: 'net' | 'heuristic' | 'shipped';
  /** the shipped policy file for driver 'shipped' */
  policyPath: string | null;
}

export const DEFAULT_VEC_ENV_OPTIONS: VecEnvOptions = {
  numEnvs: 16,
  seed: 1,
  players: 1,
  mix: SPIRIT_ORDER.map((spirit) => ({ spirit, adversary: 'none', level: 0, weight: 1 })),
  fixed: null,
  maxSteps: 5000,
  maxPhaseSteps: 300,
  probeShare: 0,
  probeMix: [],
  shaping: 0,
  speedBonus: 0.25,
  quota: 0,
  teacher: 'off',
  driver: 'net',
  policyPath: null,
};

/** Padded sizes for a table of `players` Spirits (the same caps the app's runtime fits to). */
export function shapeFor(players: number) {
  return capsFor(players);
}

export interface Episode {
  env: number;
  setup: GameSetup;
  difficulty: number;
  result: 'VICTORY' | 'SACRIFICE_VICTORY' | 'DEFEAT' | 'TRUNCATED' | 'ABORTED';
  reason: string;
  turn: number;
  /** real decisions the learner made (rows) / all decisions incl. forced ones */
  decisions: number;
  steps: number;
  /** total reward paid for this game (terminal + shaping) */
  reward: number;
  /** official score (null if cut off or aborted) */
  score: number | null;
  deckLeft: number;
  blight: number;
  /** options / cards that didn't fit the padded sizes (never chosen) */
  overflow: number;
  /** answers outside the legal options (replaced by the first option) */
  invalid: number;
  /** driver 'shipped': decisions the search AI took over after the game stalled */
  handoffs: number;
  /** a probe game: played greedily, not trained on */
  probe: boolean;
}

/** Buffers are reused by the next reset / step: copy anything you keep. */
export interface VecBatch {
  active: Uint8Array;
  /** row i belongs to a probe game (play it greedily, don't train on it) */
  probe: Uint8Array;
  landNum: Float32Array;
  landCat: Int16Array;
  landMask: Uint8Array;
  dist: Uint8Array;
  spiritNum: Float32Array;
  spiritCat: Int16Array;
  spiritMask: Uint8Array;
  cardNum: Float32Array;
  cardCat: Int16Array;
  cardMask: Uint8Array;
  globalNum: Float32Array;
  globalCat: Int16Array;
  decisionNum: Float32Array;
  decisionCat: Int16Array;
  decisionRef: Int16Array;
  optionNum: Float32Array;
  optionCat: Int16Array;
  optionRef: Int16Array;
  optionMask: Uint8Array;
  /** the heuristic's option per row, or −1 */
  teacher: Int16Array;
  reward: Float32Array;
  done: Uint8Array;
  episodes: Episode[];
}

/** Everything the learner needs to size its network. */
export function envSpec(players: number) {
  return {
    obsVersion: OBS_VERSION,
    shape: shapeFor(players),
    num: { land: LAND_NUM.length, spirit: SPIRIT_NUM.length, card: CARD_NUM.length, global: GLOBAL_NUM.length, decision: DECISION_NUM.length, option: OPTION_NUM.length },
    cat: { land: LAND_CAT.length, spirit: SPIRIT_CAT.length, card: CARD_CAT.length, global: GLOBAL_CAT.length, decision: DECISION_CAT.length, option: OPTION_CAT.length },
    refs: { decision: DECISION_REF.length, option: OPTION_REF.length },
    // embedding table sizes per categorical column (index 0 = none)
    vocab: {
      land: [6, 9],
      spirit: [SPIRIT_ORDER.length + 1],
      card: [POWER_VOCAB.length, 6],
      global: [ADVERSARY_ORDER.length, 7, 3, 8],
      decision: [DECISION_KINDS.length + 1, SOURCE_VOCAB.length, 5],
      option: [OPTION_CLASSES.length, 5, 9],
    },
    columns: { land: LAND_NUM, spirit: SPIRIT_NUM, card: CARD_NUM, global: GLOBAL_NUM, decision: DECISION_NUM, option: OPTION_NUM },
    maxDist: 7,
    spirits: SPIRIT_ORDER,
    /** every adversary level with its rulebook difficulty (the curriculum's ladder) */
    difficulties: ADVERSARY_ORDER.flatMap((adversary) =>
      ADVERSARIES[adversary].levels.map((l) => ({ adversary, level: l.level, difficulty: l.difficulty })),
    ),
  };
}

interface Slot {
  game: Game | null;
  setup: GameSetup | null;
  dec: Decision | null;
  /** Φ at this env's previous decision */
  phi: number;
  /** reward owed to the previous decision */
  pending: number;
  ep: Omit<Episode, 'result' | 'reason' | 'turn' | 'score' | 'deckLeft' | 'blight'> | null;
  deckSize: number;
  played: number;
  idle: boolean;
  tracker: StallTracker;
  probe: boolean;
  /** the game was cut off by the per-phase cap */
  stuck?: boolean;
}

export class SpiritVecEnv {
  readonly opts: VecEnvOptions;
  readonly shape: ReturnType<typeof shapeFor>;
  private readonly rng: Rng;
  private readonly slots: Slot[];
  private readonly batch: VecBatch;
  private errors = 0;
  private readonly policy: SpiritPolicy | null;

  constructor(options: Partial<VecEnvOptions> = {}) {
    this.opts = { ...DEFAULT_VEC_ENV_OPTIONS, ...options };
    if (!this.opts.mix.length) throw new Error('mix is empty');
    this.shape = shapeFor(this.opts.players);
    if (this.opts.driver === 'shipped') {
      if (!this.opts.policyPath) throw new Error("driver 'shipped' needs policyPath");
      this.policy = SpiritPolicy.parse(readFileSync(this.opts.policyPath));
    } else this.policy = null;
    this.rng = makeRng(this.opts.seed);
    const n = this.opts.numEnvs;
    const { lands: L, spirits: P, cards: C, options: O } = this.shape;
    this.batch = {
      active: new Uint8Array(n),
      probe: new Uint8Array(n),
      landNum: new Float32Array(n * L * LAND_NUM.length),
      landCat: new Int16Array(n * L * LAND_CAT.length),
      landMask: new Uint8Array(n * L),
      dist: new Uint8Array(n * L * L),
      spiritNum: new Float32Array(n * P * SPIRIT_NUM.length),
      spiritCat: new Int16Array(n * P * SPIRIT_CAT.length),
      spiritMask: new Uint8Array(n * P),
      cardNum: new Float32Array(n * C * CARD_NUM.length),
      cardCat: new Int16Array(n * C * CARD_CAT.length),
      cardMask: new Uint8Array(n * C),
      globalNum: new Float32Array(n * GLOBAL_NUM.length),
      globalCat: new Int16Array(n * GLOBAL_CAT.length),
      decisionNum: new Float32Array(n * DECISION_NUM.length),
      decisionCat: new Int16Array(n * DECISION_CAT.length),
      decisionRef: new Int16Array(n * DECISION_REF.length),
      optionNum: new Float32Array(n * O * OPTION_NUM.length),
      optionCat: new Int16Array(n * O * OPTION_CAT.length),
      optionRef: new Int16Array(n * O * OPTION_REF.length),
      optionMask: new Uint8Array(n * O),
      teacher: new Int16Array(n),
      reward: new Float32Array(n),
      done: new Uint8Array(n),
      episodes: [],
    };
    this.slots = Array.from({ length: n }, () => ({ game: null, setup: null, dec: null, phi: 0, pending: 0, ep: null, deckSize: 1, played: 0, idle: false, tracker: new StallTracker(), probe: false }));
  }

  /** The TypeScript runtime's option logits for every env's pending decision (parity checks); null for idle envs. */
  policyLogits(policy: SpiritPolicy): (number[] | null)[] {
    return this.slots.map((s) => (s.game && s.dec && !s.idle ? Array.from(policy.scoreOptions(observe(s.game.gs, s.dec))) : null));
  }

  /** Change what new games are drawn from / teacher labels / shaping, for games from now on. */
  configure(patch: Partial<Pick<VecEnvOptions, 'mix' | 'teacher' | 'shaping' | 'speedBonus' | 'probeMix' | 'probeShare'>>): void {
    if (patch.mix && !patch.mix.length) throw new Error('mix is empty');
    Object.assign(this.opts, patch);
  }

  reset(): VecBatch {
    this.beginBatch();
    this.slots.forEach((_, i) => this.settle(i));
    return this.finishBatch();
  }

  step(actions: readonly number[]): VecBatch {
    if (actions.length !== this.slots.length) throw new Error(`step needs ${this.slots.length} actions, got ${actions.length}`);
    this.beginBatch();
    this.slots.forEach((s, i) => {
      if (s.idle || !s.game || !s.dec) return;
      const dec = s.dec;
      let k = actions[i];
      if (!Number.isInteger(k) || k < 0 || k >= Math.min(dec.options.length, this.shape.options)) {
        s.ep!.invalid++;
        k = 0;
      }
      try {
        applyAnswer(s.game, { d: dec.id, k: dec.options[k].key }, dec.owner >= 0 ? dec.owner : undefined);
        s.ep!.steps++;
      } catch (e) {
        this.abort(i, e);
      }
      s.dec = null;
      this.settle(i);
    });
    return this.finishBatch();
  }

  // ── games ──

  private beginBatch(): void {
    const b = this.batch;
    b.reward.fill(0);
    b.done.fill(0);
    b.episodes = [];
  }

  private nextSetup(i: number): GameSetup | null {
    const o = this.opts;
    const s = this.slots[i];
    s.probe = false;
    if (o.fixed) {
      const idx = i + s.played * o.numEnvs;
      return idx < o.fixed.length ? o.fixed[idx] : null;
    }
    if (o.quota && s.played >= o.quota) return null;
    s.probe = o.probeShare > 0 && o.probeMix.length > 0 && nextFloat(this.rng) < o.probeShare;
    const mix = s.probe ? o.probeMix : o.mix;
    const total = mix.reduce((a, m) => a + m.weight, 0);
    let r = nextFloat(this.rng) * total;
    const m = mix.find((x) => (r -= x.weight) < 0) ?? mix[mix.length - 1];
    const spirits: SpiritId[] = [m.spirit];
    while (spirits.length < o.players) {
      const rest = SPIRIT_ORDER.filter((x) => !spirits.includes(x));
      spirits.push(rest[nextInt(this.rng, rest.length)]);
    }
    const boards = [...BOARD_NAMES];
    const pick: BoardName[] = [];
    for (let k = 0; k < o.players; k++) pick.push(boards.splice(nextInt(this.rng, boards.length), 1)[0]);
    return { v: 2, seed: nextInt(this.rng, 2 ** 31), spirits, boards: pick, adversary: m.adversary, adversaryLevel: m.adversary === 'none' ? 0 : m.level };
  }

  /** Bring env i to its next real decision: starting games as needed, finishing those that end. Idle when out of games. */
  private settle(i: number): void {
    const s = this.slots[i];
    for (let failures = 0; failures < 5; ) {
      if (!s.game) {
        const setup = this.nextSetup(i);
        if (!setup) break;
        s.played++;
        s.setup = setup;
        s.pending = 0;
        s.phi = Number.NaN;
        s.ep = { env: i, setup, difficulty: adversaryLevel(setup.adversary, setup.adversaryLevel).difficulty, decisions: 0, steps: 0, reward: 0, overflow: 0, invalid: 0, handoffs: 0, probe: s.probe };
        s.tracker = new StallTracker();
        try {
          s.game = newGame(setup, { quiet: true });
          s.deckSize = Math.max(1, s.game.gs.invader.deck.length);
        } catch (e) {
          failures++;
          this.abort(i, e);
          continue;
        }
      }
      try {
        const r = this.advance(i);
        if (r === 'decision') return;
        this.finish(i, r);
      } catch (e) {
        failures++;
        this.abort(i, e);
      }
    }
    s.idle = true;
    s.game = s.dec = null;
  }

  /** Answer forced (and, with the heuristic driver, all) decisions until a real choice or the game end. */
  private advance(i: number): 'decision' | Episode['result'] {
    const s = this.slots[i];
    const g = s.game!;
    const o = this.opts;
    for (;;) {
      const gs = g.gs;
      if (gs.result.kind !== 'IN_PROGRESS') return gs.result.kind;
      if (s.ep!.steps >= o.maxSteps) return 'TRUNCATED';
      const inPhase = s.tracker.update(gs, g.answers.length);
      if (o.maxPhaseSteps && inPhase >= o.maxPhaseSteps) {
        s.stuck = true;
        return 'TRUNCATED';
      }
      const dec = gs.pending[0];
      if (!dec) throw new Error('no pending decision');
      if (dec.options.length > 1 && o.driver === 'net') {
        // a real choice: settle the shaping owed to the previous decision, then report it
        const phi = o.shaping ? o.shaping * Math.tanh(evaluate(gs) / (60 * o.players)) : 0;
        if (!Number.isNaN(s.phi)) s.pending += phi - s.phi;
        s.phi = phi;
        s.dec = dec;
        return 'decision';
      }
      let k: string;
      if (dec.options.length === 1) k = dec.options[0].key;
      else if (this.policy) {
        const pick = neuralChoose(this.policy, g, dec, inPhase);
        k = pick.key;
        if (!pick.byNetwork) s.ep!.handoffs++;
      } else k = aiChoose(g, dec);
      applyAnswer(g, { d: dec.id, k }, dec.owner >= 0 ? dec.owner : undefined);
      s.ep!.steps++;
    }
  }

  /** The game in env i is over: pay the terminal reward (and the shaping back), record it, clear the slot. */
  private finish(i: number, result: Episode['result']): void {
    const s = this.slots[i];
    const gs = s.game?.gs;
    let terminal = 0;
    if (result === 'VICTORY' || result === 'SACRIFICE_VICTORY') terminal = 1 + this.opts.speedBonus * ((gs?.invader.deck.length ?? 0) / s.deckSize);
    else if (result === 'DEFEAT' || result === 'TRUNCATED') terminal = -1;
    const owed = s.pending + terminal - (Number.isNaN(s.phi) ? 0 : s.phi);
    this.batch.reward[i] += owed;
    this.batch.done[i] = 1;
    const ep = s.ep!;
    ep.reward += owed;
    const sc = gs && result !== 'TRUNCATED' && result !== 'ABORTED' ? score(gs) : null;
    this.batch.episodes.push({
      ...ep,
      result,
      reason: gs && 'reason' in gs.result ? gs.result.reason
        : result === 'TRUNCATED' ? (s.stuck ? `stuck: ${this.opts.maxPhaseSteps} answers in one phase` : `cut off after ${ep.steps} decisions`) : '',
      turn: gs?.turn ?? 0,
      score: sc?.total ?? null,
      deckLeft: gs?.invader.deck.length ?? 0,
      blight: gs ? gs.spaces.reduce((a, sp) => a + sp.blight, 0) : 0,
    });
    s.game = s.dec = null;
    s.pending = 0;
    s.phi = Number.NaN;
    s.stuck = false;
  }

  /** An error inside env i's game: abandon just that game (no terminal reward). */
  private abort(i: number, e: unknown): void {
    this.errors++;
    if (this.errors <= 20 || this.errors % 100 === 0) {
      const setup = JSON.stringify(this.slots[i].setup);
      process.stderr.write(`[spirit-env] env ${i}: game abandoned (${this.errors} so far), setup ${setup}: ${(e as Error).stack ?? e}
`);
    }
    if (this.slots[i].ep) this.finish(i, 'ABORTED');
  }

  // ── encoding ──

  private finishBatch(): VecBatch {
    const b = this.batch;
    this.slots.forEach((s, i) => {
      b.reward[i] += s.pending;
      if (s.ep) s.ep.reward += s.pending;
      s.pending = 0;
      this.encodeRow(i);
    });
    return b;
  }

  private encodeRow(i: number, depth = 0): void {
    const b = this.batch;
    const s = this.slots[i];
    const { lands: L, spirits: P, cards: C, options: O } = this.shape;
    const clear = (a: { fill(v: number, start: number, end: number): unknown }, width: number, v = 0) => a.fill(v, i * width, (i + 1) * width);
    clear(b.landNum, L * LAND_NUM.length);
    clear(b.landCat, L * LAND_CAT.length);
    clear(b.landMask, L);
    clear(b.dist, L * L, 7);
    clear(b.spiritNum, P * SPIRIT_NUM.length);
    clear(b.spiritCat, P * SPIRIT_CAT.length);
    clear(b.spiritMask, P);
    clear(b.cardNum, C * CARD_NUM.length);
    clear(b.cardCat, C * CARD_CAT.length);
    clear(b.cardMask, C);
    clear(b.globalNum, GLOBAL_NUM.length);
    clear(b.globalCat, GLOBAL_CAT.length);
    clear(b.decisionNum, DECISION_NUM.length);
    clear(b.decisionCat, DECISION_CAT.length);
    clear(b.decisionRef, DECISION_REF.length, -1);
    clear(b.optionNum, O * OPTION_NUM.length);
    clear(b.optionCat, O * OPTION_CAT.length);
    clear(b.optionRef, O * OPTION_REF.length, -1);
    clear(b.optionMask, O);
    b.teacher[i] = -1;
    b.active[i] = 0;
    b.probe[i] = 0;
    if (s.idle || !s.game || !s.dec) return;
    try {
      const full = observe(s.game.gs, s.dec);
      const o = fitObservation(full, this.shape);
      b.active[i] = 1;
      b.probe[i] = s.probe ? 1 : 0;
      s.ep!.decisions++;
      s.ep!.overflow += o.overflow;
      const copy = (blk: TokenBlock, max: number, num: Float32Array, cat: Int16Array, mask: Uint8Array | null, nw: number, cw: number) => {
        num.set(blk.num, i * max * nw);
        for (let k = 0; k < blk.n * cw; k++) cat[i * max * cw + k] = blk.cat[k];
        if (mask) mask.fill(1, i * max, i * max + blk.n);
      };
      const nl = o.land.n;
      copy(o.land, L, b.landNum, b.landCat, b.landMask, LAND_NUM.length, LAND_CAT.length);
      for (let r = 0; r < nl; r++) for (let c = 0; c < nl; c++) b.dist[i * L * L + r * L + c] = o.dist[r * nl + c];
      copy(o.spirit, P, b.spiritNum, b.spiritCat, b.spiritMask, SPIRIT_NUM.length, SPIRIT_CAT.length);
      copy(o.card, C, b.cardNum, b.cardCat, b.cardMask, CARD_NUM.length, CARD_CAT.length);
      copy(o.global, 1, b.globalNum, b.globalCat, null, GLOBAL_NUM.length, GLOBAL_CAT.length);
      copy(o.decision, 1, b.decisionNum, b.decisionCat, null, DECISION_NUM.length, DECISION_CAT.length);
      for (let k = 0; k < DECISION_REF.length; k++) b.decisionRef[i * 3 + k] = o.decisionRef[k];
      copy(o.option, O, b.optionNum, b.optionCat, b.optionMask, OPTION_NUM.length, OPTION_CAT.length);
      for (let k = 0; k < o.option.n * OPTION_REF.length; k++) b.optionRef[i * O * 3 + k] = o.optionRef[k];
      const no = o.option.n;
      const fit = (v: number, n: number) => (v >= 0 && v < n ? v : -1);
      if (this.opts.teacher !== 'off') {
        const key = this.opts.teacher === 'full' ? aiChoose(s.game, s.dec) : aiQuickChoose(s.game, s.dec);
        b.teacher[i] = fit(s.dec.options.findIndex((x) => x.key === key), no);
      }
    } catch (e) {
      // an encoding failure abandons the game like any other error
      b.active[i] = 0;
      this.abort(i, e);
      if (depth < 3) {
        this.settle(i);
        this.encodeRow(i, depth + 1);
      }
    }
  }
}
