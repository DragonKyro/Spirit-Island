// Zustand store wrapping the engine. Views read `game.gs` and call `answer()`.
//
// Local (solo / hot-seat): answers apply locally, are saved to localStorage (setup +
// answer log), and can be undone by replaying the log minus its last entry.
// Online: answers are sent to the room (networkStore) and applied when they come
// back in the shared action log, so every device applies the same sequence. The log
// also carries undo requests and votes; an undo happens once every human player
// agrees, identically on every device. AI seats are played by one device (the host,
// or the first connected player when the host is away), which sends their answers
// to the log like any other move.

import { create } from 'zustand';
import { applyAnswer, newGame, replay } from '../engine/game';
import type { Game, SeatedAnswer } from '../engine/game';
import type { GameSetup } from '../engine/state';
import { recordGame } from './history';
import { askAI } from './aiClient';
import type { Decision } from '../engine/decide';

const SAVE_KEY = 'spirit-island:solo:v1';

interface SavedGame {
  setup: GameSetup;
  answers: SeatedAnswer[];
}

export type Mode = 'local' | 'online';

/** Entries of the online action log besides answers. */
export type UndoEntry = { u: 'req'; n: number; s: number } | { u: 'yes' | 'no'; r: number; s: number };
export type OnlineEntry = SeatedAnswer | UndoEntry;

export interface UndoRequest {
  /** log index of the request (votes refer to it) */
  idx: number;
  /** number of applied answers when requested; the last human move among them is undone (with any AI moves after it) */
  n: number;
  by: number;
  yes: number[];
}

interface GameStore {
  game: Game | null;
  /** re-render counter (the engine mutates state in place) */
  tick: number;
  mode: Mode;
  /** online: which seat this device plays (null = spectator); local: null (controls every seat) */
  seat: number | null;
  /** online: how many log entries have been applied */
  applied: number;
  /** online: an undo waiting for every player's agreement */
  undoRequest: UndoRequest | null;
  /** AI seats: paused (local games), thinking on decision id, delay between moves */
  aiPaused: boolean;
  aiThinking: number | null;
  aiFast: boolean;
  /** the AI's suggestion for a human decision */
  hint: { d: number; k: string } | null;
  setAIPaused: (p: boolean) => void;
  setAIFast: (f: boolean) => void;
  /** run the AI for any pending decision that belongs to an AI seat */
  runAI: () => void;
  /** online: this device plays the AI seats */
  aiRunner: boolean;
  setAIRunner: (on: boolean) => void;
  suggest: (d: number) => void;
  error: string | null;
  startLocal: (setup: GameSetup) => void;
  resumeLocal: () => boolean;
  hasSave: () => boolean;
  clearSave: () => void;
  answer: (d: number, k: string) => void;
  undo: () => void;
  canUndo: () => boolean;
  /** online: ask the other players to undo the last move */
  requestUndo: () => void;
  voteUndo: (yes: boolean) => void;
  startOnline: (setup: GameSetup, seat: number | null) => void;
  /** feed the room's full action log; new entries are applied in order */
  syncOnline: (log: readonly unknown[]) => void;
  /** set by the online bridge: how to send an entry to the room (may return the send's promise) */
  sender: ((a: OnlineEntry) => void | Promise<void>) | null;
  setSender: (fn: ((a: OnlineEntry) => void | Promise<void>) | null) => void;
  quit: () => void;
}

function save(game: Game) {
  recordGame(game, 'local');
  try {
    if (game.gs.result.kind !== 'IN_PROGRESS') {
      localStorage.removeItem(SAVE_KEY);
      return;
    }
    const data: SavedGame = { setup: game.setup, answers: game.answers };
    localStorage.setItem(SAVE_KEY, JSON.stringify(data));
  } catch {
    // storage full / unavailable: play on without saving
  }
}

function loadSave(): SavedGame | null {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const d = JSON.parse(raw) as SavedGame;
    if (!d?.setup || d.setup.v !== 1 || !Array.isArray(d.answers)) return null;
    return d;
  } catch {
    return null;
  }
}

function isAnswer(x: unknown): x is SeatedAnswer {
  const a = x as SeatedAnswer;
  return !!a && typeof a.d === 'number' && typeof a.k === 'string' && (a.s === undefined || typeof a.s === 'number');
}

/** Seats played by people (every seat when there are no AI seats). */
export function humanSeats(setup: GameSetup): number[] {
  const all = setup.spirits.map((_, i) => i);
  const humans = all.filter((i) => !setup.ai?.[i]);
  return humans.length ? humans : all;
}

/** The seat whose decision each answer was (-1 for "any player"), by replaying. */
function answerOwners(setup: GameSetup, answers: readonly SeatedAnswer[]): number[] {
  const probe = replay(setup, []);
  return answers.map((a) => {
    const dec = probe.gs.pending.find((x) => x.id === a.d);
    applyAnswer(probe, a, a.s);
    return dec ? dec.owner : -1;
  });
}

/** Online: how many answers remain after undoing the last human move among the first `n` (null if there is none). */
function undoTarget(game: Game, n: number): number | null {
  const humans = humanSeats(game.setup);
  let i = Math.min(n, game.answers.length) - 1;
  while (i >= 0 && game.answers[i].s !== undefined && !humans.includes(game.answers[i].s!)) i--;
  return i >= 0 ? i : null;
}

/** The next decision the AI should take, if any. */
export function aiDecision(game: Game): Decision | null {
  const ai = game.setup.ai;
  if (!ai || !ai.some(Boolean) || game.gs.result.kind !== 'IN_PROGRESS') return null;
  const allAI = game.setup.spirits.every((_, i) => ai[i]);
  return game.gs.pending.find((d) => (d.owner >= 0 && ai[d.owner]) || (d.owner === -1 && allAI)) ?? null;
}

/** Is this decision played by the AI (so the UI should not offer it to a human)? */
export function isAIDecision(game: Game, d: Decision): boolean {
  const ai = game.setup.ai;
  if (!ai) return false;
  if (d.owner >= 0) return !!ai[d.owner];
  return game.setup.spirits.every((_, i) => ai[i]);
}

const AI_DELAY = 650;
const AI_DELAY_FAST = 60;

/** online: the decision this device last sent an AI answer for (not sent again until the log moves on) */
let aiSent: number | null = null;

/** Send through the room; `onFail` runs if the move never reached the log. */
function sendOrFail(sender: (a: OnlineEntry) => void | Promise<void>, a: OnlineEntry, onFail: () => void): void {
  try {
    const r = sender(a);
    if (r) r.catch(onFail);
  } catch {
    onFail();
  }
}

function isUndo(x: unknown): x is UndoEntry {
  const u = x as UndoEntry;
  return !!u && (u.u === 'req' || u.u === 'yes' || u.u === 'no') && typeof u.s === 'number';
}

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  tick: 0,
  mode: 'local',
  seat: null,
  applied: 0,
  undoRequest: null,
  error: null,
  sender: null,
  aiPaused: false,
  aiThinking: null,
  aiFast: false,
  aiRunner: false,
  hint: null,

  setAIPaused: (p) => {
    set({ aiPaused: p });
    if (!p) get().runAI();
  },
  setAIFast: (f) => set({ aiFast: f }),

  runAI: () => {
    const st = get();
    if (st.aiThinking !== null || !st.game) return;
    const online = st.mode === 'online';
    // online, one device plays the AI seats, and it holds off while an undo is being voted on
    if (online ? !st.aiRunner || !st.sender || st.undoRequest : st.aiPaused) return;
    const game = st.game;
    const d = aiDecision(game);
    if (!d || (online && d.id === aiSent)) return;
    set({ aiThinking: d.id });
    const started = Date.now();
    askAI(game.setup, game.answers.slice(), d.id).then((k) => {
      const wait = Math.max(0, (get().aiFast ? AI_DELAY_FAST : AI_DELAY) - (Date.now() - started));
      setTimeout(() => {
        set({ aiThinking: null });
        const cur = get();
        // other seats may have moved meanwhile; the answer stands while its decision is still open
        const still = cur.game === game && game.gs.pending.some((x) => x.id === d.id && x.options.some((o) => o.key === k));
        if (!k || !still) return cur.runAI();
        if (!online) {
          if (!cur.aiPaused) cur.answer(d.id, k);
          return;
        }
        if (!cur.aiRunner || !cur.sender || cur.undoRequest) return;
        // applied when it comes back in the log (syncOnline runs the AI again then)
        aiSent = d.id;
        const seat = d.owner >= 0 ? d.owner : humanSeats(game.setup)[0];
        sendOrFail(cur.sender, { d: d.id, k, s: seat }, () => {
          if (aiSent === d.id) aiSent = null;
          setTimeout(() => get().runAI(), 2000);
        });
      }, wait);
    });
  },

  setAIRunner: (on) => {
    if (get().aiRunner === on) return;
    set({ aiRunner: on });
    if (on) setTimeout(() => get().runAI(), 0);
  },

  suggest: (d) => {
    const { game } = get();
    if (!game) return;
    askAI(game.setup, game.answers.slice(), d).then((k) => {
      if (k && get().game === game) set({ hint: { d, k } });
    });
  },

  startLocal: (setup) => {
    const game = newGame(setup);
    save(game);
    set({ game, mode: 'local', seat: null, applied: 0, undoRequest: null, error: null, hint: null, aiThinking: null, tick: get().tick + 1 });
    setTimeout(() => get().runAI(), 0);
  },

  resumeLocal: () => {
    const s = loadSave();
    if (!s) return false;
    try {
      const game = replay(s.setup, s.answers);
      set({ game, mode: 'local', seat: null, applied: 0, undoRequest: null, error: null, hint: null, aiThinking: null, tick: get().tick + 1 });
      setTimeout(() => get().runAI(), 0);
      return true;
    } catch (e) {
      console.warn('Saved game could not be restored', e);
      localStorage.removeItem(SAVE_KEY);
      return false;
    }
  },

  hasSave: () => loadSave() !== null,
  clearSave: () => localStorage.removeItem(SAVE_KEY),

  answer: (d, k) => {
    const { game, mode, seat, sender } = get();
    if (!game) return;
    if (mode === 'online') {
      if (seat === null || !sender) return;
      sender({ d, k, s: seat });
      return;
    }
    if (applyAnswer(game, { d, k })) {
      save(game);
      set({ tick: get().tick + 1, hint: null });
      setTimeout(() => get().runAI(), 0);
    }
  },

  canUndo: () => {
    const { game, mode } = get();
    return mode === 'local' && !!game && game.answers.length > 0;
  },

  undo: () => {
    const { game, mode } = get();
    if (!game || mode !== 'local' || !game.answers.length) return;
    // Undo back past the AI's moves to the last human choice (or one step if all seats are AI).
    let n = game.answers.length - 1;
    const ai = game.setup.ai;
    if (ai?.some(Boolean) && !game.setup.spirits.every((_, i) => ai[i])) {
      const owners = answerOwners(game.setup, game.answers);
      while (n > 0 && owners[n] >= 0 && ai[owners[n]]) n--;
    }
    const g2 = replay(game.setup, game.answers.slice(0, Math.max(0, n)));
    save(g2);
    set({ game: g2, tick: get().tick + 1, hint: null, aiPaused: ai?.some(Boolean) ? true : get().aiPaused });
  },

  requestUndo: () => {
    const { game, mode, seat, sender, undoRequest } = get();
    if (!game || mode !== 'online' || seat === null || !sender || undoRequest || undoTarget(game, game.answers.length) === null) return;
    sender({ u: 'req', n: game.answers.length, s: seat });
  },

  voteUndo: (yes) => {
    const { mode, seat, sender, undoRequest } = get();
    if (mode !== 'online' || seat === null || !sender || !undoRequest || undoRequest.yes.includes(seat)) return;
    sender({ u: yes ? 'yes' : 'no', r: undoRequest.idx, s: seat });
  },

  startOnline: (setup, seat) => {
    const game = newGame(setup);
    aiSent = null;
    set({ game, mode: 'online', seat, applied: 0, undoRequest: null, error: null, hint: null, aiThinking: null, tick: get().tick + 1 });
    setTimeout(() => get().runAI(), 0);
  },

  syncOnline: (log) => {
    const { mode, applied } = get();
    let game = get().game;
    let req = get().undoRequest;
    if (!game || mode !== 'online' || log.length <= applied) return;
    // only people vote on undo; AI seats go along with it
    const humans = humanSeats(game.setup);
    const aiSeat = (s: number | undefined) => s !== undefined && !humans.includes(s);
    const seatOk = (s: number) => humans.includes(s);
    for (let i = applied; i < log.length; i++) {
      const e = log[i];
      if (isAnswer(e)) {
        // a human move that lands cancels a pending undo request (AI moves after it are undone with it)
        if (applyAnswer(game, { d: e.d, k: e.k }, e.s) && !aiSeat(e.s)) req = null;
      } else if (isUndo(e) && seatOk(e.s)) {
        if (e.u === 'req') {
          // the requester saw `n` moves; any moves since then must be AI moves
          const fresh = e.n > 0 && e.n <= game.answers.length && game.answers.slice(e.n).every((a) => aiSeat(a.s));
          if (!req && fresh && undoTarget(game, e.n) !== null) req = { idx: i, n: e.n, by: e.s, yes: [e.s] };
        } else if (req && e.r === req.idx && !req.yes.includes(e.s)) {
          if (e.u === 'no') req = null;
          else req = { ...req, yes: [...req.yes, e.s] };
        }
        if (req && req.yes.length >= humans.length) {
          game = replay(game.setup, game.answers.slice(0, undoTarget(game, req.n) ?? game.answers.length));
          aiSent = null;
          req = null;
        }
      }
    }
    recordGame(game, 'online');
    set({ game, applied: log.length, undoRequest: req, tick: get().tick + 1 });
    if (get().aiRunner) setTimeout(() => get().runAI(), 0);
  },

  setSender: (fn) => {
    set({ sender: fn });
    if (fn) setTimeout(() => get().runAI(), 0);
  },

  quit: () => {
    aiSent = null;
    set({ game: null, applied: 0, seat: null, mode: 'local', undoRequest: null, hint: null, aiThinking: null, aiPaused: false, aiRunner: false, tick: get().tick + 1 });
  },
}));
