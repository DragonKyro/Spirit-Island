import { create } from 'zustand';
import { Adversary } from '../engine/adversary';
import { GameState, SetupConfig, makeGameState, setupGame } from '../engine/gameState';
import { Spirit } from '../engine/spirit';
import { advancePhase } from '../engine/turnManager';

interface Store {
  state: GameState;
  tick: number;
  startGame: (spirits: Spirit[], adversary: Adversary, adversaryLevel: number) => void;
  advancePhase: () => void;
  runFullTurn: () => void;
}

export const useGameStore = create<Store>((set) => ({
  state: makeGameState(),
  tick: 0,
  startGame: (spirits: Spirit[], adversary: Adversary, adversaryLevel: number) => {
    const config: SetupConfig = { spirits, adversary, adversaryLevel };
    const next = setupGame(config);
    set({ state: next, tick: 1 });
  },
  advancePhase: () => {
    set((s) => {
      advancePhase(s.state);
      return { state: s.state, tick: s.tick + 1 };
    });
  },
  runFullTurn: () => {
    set((s) => {
      const startTurn = s.state.turnNumber;
      while (s.state.result === 'IN_PROGRESS') {
        const still = advancePhase(s.state);
        if (!still) break;
        if (s.state.turnNumber > startTurn && s.state.phase === 'SPIRIT') break;
      }
      return { state: s.state, tick: s.tick + 1 };
    });
  },
}));
