import { describe, it, expect } from 'vitest';
import { NO_ADVERSARY } from '../../src/engine/adversary';
import { setupGame } from '../../src/engine/gameState';
import { createLightning } from '../../src/engine/spirit';
import { advancePhase } from '../../src/engine/turnManager';

describe('turnManager', () => {
  it('runs through full phases without error', () => {
    const state = setupGame({
      spirits: [createLightning()],
      adversary: NO_ADVERSARY,
      adversaryLevel: 0,
    });

    expect(state.phase).toBe('SPIRIT');
    expect(state.result).toBe('IN_PROGRESS');

    // Run multiple phases
    for (let i = 0; i < 25; i++) {
      const still = advancePhase(state);
      if (!still) break;
    }

    // Should have logged events
    expect(state.eventLog.length).toBeGreaterThan(0);
  });

  it('sets up correct starting state', () => {
    const state = setupGame({
      spirits: [createLightning()],
      adversary: NO_ADVERSARY,
      adversaryLevel: 0,
    });

    expect(state.spirits.length).toBe(1);
    expect(state.lands.length).toBe(8);
    expect(state.blightCard).not.toBeNull();
    expect(state.fearSystem.fearPool).toBe(4);
    // Build slot should have the starting explore card
    expect(state.invaderDeck.buildCard).not.toBeNull();
    // Spirit should have 2 starting presences placed
    expect(state.spirits[0].presenceOnBoard).toBe(2);
  });
});
