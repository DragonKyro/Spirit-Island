// Finished games, kept in this browser (newest first).

import { score } from '../engine/game';
import type { Game } from '../engine/game';
import type { AdversaryId, BoardName, SpiritId } from '../engine/types';

const KEY = 'spirit-island:history:v1';
const MAX = 200;

export interface HistoryEntry {
  /** one entry per game (seed + mode); re-finishing after an undo replaces it */
  id: string;
  date: number;
  mode: 'local' | 'online';
  spirits: SpiritId[];
  boards: BoardName[];
  names?: string[];
  adversary: AdversaryId;
  level: number;
  difficulty: number;
  result: 'VICTORY' | 'SACRIFICE_VICTORY' | 'DEFEAT';
  reason: string;
  score: number;
  turns: number;
  terrorLevel: number;
}

export function loadHistory(): HistoryEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list = raw ? (JSON.parse(raw) as HistoryEntry[]) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

export function clearHistory(): void {
  localStorage.removeItem(KEY);
}

/** Record a finished game (no-op while it is still in progress). */
export function recordGame(game: Game, mode: 'local' | 'online'): void {
  const gs = game.gs;
  if (gs.result.kind === 'IN_PROGRESS') return;
  const sc = score(gs);
  const entry: HistoryEntry = {
    id: `${mode}:${game.setup.seed}`,
    date: Date.now(),
    mode,
    spirits: game.setup.spirits,
    boards: game.setup.boards,
    names: game.setup.names,
    adversary: game.setup.adversary,
    level: game.setup.adversaryLevel,
    difficulty: gs.difficulty,
    result: gs.result.kind,
    reason: gs.result.reason,
    score: sc?.total ?? 0,
    turns: gs.turn,
    terrorLevel: gs.fear.terrorLevel,
  };
  try {
    const list = loadHistory().filter((e) => e.id !== entry.id);
    list.unshift(entry);
    localStorage.setItem(KEY, JSON.stringify(list.slice(0, MAX)));
  } catch {
    // storage unavailable
  }
}
