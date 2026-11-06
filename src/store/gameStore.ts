// Zustand store wrapping the engine. Views read `game.gs` and call `answer()`.
//
// Local (solo / hot-seat): answers apply locally, are saved to localStorage (setup +
// answer log), and can be undone by replaying the log minus its last entry.
// Online: answers are sent to the room (networkStore) and applied when they come
// back in the shared action log, so every device applies the same sequence. The log
// also carries undo requests and votes; an undo happens once every seated player
// agrees, identically on every device.

import { create } from 'zustand';
import { applyAnswer, newGame, replay } from '../engine/game';
import type { Game, SeatedAnswer } from '../engine/game';
import type { GameSetup } from '../engine/state';
import { recordGame } from './history';

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
  /** number of applied answers when requested; the last one is undone */
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
  /** set by the online bridge: how to send an entry to the room */
  sender: ((a: OnlineEntry) => void) | null;
  setSender: (fn: ((a: OnlineEntry) => void) | null) => void;
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

  startLocal: (setup) => {
    const game = newGame(setup);
    save(game);
    set({ game, mode: 'local', seat: null, applied: 0, undoRequest: null, error: null, tick: get().tick + 1 });
  },

  resumeLocal: () => {
    const s = loadSave();
    if (!s) return false;
    try {
      const game = replay(s.setup, s.answers);
      set({ game, mode: 'local', seat: null, applied: 0, undoRequest: null, error: null, tick: get().tick + 1 });
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
      set({ tick: get().tick + 1 });
    }
  },

  canUndo: () => {
    const { game, mode } = get();
    return mode === 'local' && !!game && game.answers.length > 0;
  },

  undo: () => {
    const { game, mode } = get();
    if (!game || mode !== 'local' || !game.answers.length) return;
    const g2 = replay(game.setup, game.answers.slice(0, -1));
    save(g2);
    set({ game: g2, tick: get().tick + 1 });
  },

  requestUndo: () => {
    const { game, mode, seat, sender, undoRequest } = get();
    if (!game || mode !== 'online' || seat === null || !sender || undoRequest || !game.answers.length) return;
    sender({ u: 'req', n: game.answers.length, s: seat });
  },

  voteUndo: (yes) => {
    const { mode, seat, sender, undoRequest } = get();
    if (mode !== 'online' || seat === null || !sender || !undoRequest || undoRequest.yes.includes(seat)) return;
    sender({ u: yes ? 'yes' : 'no', r: undoRequest.idx, s: seat });
  },

  startOnline: (setup, seat) => {
    const game = newGame(setup);
    set({ game, mode: 'online', seat, applied: 0, undoRequest: null, error: null, tick: get().tick + 1 });
  },

  syncOnline: (log) => {
    const { mode, applied } = get();
    let game = get().game;
    let req = get().undoRequest;
    if (!game || mode !== 'online' || log.length <= applied) return;
    const players = game.setup.spirits.length;
    const seatOk = (s: number) => Number.isInteger(s) && s >= 0 && s < players;
    for (let i = applied; i < log.length; i++) {
      const e = log[i];
      if (isAnswer(e)) {
        // any move that lands cancels a pending undo request
        if (applyAnswer(game, { d: e.d, k: e.k }, e.s)) req = null;
      } else if (isUndo(e) && seatOk(e.s)) {
        if (e.u === 'req') {
          if (!req && e.n > 0 && e.n === game.answers.length) req = { idx: i, n: e.n, by: e.s, yes: [e.s] };
        } else if (req && e.r === req.idx && !req.yes.includes(e.s)) {
          if (e.u === 'no') req = null;
          else req = { ...req, yes: [...req.yes, e.s] };
        }
        if (req && req.yes.length >= players) {
          game = replay(game.setup, game.answers.slice(0, -1));
          req = null;
        }
      }
    }
    recordGame(game, 'online');
    set({ game, applied: log.length, undoRequest: req, tick: get().tick + 1 });
  },

  setSender: (fn) => set({ sender: fn }),

  quit: () => set({ game: null, applied: 0, seat: null, mode: 'local', undoRequest: null, tick: get().tick + 1 }),
}));
