// Zustand store wrapping the engine. Views read `game.gs` and call `answer()`.
//
// Solo / hot-seat: answers apply locally, are saved to localStorage (setup + answer
// log), and can be undone by replaying the log minus its last entry.
// Online: answers are sent to the room (networkStore) and applied when they come
// back in the shared action log, so every device applies the same sequence.

import { create } from 'zustand';
import { applyAnswer, newGame, replay } from '../engine/game';
import type { Game, SeatedAnswer } from '../engine/game';
import type { GameSetup } from '../engine/state';

const SAVE_KEY = 'spirit-island:solo:v1';

interface SavedGame {
  setup: GameSetup;
  answers: SeatedAnswer[];
}

export type Mode = 'local' | 'online';

interface GameStore {
  game: Game | null;
  /** re-render counter (the engine mutates state in place) */
  tick: number;
  mode: Mode;
  /** online: which seat this device plays (null = spectator); local: null (controls every seat) */
  seat: number | null;
  /** online: how many log entries have been applied */
  applied: number;
  error: string | null;
  startLocal: (setup: GameSetup) => void;
  resumeLocal: () => boolean;
  hasSave: () => boolean;
  clearSave: () => void;
  answer: (d: number, k: string) => void;
  undo: () => void;
  canUndo: () => boolean;
  startOnline: (setup: GameSetup, seat: number | null) => void;
  /** feed the room's full action log; new entries are applied in order */
  syncOnline: (log: readonly unknown[]) => void;
  /** set by the online bridge: how to send an answer to the room */
  sender: ((a: SeatedAnswer) => void) | null;
  setSender: (fn: ((a: SeatedAnswer) => void) | null) => void;
  quit: () => void;
}

function save(game: Game) {
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

export const useGameStore = create<GameStore>((set, get) => ({
  game: null,
  tick: 0,
  mode: 'local',
  seat: null,
  applied: 0,
  error: null,
  sender: null,

  startLocal: (setup) => {
    const game = newGame(setup);
    save(game);
    set({ game, mode: 'local', seat: null, applied: 0, error: null, tick: get().tick + 1 });
  },

  resumeLocal: () => {
    const s = loadSave();
    if (!s) return false;
    try {
      const game = replay(s.setup, s.answers);
      set({ game, mode: 'local', seat: null, applied: 0, error: null, tick: get().tick + 1 });
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
    const answers = game.answers.slice(0, -1);
    const g2 = replay(game.setup, answers);
    save(g2);
    set({ game: g2, tick: get().tick + 1 });
  },

  startOnline: (setup, seat) => {
    const game = newGame(setup);
    set({ game, mode: 'online', seat, applied: 0, error: null, tick: get().tick + 1 });
  },

  syncOnline: (log) => {
    const { game, mode, applied } = get();
    if (!game || mode !== 'online' || log.length <= applied) return;
    for (let i = applied; i < log.length; i++) {
      const a = log[i];
      if (isAnswer(a)) applyAnswer(game, { d: a.d, k: a.k }, a.s);
    }
    set({ applied: log.length, tick: get().tick + 1 });
  },

  setSender: (fn) => set({ sender: fn }),

  quit: () => set({ game: null, applied: 0, seat: null, mode: 'local', tick: get().tick + 1 }),
}));
